#!/usr/bin/env node
// Data-only compatibility tests. Synthetic suffixes are NOT new runtime or
// translation evidence. No workbook/report writes or model calls.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { MARKOV_MIXING_HISTORY_PREDECESSOR, MARKOV_MIXING_RETAINED_FIELDS, MARKOV_MIXING_SUFFIX_NAMES,
  pinnedMarkovHistoryBytes, pinnedMarkovCore, projectMarkovHistoricalCore,
  assertMarkovMixingBaselineBytes, markovHistoricalEditionContext } from './markov-mixing-history.mjs';

export function testMixingHistory() {
  let checks = 0;
  const check = action => { action(); checks++; };
  const suffix = MARKOV_MIXING_SUFFIX_NAMES.map((name, index) => ({ name,
    type: index % 2 === 0 ? 'markdown' : 'code', language: index % 2 === 0 ? 'markdown' : 'python', code: 'fixture' }));
  const extended = locale => { const book = pinnedMarkovCore(locale); book.notebook.cells.push(...structuredClone(suffix)); return book; };
  for (const locale of EXAMPLE_LOCALES) {
    const baseline = pinnedMarkovCore(locale), original = JSON.stringify(baseline), book = extended(locale);
    check(() => assert.deepEqual(projectMarkovHistoricalCore(baseline, locale), baseline));
    check(() => assert.deepEqual(projectMarkovHistoricalCore(book, locale), baseline));
    check(() => assert.deepEqual(assertMarkovMixingBaselineBytes(
      pinnedMarkovHistoryBytes(`workbooks/${locale}/markov-groups.srwb`), locale), baseline));
    check(() => assert.deepEqual(assertMarkovMixingBaselineBytes(JSON.stringify(book), locale), baseline));
    check(() => assert.throws(() => assertMarkovMixingBaselineBytes(JSON.stringify(baseline), locale), /bytes changed/));
    check(() => assert.equal(JSON.stringify(baseline), original));
    check(() => assert.equal(book.notebook.cells.length, 19));
    const receipt = JSON.parse(pinnedMarkovHistoryBytes(`reviews/examples/${locale}/markov-groups.json`));
    const ordinary = markovHistoricalEditionContext({ review: receipt, source: pinnedMarkovCore('en'), target: baseline, locale });
    check(() => assert.deepEqual(ordinary.review, receipt));
    const current = structuredClone(receipt); current.mixingUpdate = { predecessorCommit: MARKOV_MIXING_HISTORY_PREDECESSOR };
    // These would be replaced by the real full-19 metadata/manifest recorder;
    // legacy context must replay pinned history, not mistake them for old data.
    current.source.sha256 = '0'.repeat(64); current.target.sha256 = '1'.repeat(64);
    if (current.translation) current.translation.contentAudit.targetSha256 = '2'.repeat(64);
    const context = markovHistoricalEditionContext({ review: current, source: extended('en'), target: book, locale });
    check(() => assert.deepEqual(context.review, receipt));
    check(() => assert.deepEqual(context.source, pinnedMarkovCore('en')));
    check(() => assert.deepEqual(context.target, baseline));
    check(() => assert.throws(() => markovHistoricalEditionContext({ review: receipt,
      source: extended('en'), target: book, locale }), /separate mixing receipt/));
    check(() => assert.throws(() => markovHistoricalEditionContext({ review: current,
      source: pinnedMarkovCore('en'), target: baseline, locale }), /13-cell checks/));
    for (const mutate of [book => { book.notebook.cells.pop(); },
      book => { book.notebook.cells.push(structuredClone(suffix[0])); },
      book => { book.notebook.cells[13].name = 'forged_extension'; },
      book => { book.notebook.cells[14].type = 'markdown'; },
      book => { book.notebook.cells[14].language = 'javascript'; },
      book => { book.notebook.cells[13].code = ''; },
      book => { book.notebook.cells[13].metadata = { forged: true }; },
      book => { book.notebook.cells[0].code += '\nChanged core'; },
      book => { book.notebook.cells[2].code += '\nprint("Changed core")'; },
      book => { book.notebook.cells[2].metadata = { forged: true }; },
      book => { book.notebook.name += ' Changed container'; },
      book => { book.mixingUpdate = { forged: true }; }]) {
      const broken = structuredClone(book); mutate(broken);
      check(() => assert.throws(() => projectMarkovHistoricalCore(broken, locale)));
      check(() => assert.throws(() => assertMarkovMixingBaselineBytes(JSON.stringify(broken), locale)));
    }
    for (const field of MARKOV_MIXING_RETAINED_FIELDS) {
      const changed = structuredClone(current); changed[field] = { forged: true };
      check(() => assert.throws(() => markovHistoricalEditionContext({ review: changed,
        source: extended('en'), target: book, locale }), /Retained historical receipt changed/));
    }
  }
  check(() => assert.throws(() => projectMarkovHistoricalCore(pinnedMarkovCore('en'), 'unknown'), /locale/));
  check(() => assert.throws(() => projectMarkovHistoricalCore({ format: 'ipynb', notebook: { cells: [] } }, 'en'), /SRWB-only/));
  return checks;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(`${testMixingHistory()} historical-core projection/receipt-preservation checks passed; data only, no workbook execution or writes.`);
