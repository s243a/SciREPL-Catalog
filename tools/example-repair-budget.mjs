// Controller-owned, append-only authority for ONE additional held-edition
// correction. This module performs no model calls or workbook writes.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const bytes = data => JSON.stringify(data, null, 2) + '\n';
const locales = new Set(['ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt-BR', 'ru', 'zh']);
export const repairAuthorityDirectory = repo => path.join(repo, 'reviews/translation-pilot2/repair-authorizations');
const budgetPath = book => path.join(book.dir, 'repair-budget.json');
function budgetOf(book) {
  const budget = existsSync(budgetPath(book)) ? read(budgetPath(book)) : { limit: 2, used: 0, history: [] };
  assert(Array.isArray(budget.history), 'Repair history must be an array');
  assert.equal(budget.used, budget.history.length, 'Repair counter differs from immutable history');
  assert([2, 3].includes(budget.limit), 'Unexpected repair limit');
  assert(budget.history.length <= 3, 'Repair history exceeds the absolute three-attempt cap');
  return budget;
}
function safeEvidence(repo, evidenceBase) {
  const resolved = path.resolve(evidenceBase);
  assert(resolved.startsWith(path.resolve(repo) + path.sep), 'Evidence must remain inside repository');
  return resolved;
}
function scopeBook(repo, evidenceBase, scope) {
  assert.deepEqual(Object.keys(scope).sort(), ['locale', 'sourceSha256', 'workbook']);
  assert(locales.has(scope.locale), 'Unsupported authorization locale');
  assert.match(scope.workbook, /^[a-z][a-z0-9-]*$/);
  assert.match(scope.sourceSha256, /^[a-f0-9]{64}$/);
  const sourcePath = path.join(repo, 'workbooks/en', scope.workbook + '.srwb');
  assert.equal(sha(readFileSync(sourcePath)), scope.sourceSha256, 'Authorization source hash is not the current English source');
  return { id: scope.workbook, locale: scope.locale, sourceHash: scope.sourceSha256,
    dir: path.join(evidenceBase, scope.locale, scope.workbook) };
}
function authorities(repo) {
  const directory = repairAuthorityDirectory(repo);
  return existsSync(directory) ? readdirSync(directory).filter(file => /^authorization-.*\.json$/.test(file))
    .map(file => ({ file: path.join(directory, file), record: read(path.join(directory, file)) })) : [];
}
export function recordRepairAuthorization({ repo, evidenceBase }, authorization) {
  const base = safeEvidence(repo, evidenceBase);
  assert.deepEqual(Object.keys(authorization).sort(), ['authority', 'id', 'scope']);
  assert.match(authorization.id, /^[a-z][a-z0-9-]{3,100}$/);
  assert.equal(typeof authorization.authority, 'string');
  assert(authorization.authority.trim(), 'Record the explicit human authorization');
  assert(Array.isArray(authorization.scope) && authorization.scope.length, 'Specify explicit held-edition scope');
  const directory = repairAuthorityDirectory(repo);
  mkdirSync(directory, { recursive: true });
  const output = path.join(directory, 'authorization-' + authorization.id + '.json');
  assert(!existsSync(output), 'Authorization is already recorded; re-grant is forbidden');
  const existing = authorities(repo), seen = new Set();
  for (const scope of authorization.scope) {
    const book = scopeBook(repo, base, scope), key = scope.locale + '/' + scope.workbook;
    assert(!seen.has(key), 'Duplicate held-edition authorization'); seen.add(key);
    assert(!existing.some(({ record }) => record.scope.some(item => item.locale === scope.locale && item.workbook === scope.workbook)),
      'This edition already has an extra authorization; re-grant is forbidden');
    assert.equal(budgetOf(book).used, 2, 'Extra authorization requires an existing exhausted two-attempt history');
  }
  const record = { schema: 1, ...authorization, evidenceBase: path.relative(repo, base), extraRepairs: 1 };
  writeFileSync(output, bytes(record), { flag: 'wx' });
  return output;
}
function extraAuthority(repo, book) {
  const matches = authorities(repo).filter(({ record }) => record.scope.some(scope =>
    scope.locale === book.locale && scope.workbook === book.id && scope.sourceSha256 === book.sourceHash)
    && path.join(repo, record.evidenceBase, book.locale, book.id) === path.resolve(book.dir));
  assert.equal(matches.length, 1, book.id + ': two shared repair rounds exhausted; no exact source/locale/book authorization');
  const selected = matches[0];
  assert.equal(selected.record.extraRepairs, 1);
  assert.equal(sha(readFileSync(path.join(repo, 'workbooks/en', book.id + '.srwb'))), book.sourceHash,
    'Authorized English source changed');
  return selected;
}
export function spendRepair({ repo }, books, reason) {
  const plans = books.map(book => {
    const budget = budgetOf(book);
    assert(budget.used < 3, book.id + ': three shared repair rounds exhausted; fourth attempt forbidden');
    const authorization = budget.used === 2 ? extraAuthority(repo, book) : null;
    if (authorization) assert.equal(books.length, 1, 'Extra held correction must be a single-book attempt');
    return { book, budget, authorization };
  });
  for (const { book, budget, authorization } of plans) {
    assert.deepEqual(budgetOf(book), budget, 'Repair history changed during preflight; refuse overwriting it');
    const previousBytes = existsSync(budgetPath(book)) ? readFileSync(budgetPath(book)) : null;
    const entry = authorization ? { ...reason, authorizationId: authorization.record.id,
      authorizationSha256: sha(readFileSync(authorization.file)),
      scope: { locale: book.locale, workbook: book.id, sourceSha256: book.sourceHash } } : reason;
    if (authorization) {
      const consumed = path.join(repairAuthorityDirectory(repo), 'consumed-' + sha(book.locale + '/' + book.id) + '.json');
      // Exclusive creation consumes authority BEFORE any outbound model call.
      // A crash cannot restore authority or cause a hidden fourth request.
      writeFileSync(consumed, bytes({ schema: 1, authorizationId: authorization.record.id,
        scope: entry.scope, previousBudgetSha256: sha(previousBytes), entry }), { flag: 'wx' });
    }
    const history = [...budget.history, entry];
    assert.deepEqual(history.slice(0, -1), budget.history, 'Previous repair history must remain immutable');
    writeFileSync(budgetPath(book), bytes({ limit: authorization || budget.limit === 3 ? 3 : 2,
      used: history.length, history }));
  }
}
