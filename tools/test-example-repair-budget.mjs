#!/usr/bin/env node
// Offline temporary-fixture tests; no lesson execution, Gemini, or network.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { recordRepairAuthorization, spendRepair, repairAuthorityDirectory } from './example-repair-budget.mjs';

export function testRepairBudget() {
  const repo = mkdtempSync(path.join(tmpdir(), 'scirepl-repair-authority-test-'));
  const evidenceBase = path.join(repo, 'reviews/translation-pilot2');
  const dir = path.join(evidenceBase, 'es', 'fixture');
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(repo, 'workbooks/en'), { recursive: true });
  const sourceBytes = Buffer.from('Reviewed synthetic fixture, never executed.\n');
  const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
  writeFileSync(path.join(repo, 'workbooks/en/fixture.srwb'), sourceBytes);
  const file = path.join(dir, 'repair-budget.json');
  const predecessors = [{ stage: 'markdown', errors: [{ error: 'old gate' }] }, { stage: 'protocol', error: 'old parse' }];
  writeFileSync(file, JSON.stringify({ limit: 2, used: 2, history: predecessors }, null, 2) + '\n');
  const previousBytes = readFileSync(file), book = { id: 'fixture', locale: 'es', sourceHash, dir };
  const options = { repo, evidenceBase };
  const scope = { locale: 'es', workbook: 'fixture', sourceSha256: sourceHash };
  const authorization = { id: 'catalog-held-correction-fixture', authority: 'Synthetic explicit authorization fixture', scope: [scope] };
  let checks = 0;
  const check = (name, fn) => { fn(); checks++; console.log('[PASS] ' + name); };
  try {
    check('default third repair denied without mutating history', () => {
      assert.throws(() => spendRepair(options, [book], {}), /exhausted/);
      assert.deepEqual(readFileSync(file), previousBytes);
    });
    check('wrong source cannot acquire authority', () => {
      assert.throws(() => recordRepairAuthorization(options, { ...authorization,
        scope: [{ ...scope, sourceSha256: '0'.repeat(64) }] }), /source hash/);
    });
    check('unknown locale cannot acquire authority', () => {
      assert.throws(() => recordRepairAuthorization(options, { ...authorization,
        scope: [{ ...scope, locale: 'xx' }] }), /locale/);
    });
    const recordPath = recordRepairAuthorization(options, authorization), recordBytes = readFileSync(recordPath);
    check('recording authority leaves prior repair budget byte-identical', () => assert.deepEqual(readFileSync(file), previousBytes));
    check('wrong locale cannot spend scoped third repair', () => {
      assert.throws(() => spendRepair(options, [{ ...book, locale: 'fr' }], {}), /authorization/);
      assert.deepEqual(readFileSync(file), previousBytes);
    });
    check('wrong source cannot spend scoped third repair', () => {
      assert.throws(() => spendRepair(options, [{ ...book, sourceHash: '0'.repeat(64) }], {}), /authorization/);
      assert.deepEqual(readFileSync(file), previousBytes);
    });
    check('same authorization id cannot be re-granted', () => {
      assert.throws(() => recordRepairAuthorization(options, authorization), /re-grant/);
      assert.deepEqual(readFileSync(recordPath), recordBytes);
    });
    check('new authorization id cannot re-grant same edition', () => {
      assert.throws(() => recordRepairAuthorization(options, { ...authorization, id: 'another-held-correction-fixture' }), /re-grant/);
    });
    spendRepair(options, [book], { stage: 'markdown-resume', errors: ['new corrective attempt'] });
    const budget = JSON.parse(readFileSync(file)), thirdBytes = readFileSync(file);
    check('exact scoped third allowed once with immutable predecessors', () => {
      assert.equal(budget.limit, 3); assert.equal(budget.used, 3);
      assert.deepEqual(budget.history.slice(0, 2), predecessors);
      assert.equal(budget.history[2].authorizationId, authorization.id);
      assert.deepEqual(budget.history[2].scope, scope);
      assert.deepEqual(readFileSync(recordPath), recordBytes);
      assert.equal(readdirSync(repairAuthorityDirectory(repo)).filter(n => n.startsWith('consumed-')).length, 1);
    });
    check('fourth repair denied and third history remains byte-identical', () => {
      assert.throws(() => spendRepair(options, [book], {}), /fourth attempt/);
      assert.deepEqual(readFileSync(file), thirdBytes);
    });
    check('restart or rolled-back counter cannot re-spend consumed authority', () => {
      writeFileSync(file, previousBytes); // Controlled fixture simulates interruption/counter rollback.
      assert.throws(() => spendRepair(options, [book], {}), error => error.code === 'EEXIST');
      assert.deepEqual(readFileSync(file), previousBytes);
      assert.deepEqual(readFileSync(recordPath), recordBytes);
    });
    check('changing current English source invalidates recorded authority', () => {
      writeFileSync(path.join(repo, 'workbooks/en/fixture.srwb'), 'Changed fixture source.\n');
      assert.throws(() => spendRepair(options, [book], {}), /English source changed/);
    });
    return checks;
  } finally {
    // Exact freshly created fixture directory only; no user data is removed.
    rmSync(repo, { recursive: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname)
  console.log(`PASS: ${testRepairBudget()} offline append-only authorization checks; no AI calls.`);
