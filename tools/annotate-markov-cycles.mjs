#!/usr/bin/env node
// Mechanical, comment-only annotation after the frozen translation campaign.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { annotateMoveCycles, cycleCommentLabels } from './markov-cycle-comments.mjs';
import { refineLayoutTables } from './markov-table-refinements.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const campaign = 'reviews/translations/markov-layout-addenda-20261007';
const apply = process.argv.includes('--apply');
assert(process.argv.slice(2).every(arg => ['--apply', '--check'].includes(arg)));
assert(!(apply && process.argv.includes('--check')));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const updates = EXAMPLE_LOCALES.map(locale => {
  const artifact = path.join(root, `workbooks/${locale}/markov-groups.srwb`);
  const bytes = readFileSync(artifact), book = JSON.parse(bytes);
  const cell = book.notebook.cells[2];
  assert.equal(cell.name, 'cube_moves');
  const result = annotateMoveCycles(cell.code, cycleCommentLabels(book.notebook.cells[4].code));
  const snapshot = path.join(root, campaign, locale, 'markov-groups', 'layout.generation.srwb');
  if (apply && locale !== 'en') {
    const generated = JSON.parse(readFileSync(path.join(root, campaign, locale, 'markov-groups', 'layout.refresh.json')));
    assert.equal(generated.status, 'static-gates-passed');
    const generationBytes = existsSync(snapshot) ? readFileSync(snapshot) : bytes;
    assert.equal(sha(generationBytes), generated.targetSha256, 'Translation campaign must finish before annotation');
  }
  if (!apply) assert.equal(cell.code, result.code, locale + ': 30 comments missing or changed');
  if (apply && existsSync(snapshot)) {
    const generatedBook = JSON.parse(readFileSync(snapshot));
    const refinementReceipt = path.join(path.dirname(snapshot), 'layout.render-refinement.json');
    const expected = existsSync(refinementReceipt) ? refineLayoutTables(generatedBook, locale) : structuredClone(generatedBook);
    expected.notebook.cells[2].code = annotateMoveCycles(expected.notebook.cells[2].code,
      cycleCommentLabels(expected.notebook.cells[4].code)).code;
    assert.deepEqual(book, expected, 'Refuse replay with unrelated changed bytes');
  }
  cell.code = result.code;
  return { locale, artifact, bytes, book, snapshot };
});
// Validate all thirteen artifacts before any workbook is changed.
for (const update of updates) {
  if (apply && !existsSync(update.snapshot)) {
    mkdirSync(path.dirname(update.snapshot), { recursive: true });
    writeFileSync(update.snapshot, update.bytes, { flag: 'wx' });
  }
  if (apply) writeFileSync(update.artifact, JSON.stringify(update.book, null, 2) + '\n');
  console.log(`[PASS] ${update.locale}: 30 localized geometry comments; move arrays and other code intact`);
}
