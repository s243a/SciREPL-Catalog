#!/usr/bin/env node
// Offline pinned-source/split/protocol checks. Never calls a model or writes a
// workbook, source-prose file, or translation evidence.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MARKOV_STAGE4_PREDECESSOR, MARKOV_STAGE4_PARTS, STAGE4_ORIGINAL_FORMULA,
  STAGE4_EXPLICIT_FORMULA, STAGE4_RUN_ORDER_OLD, STAGE4_RUN_ORDER_NEW, assertStage4Parts, expectedStage4, splitStage4Code,
  stage4ProposalValues, gateStage4Parts } from './markov-stage4.mjs';

export function testStage4(repo = path.resolve(new URL('..', import.meta.url).pathname)) {
  let checks = 0;
  const check = action => { action(); checks++; };
  const pinned = locale => JSON.parse(execFileSync('git', ['show',
    `${MARKOV_STAGE4_PREDECESSOR}:workbooks/${locale}/markov-groups.srwb`], { cwd: repo, encoding: 'utf8' }));
  const source = pinned('en');
  const parts = { matrix: '## New matrix explanation', sticker: '### New sticker explanation', trajectory: '### New trajectory explanation' };
  check(() => assert.deepEqual(assertStage4Parts(parts), parts));
  for (const broken of [{ ...parts, extra: 'Not authorized' }, { matrix: parts.matrix },
    { ...parts, sticker: 0 }, { ...parts, matrix: '' }, { ...parts, matrix: '<img>' },
    { ...parts, matrix: '```python\nprint(1)\n```' }, { ...parts, trajectory: '\uFFFD' }])
    check(() => assert.throws(() => assertStage4Parts(broken)));
  const locales = ['en', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt-BR', 'ru', 'zh'];
  for (const locale of locales) {
    const old = pinned(locale), before = JSON.stringify(old), expected = expectedStage4(old, parts);
    check(() => assert.equal(expected.notebook.cells.length, 13));
    check(() => assert.deepEqual(expected.notebook.cells.slice(1, 6), old.notebook.cells.slice(1, 6)));
    check(() => assert.equal(expected.notebook.cells[0].code,
      old.notebook.cells[0].code.replace(STAGE4_RUN_ORDER_OLD, STAGE4_RUN_ORDER_NEW)));
    const prefix = structuredClone(expected.notebook.cells.slice(0, 6));
    prefix[0].code = prefix[0].code.replace(STAGE4_RUN_ORDER_NEW, STAGE4_RUN_ORDER_OLD);
    check(() => assert.deepEqual(prefix, old.notebook.cells.slice(0, 6)));
    check(() => assert.deepEqual(expected.notebook.cells[12], old.notebook.cells[8]));
    check(() => assert.deepEqual(expected.notebook.cells.slice(6, 12).map(cell => cell.name),
      ['markov_bridge', 'transition_matrix', 'sticker_bridge', 'sticker_step', 'trajectory_bridge', 'random_walk']));
    check(() => assert.equal([7, 9, 11].map(index => expected.notebook.cells[index].code).join('\n\n')
      .replace(STAGE4_EXPLICIT_FORMULA, STAGE4_ORIGINAL_FORMULA), old.notebook.cells[7].code));
    const blocks = old.notebook.cells[7].code.split('\n\n');
    check(() => assert.equal(expected.notebook.cells[9].code, blocks[1]));
    check(() => assert.equal(expected.notebook.cells[11].code, blocks[2]));
    check(() => assert.equal(JSON.stringify(old), before));
    const restored = structuredClone(expected); restored.notebook.cells = old.notebook.cells;
    check(() => assert.deepEqual(restored, old));
  }
  for (const mutate of [book => { book.notebook.cells.pop(); },
    book => { book.notebook.cells[0].code = book.notebook.cells[0].code.replace(STAGE4_RUN_ORDER_OLD, 'show_turn'); },
    book => { book.notebook.cells[0].code += STAGE4_RUN_ORDER_OLD; },
    book => { book.notebook.cells[6].name = 'other'; },
    book => { book.notebook.cells[7].type = 'markdown'; },
    book => { book.notebook.cells[7].language = 'javascript'; },
    book => { book.notebook.cells[7].code += '\n\nprint(0)'; },
    book => { book.notebook.cells[7].code = book.notebook.cells[7].code.replace(STAGE4_ORIGINAL_FORMULA, 'T = IDENTITY'); },
    book => { book.notebook.cells[7].code = book.notebook.cells[7].code.replace('size=12', 'size=13'); }]) {
    const broken = structuredClone(source); mutate(broken);
    check(() => assert.throws(() => expectedStage4(broken, parts)));
  }
  check(() => assert.equal(splitStage4Code(source.notebook.cells[7].code).length, 3));
  const wrongSource = expectedStage4(source, parts); wrongSource.notebook.cells[0].code += ' Unrelated intro drift';
  check(() => assert.throws(() => assert.deepEqual(wrongSource, expectedStage4(source, parts))));
  const good = { entries: MARKOV_STAGE4_PARTS.map(part => ({ book: 'markov-groups', field: part.field, text: parts[part.key] })) };
  check(() => assert.deepEqual(stage4ProposalValues(good), parts));
  check(() => assert.deepEqual(stage4ProposalValues({ entries: [...good.entries].reverse() }), parts));
  for (const mutate of [review => { review.extra = []; }, review => { review.entries.pop(); },
    review => { review.entries.push(good.entries[0]); }, review => { review.entries[0].book = 'other'; },
    review => { review.entries[0].field = 'markdown:0'; }, review => { review.entries[0].field = 'title'; },
    review => { review.entries[1] = review.entries[0]; }, review => { review.entries[0].extra = 'not allowed'; },
    review => { review.entries[0].text = { text: parts.matrix }; }]) {
    const broken = structuredClone(good); mutate(broken);
    check(() => assert.throws(() => stage4ProposalValues(broken)));
  }
  const gates = { cleanText: text => text, markdownKeeps: text => text.match(/\d+/g) || [],
    markdownAudit: (source, target) => source === target ? ['untranslated'] : [], scriptRule: /[áéíóú]/ };
  const targetParts = { matrix: 'Explicación matriz', sticker: 'Explicación posición', trajectory: 'Explicación trayectoria' };
  const targetReview = { entries: MARKOV_STAGE4_PARTS.map(part => ({ book: 'markov-groups', field: part.field, text: targetParts[part.key] })) };
  check(() => assert.deepEqual(gateStage4Parts(targetReview, parts, gates), targetParts));
  check(() => assert.throws(() => gateStage4Parts(good, parts, gates), /untranslated English/));
  const numeric = structuredClone(targetReview); numeric.entries[0].text += ' 13';
  check(() => assert.throws(() => gateStage4Parts(numeric, parts, gates), /KEEP drift/));
  check(() => assert.throws(() => gateStage4Parts(targetReview, parts, { ...gates, scriptRule: /\p{Script=Cyrillic}/u }), /missing locale script/));
  check(() => assert.throws(() => gateStage4Parts(targetReview, parts, {})));
  const pipeline = path.join(repo, 'tools/translate-example-prose.mjs');
  const scopeArgs = ['--locale', 'es', '--refresh-markdown-cell', 'stage4',
    '--workbooks', 'markov-groups', '--evidence', 'reviews/translations/markov-stage4-offline-never-created'];
  const invalidFlags = [
    { args: ['--refresh-markdown-cell', 'stage4-typo'], error: /never fall through to whole-workbook translation/ },
    { args: [...scopeArgs, '--self-test'], error: /cannot combine with self-test/ },
    { args: [...scopeArgs, '--repair-markdown'], error: /cannot combine with repair-markdown/ },
    { args: [...scopeArgs, '--coordinate-controller-proposal', 'unauthorized'], error: /coordinates/ },
    { args: ['--refresh-markdown-cell', 'stage4', '--workbooks', 'other'], error: /markov-groups/ },
    { args: ['--refresh-markdown-cell', 'stage4', '--workbooks', 'markov-groups', '--evidence', 'reviews/translations/stale'],
      error: /isolated cell-refresh evidence/ },
  ];
  for (const invalid of invalidFlags) check(() => assert.throws(() => execFileSync(process.execPath,
    [pipeline, ...invalid.args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] }), error => {
      assert.equal(error.status, 1);
      assert.match(String(error.stderr), invalid.error);
      return true;
    }));
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(`Stage 4: ${testStage4()} offline preservation/protocol/gate checks passed; no model calls or workbook writes.`);
