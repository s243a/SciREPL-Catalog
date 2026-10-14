#!/usr/bin/env node
// Offline refinement checks only; never writes a workbook or calls a model.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MARKOV_STAGE4_PARTS } from './markov-stage4.mjs';
import { applyStage4MathDirection, unwrappedStage4Parts,
  STAGE4_MATH_OPEN, STAGE4_MATH_CLOSE } from './markov-stage4-math-direction.mjs';

export function testStage4MathDirection() {
  let checks = 0;
  const check = action => { action(); checks++; };
  // Source formulas are protected identically in every locale. Using English
  // as an Arabic fixture avoids depending on whether Arabic was published yet.
  const raw = JSON.parse(readFileSync(new URL('../workbooks/en/markov-groups.srwb', import.meta.url), 'utf8'));
  const before = JSON.stringify(raw), wrapped = applyStage4MathDirection(raw, 'ar');
  check(() => assert.equal(JSON.stringify(raw), before));
  check(() => assert.deepEqual(applyStage4MathDirection(wrapped, 'ar', { reverse: true }), raw));
  check(() => assert.deepEqual(unwrappedStage4Parts(wrapped, 'ar'),
    Object.fromEntries(MARKOV_STAGE4_PARTS.map(part => [part.key, raw.notebook.cells[part.index].code]))));
  const allStage4 = MARKOV_STAGE4_PARTS.map(part => wrapped.notebook.cells[part.index].code).join('\n');
  check(() => assert.equal(allStage4.split(STAGE4_MATH_OPEN).length - 1, 4));
  check(() => assert.equal(allStage4.split(STAGE4_MATH_CLOSE).length - 1, 4));
  for (const part of MARKOV_STAGE4_PARTS) check(() => assert.deepEqual(
    wrapped.notebook.cells[part.index].code.match(/\$\$[\s\S]*?\$\$/g),
    raw.notebook.cells[part.index].code.match(/\$\$[\s\S]*?\$\$/g)));
  for (const locale of ['en', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt-BR', 'ru', 'zh']) {
    check(() => assert.deepEqual(applyStage4MathDirection(raw, locale), raw));
    check(() => assert.deepEqual(applyStage4MathDirection(raw, locale, { reverse: true }), raw));
  }
  for (const index of [0, 1, 2, 3, 4, 5, 7, 9, 11, 12])
    check(() => assert.deepEqual(wrapped.notebook.cells[index], raw.notebook.cells[index]));
  check(() => assert.throws(() => applyStage4MathDirection(wrapped, 'ar')));
  check(() => assert.throws(() => applyStage4MathDirection(raw, 'ar', { reverse: true })));
  for (const mutate of [book => { book.notebook.cells[6].name = 'unknown'; },
    book => { book.notebook.cells[6].code = book.notebook.cells[6].code.replace(STAGE4_MATH_OPEN, '<div dir="rtl">\n\n'); },
    book => { book.notebook.cells[6].code = book.notebook.cells[6].code.replace(STAGE4_MATH_CLOSE, '\n</div>'); },
    book => { book.notebook.cells[6].code += '\n' + STAGE4_MATH_OPEN + '$$x=1$$' + STAGE4_MATH_CLOSE; },
    book => { book.notebook.cells[8].code = book.notebook.cells[8].code.replace('T_{d,j}', 'T_{j,d}'); },
    book => { book.notebook.cells[10].code += '<section>Unknown wrapper</section>'; }]) {
    const broken = structuredClone(wrapped); mutate(broken);
    check(() => assert.throws(() => applyStage4MathDirection(broken, 'ar', { reverse: true })));
  }
  const missing = structuredClone(raw); missing.notebook.cells[6].code = missing.notebook.cells[6].code.replace(/\$\$[\s\S]*?\$\$/, '');
  check(() => assert.throws(() => applyStage4MathDirection(missing, 'ar')));
  check(() => assert.throws(() => applyStage4MathDirection(raw, 'unknown')));
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(`Stage 4 math direction: ${testStage4MathDirection()} offline checks passed; no model calls or workbook writes.`);
