#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MIXING_PREDECESSOR, MIXING_PARTS, mixingPinned, mixingRepo, mixingParts, mixingCode,
  expectedMixing, assertMixingPreservation } from './markov-mixing-addendum.mjs';
import { assertMarkovMixingBaselineBytes } from './markov-mixing-history.mjs';
let checks = 0;
const check = fn => { fn(); checks++; };
const locales = ['en', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt-BR', 'ru', 'zh'];
for (const locale of locales) {
  const predecessor = JSON.parse(mixingPinned(locale)), copy = structuredClone(predecessor);
  const candidate = expectedMixing(predecessor);
  check(() => assert.deepEqual(predecessor, copy));
  check(() => assertMixingPreservation(predecessor, candidate));
  check(() => assertMarkovMixingBaselineBytes(readFileSync(`${mixingRepo}/workbooks/${locale}/markov-groups.srwb`), locale));
  for (const mutate of [book => { book.notebook.cells[0].code += ' drift'; },
    book => { book.notebook.name += ' drift'; }, book => { book.notebook.cells.pop(); },
    book => { book.notebook.cells[14].name = 'other'; }]) {
    const broken = structuredClone(candidate); mutate(broken);
    check(() => assert.throws(() => assertMixingPreservation(predecessor, broken)));
  }
}
const draft = JSON.parse(readFileSync(`${mixingRepo}/drafts/markov-mixing/en/markov-groups.srwb`));
check(() => assert.deepEqual(draft, expectedMixing(JSON.parse(mixingPinned('en')), mixingParts(), mixingCode())));
const fields = JSON.parse(readFileSync(`${mixingRepo}/drafts/markov-mixing/translation-fields.json`));
check(() => assert.equal(fields.predecessorCommit, MIXING_PREDECESSOR));
check(() => assert.deepEqual(fields.markdown.map(value => value.field), MIXING_PARTS.map(part => `markdown:${part.index}`)));
check(() => assert.equal(new Set(fields.candidates.map(value => value.id)).size, fields.candidates.length));
check(() => assert.equal(fields.workerEntries.length, 30));
check(() => assert.equal(new Set(fields.workerEntries.map(value => value.field)).size, 30));
check(() => assert(fields.candidates.every(value => Number(value.id.split(':')[0]) >= 13)));
check(() => assert(fields.protectedCandidates.every(value => Number(value.id.split(':')[0]) >= 13)));
check(() => assert(!fields.candidates.some(value => ['type', 'bar', '<br>', 'Viridis'].includes(value.text))));
const jointText = mixingParts().joint;
check(() => assert(jointText.includes('4 × 6 = 24') && jointText.includes('8 × 3 = 24')));
check(() => assert(jointText.includes('24 × 24 = 576') && jointText.includes('24 × 21 = 504')));
check(() => assert(jointText.includes('1..24') && jointText.includes('NOT the original cube IDs')));
for (const [face, ids] of [['1–4: U (up)', '0, 2, 6, 8'], ['5–8: D (down)', '9, 11, 15, 17'],
  ['9–12: F (front)', '18, 20, 24, 26'], ['13–16: B (back)', '27, 29, 33, 35'],
  ['17–20: L (left)', '36, 38, 42, 44'], ['21–24: R (right)', '45, 47, 51, 53']]) {
  check(() => assert(jointText.includes(`| ${face} | \`${ids}\` |`)));
}
console.log(`${checks} pinned-core/translation-scope/negative preservation checks passed; shipped workbooks unchanged.`);
