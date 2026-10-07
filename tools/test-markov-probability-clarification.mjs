#!/usr/bin/env node
// Exact localized Markdown update checks; no model calls or workbook execution.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { MARKOV_PROBABILITY_PREDECESSOR, applyProbabilityClarification,
  clarifiedStage4Parts, GENERAL_PROBABILITY_MATH, ONE_HOT_PROBABILITY_MATH } from './markov-probability-clarification.mjs';
import { applyStage4MathDirection } from './markov-stage4-math-direction.mjs';

let checks = 0;
const check = action => { action(); checks++; };
const read = file => JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const pinned = file => JSON.parse(execFileSync('git', ['show', `${MARKOV_PROBABILITY_PREDECESSOR}:${file}`]));
for (const locale of EXAMPLE_LOCALES) {
  const path = `workbooks/${locale}/markov-groups.srwb`, prior = pinned(path), before = JSON.stringify(prior);
  const current = read(path), expected = applyProbabilityClarification(prior, locale);
  check(() => assert.deepEqual(current, expected));
  check(() => assert.equal(JSON.stringify(prior), before));
  const raw = applyStage4MathDirection(current, locale, { reverse: true });
  const code = raw.notebook.cells[8].code;
  check(() => assert(code.includes(GENERAL_PROBABILITY_MATH)));
  check(() => assert(code.includes(ONE_HOT_PROBABILITY_MATH)));
  check(() => assert.equal((code.match(/\$\$/g) || []).length, 4));
  for (const token of ['`SOLVED[0] = 1`', '`SOLVED[5] = 6`', '`j = 0`', '`location_probability[0] = 1`'])
    check(() => assert(code.includes(token)));
  check(() => assert(!code.includes('=T_{d,0}')));
  for (let index = 0; index < current.notebook.cells.length; index++)
    if (index !== 8) check(() => assert.deepEqual(current.notebook.cells[index], prior.notebook.cells[index]));
  for (const mutate of [book => { book.notebook.cells[9].code += '\nprint("drift")'; },
    book => { book.notebook.cells[8].code += '\nUnknown prose'; },
    book => { book.notebook.cells[0].name = 'other'; }]) {
    const bad = structuredClone(prior); mutate(bad);
    check(() => assert.throws(() => applyProbabilityClarification(bad, locale)));
  }
}
check(() => assert.deepEqual(read('tools/markov-stage4-text.json'), clarifiedStage4Parts));
check(() => assert.throws(() => applyProbabilityClarification(read('workbooks/en/markov-groups.srwb'), 'unknown')));
console.log(`${checks} probability-clarification checks passed; code unchanged, no model requests.`);
