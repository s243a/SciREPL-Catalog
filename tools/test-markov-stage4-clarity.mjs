#!/usr/bin/env node
// Read-only exact controller-prose/preservation regressions. No model/runtime.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { MARKOV_CLARITY_PREDECESSOR, MARKOV_CLARITY_KEYS, clarityStage4Parts,
  applyStage4Clarity, assertClarityProse } from './markov-stage4-clarity.mjs';
import { CLARITY_CELLS, assertClarityBooks, clarityFormulas,
  assertClarityReportAdditions } from './record-markov-stage4-clarity.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
export function testStage4Clarity({ deriveOnly = false } = {}) {
  let checks = 0;
  const check = action => { action(); checks++; };
  const pinned = file => JSON.parse(execFileSync('git', ['show', `${MARKOV_CLARITY_PREDECESSOR}:${file}`], { cwd: root }));
  const read = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
  const source = applyStage4Clarity(pinned('workbooks/en/markov-groups.srwb'), 'en');
  const prose = read('tools/markov-stage4-clarity.json');
  check(() => assert.deepEqual(Object.keys(clarityStage4Parts).sort(), ['matrix', 'sticker', 'trajectory']));
  for (const [key, index] of [['matrix', 6], ['sticker', 8], ['trajectory', 10]])
    check(() => assert.equal(source.notebook.cells[index].code, clarityStage4Parts[key]));
  if (!deriveOnly) check(() => assert.deepEqual(read('tools/markov-stage4-text.json'), clarityStage4Parts));
  for (const locale of EXAMPLE_LOCALES) {
    check(() => assert.deepEqual(Object.keys(prose[locale]).sort(), [...MARKOV_CLARITY_KEYS].sort()));
    check(() => assert.deepEqual(assertClarityProse(prose[locale], locale), prose[locale]));
    const file = `workbooks/${locale}/markov-groups.srwb`, prior = pinned(file), before = JSON.stringify(prior);
    const expected = applyStage4Clarity(prior, locale);
    check(() => assertClarityBooks(prior, expected, locale));
    check(() => assert.equal(JSON.stringify(prior), before));
    if (!deriveOnly) check(() => assert.deepEqual(read(file), expected));
    check(() => assert.deepEqual(clarityFormulas(expected), clarityFormulas(source)));
    for (let index = 0; index < prior.notebook.cells.length; index++)
      if (!CLARITY_CELLS.includes(index)) check(() => assert.deepEqual(expected.notebook.cells[index], prior.notebook.cells[index]));
    check(() => assert(expected.notebook.cells[12].code.startsWith(prior.notebook.cells[12].code + '\n\n')));
    const restored = structuredClone(expected);
    for (const index of CLARITY_CELLS) restored.notebook.cells[index].code = prior.notebook.cells[index].code;
    check(() => assert.deepEqual(restored, prior));
    for (const mutate of [book => { book.notebook.cells[9].code += '\nprint("drift")'; },
      book => { book.notebook.cells[4].code += '\nUnknown prose'; },
      book => { book.notebook.cells[6].code += '\nUnknown clarity prose'; },
      book => { book.notebook.cells[8].code = book.notebook.cells[8].code.replace('T_{d,i}', 'T_{i,d}'); },
      book => { book.notebook.cells[12].code = 'Changed prefix\n' + book.notebook.cells[12].code; },
      book => { book.notebook.name += ' drift'; }, book => { book.notebook.cells[0].name = 'other'; }]) {
      const broken = structuredClone(expected); mutate(broken);
      check(() => assert.throws(() => assertClarityBooks(prior, broken, locale)));
    }
    const badPrior = structuredClone(prior); badPrior.notebook.cells[0].code += '\nUnreviewed drift';
    check(() => assert.throws(() => applyStage4Clarity(badPrior, locale)));
  }
  for (const mutate of [values => { values.extra = 'Unknown'; }, values => { delete values.hint; },
    values => { values.counts += ' 999'; }, values => { values.example += '\nUnknown'; },
    values => { values.hint += '<section>unsafe</section>'; }, values => { values.vertices += '\uFFFD'; }]) {
    const broken = structuredClone(prose.en); mutate(broken);
    check(() => assert.throws(() => assertClarityProse(broken, 'en')));
  }
  check(() => assert.throws(() => assertClarityProse(prose.en, 'es')));
  // Unit fixtures exercise only the additional fields, not browser/runtime
  // certification. Real reports must also pass assertClarityReports's full gates.
  const renderFixture = { tests: ['dark', 'light'].map(theme => ({ locale: 'en', theme,
    rendered: { takeaways: { textLength: 100, unsafe: 0, preserved: true } },
    reimported: { takeaways: { textLength: 100, unsafe: 0, preserved: true } } })) };
  const runtimeFixture = { clarityPredecessorCommit: MARKOV_CLARITY_PREDECESSOR,
    perMovePositionZeroDestinationsPassed: true, cornerStickerOrbitSize: 24,
    cornerUniformStationaryPassed: true, cornerLongRunNumericalCheckPassed: true };
  check(() => assertClarityReportAdditions(renderFixture, runtimeFixture, 'en'));
  const scrollingFixture = structuredClone(renderFixture);
  for (const run of scrollingFixture.tests)
    run.reimported.takeaways.scrolling = { before: 0, after: 42, scrollHeight: 200, clientHeight: 100 };
  const scrollingBefore = structuredClone(scrollingFixture);
  check(() => assertClarityReportAdditions(scrollingFixture, runtimeFixture, 'en'));
  check(() => assert.deepEqual(scrollingFixture, scrollingBefore));
  for (const mutate of [report => { report.tests[0].rendered.takeaways.preserved = false; },
    report => { report.tests[0].reimported.takeaways.preserved = false; },
    report => { report.tests[0].reimported.takeaways.unsafe = 1; },
    report => { report.tests[1].reimported.takeaways.textLength = 0; },
    report => { report.tests[1].reimported.takeaways.textLength++; },
    report => { report.tests[1].rendered.takeaways.textLength++; }]) {
    const broken = structuredClone(scrollingFixture); mutate(broken);
    check(() => assert.throws(() => assertClarityReportAdditions(broken, runtimeFixture, 'en')));
  }
  for (const key of Object.keys(runtimeFixture)) {
    const broken = { ...runtimeFixture, [key]: key === 'clarityPredecessorCommit' ? 'unknown' : false };
    check(() => assert.throws(() => assertClarityReportAdditions(renderFixture, broken, 'en')));
  }
  check(() => assert.throws(() => applyStage4Clarity(pinned('workbooks/en/markov-groups.srwb'), 'unknown')));
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2); assert(args.every(arg => arg === '--derive-only'));
  const deriveOnly = args.includes('--derive-only');
  console.log(`${testStage4Clarity({ deriveOnly })} Stage 4 clarity checks passed${deriveOnly ? ' (derivation only; current files not certified)' : ''}; no model calls or workbook execution.`);
}
