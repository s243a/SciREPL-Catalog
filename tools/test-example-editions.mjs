#!/usr/bin/env node
// Offline reproducibility gate for the compact review receipts. It reads
// workbook data but never executes it. Browser runs are a separate gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_LOCALES, EXAMPLE_DESCRIPTIONS } from './example-lessons.mjs';
import { assertCoordinateSvgInvariants, splitCoordinateDiagrams } from './markov-coordinate-diagrams.mjs';
import { annotateMoveCycles, cycleCommentLabels, withoutCycleComments } from './markov-cycle-comments.mjs';
import { MARKOV_LAYOUT_PREDECESSOR } from './markov-layout-addenda.mjs';
import { MARKOV_TABLE_REFINEMENTS, refineLayoutTables } from './markov-table-refinements.mjs';
import { MARKOV_STAGE4_PREDECESSOR, MARKOV_STAGE4_PARTS, STAGE4_ORIGINAL_FORMULA,
  STAGE4_EXPLICIT_FORMULA, STAGE4_RUN_ORDER_OLD, STAGE4_RUN_ORDER_NEW,
  expectedStage4, loadStage4Parts } from './markov-stage4.mjs';
import { assertStage4Rendering, assertStage4Runtime } from './record-markov-stage4-update.mjs';
import { applyStage4MathDirection } from './markov-stage4-math-direction.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2), i = args.indexOf('--locale');
const locales = i < 0 ? EXAMPLE_LOCALES : [args[i + 1]];
for (const locale of locales) assert(EXAMPLE_LOCALES.includes(locale));
const read = rel => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
const sha = rel => createHash('sha256').update(readFileSync(path.join(root, rel))).digest('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const pinnedCache = new Map();
const pinned = rel => {
  if (!pinnedCache.has(rel)) pinnedCache.set(rel, execFileSync('git', ['show', `${MARKOV_STAGE4_PREDECESSOR}:${rel}`], { cwd: root }));
  return pinnedCache.get(rel);
};
function keeps(text) {
  const fences = [...text.matchAll(/```[^\n]*\n[\s\S]*?```/g)].map(m => m[0]);
  const prose = text.replace(/```[^\n]*\n[\s\S]*?```/g, '');
  return { fences, inline: [...prose.matchAll(/`([^`\n]+)`/g)].map(m => m[1]).sort(),
    math: [...prose.matchAll(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g)].map(m => m[0]),
    urls: [...prose.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]).sort(),
    numbers: [...text.matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]).sort() };
}
const run = (tool, argv) => execFileSync(process.execPath, [path.join(root, 'tools', tool), ...argv],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
let count = 0;
for (const lesson of Object.keys(EXAMPLE_DESCRIPTIONS)) for (const locale of locales) {
  const review = read(`reviews/examples/${locale}/${lesson}.json`);
  const sourcePath = `workbooks/en/${lesson}.srwb`, targetPath = `workbooks/${locale}/${lesson}.srwb`;
  assert.equal(review.schema, 1); assert.equal(review.locale, locale); assert.equal(review.lesson, lesson);
  assert.deepEqual(review.source, { path: sourcePath, sha256: sha(sourcePath) });
  assert.equal(review.target.path, targetPath); assert.equal(review.target.sha256, sha(targetPath));
  assert.equal(review.target.size, readFileSync(path.join(root, targetPath)).length);
  const en = read(sourcePath), xx = read(targetPath);
  const stage4 = lesson === 'markov-groups' ? review.stage4Update : null;
  const historicalTarget = stage4 ? JSON.parse(pinned(targetPath)) : xx;
  const historicalSource = stage4 ? JSON.parse(pinned(sourcePath)) : en;
  assert.equal(review.target.title, xx.notebook.name); assert(review.target.description.trim());
  assert.deepEqual(Object.keys(xx).sort(), ['format', 'notebook', 'version']);
  assert.equal(xx.format, 'srwb'); assert.equal(xx.version, '1.0');
  assert.deepEqual(Object.keys(xx.notebook).sort(), ['cells', 'name']);
  assert.equal(xx.notebook.cells.length, en.notebook.cells.length);
  const names = new Set();
  for (let index = 0; index < en.notebook.cells.length; index++) {
    const a = en.notebook.cells[index], b = xx.notebook.cells[index];
    assert.deepEqual(Object.keys(b).sort(), ['code', 'language', 'name', 'type']);
    assert(!names.has(b.name)); names.add(b.name);
    for (const key of ['name', 'type', 'language']) assert.equal(a[key], b[key]);
    assert(!b.code.includes('\uFFFD'));
    if (a.type === 'markdown') assert.deepEqual(keeps(a.code), keeps(b.code));
  }
  if (locale !== 'en') {
    assert.equal(review.translation.nativeSpeakerReview, 'pending');
    assert.equal(review.translation.contentAudit.status, 'passed');
    assert.equal(review.translation.contentAudit.sourceSha256, review.source.sha256);
    assert.equal(review.translation.contentAudit.targetSha256, review.target.sha256);
    const manifest = JSON.parse(run('span-derive.mjs', [sourcePath, targetPath, locale]));
    assert.deepEqual(manifest, review.translation.manifest, 'Authoritative span manifest changed');
    const sourceCandidates = JSON.parse(run('span-apply.mjs', ['candidates', sourcePath])).candidates;
    const targetCandidates = new Map(JSON.parse(run('span-apply.mjs', ['candidates', targetPath])).candidates.map(c => [c.id, c]));
    const candidateIds = new Set(sourceCandidates.map(c => c.id));
    const kept = new Set(review.translation.keeps.ids);
    assert.equal(kept.size, review.translation.keeps.ids.length);
    for (const id of kept) assert(candidateIds.has(id), 'Stale/unknown KEEP id: ' + id);
    for (const id of review.translation.policy.protectedIds) {
      assert(candidateIds.has(id), 'Stale/unknown protected id: ' + id);
      assert(kept.has(id));
    }
    for (const candidate of sourceCandidates.filter(c => kept.has(c.id))) {
      assert.equal(targetCandidates.get(candidate.id)?.text, candidate.text, 'Protected/kept candidate changed');
    }
    const lint = [sourcePath, '--lint', targetPath, '--strict'];
    for (const text of review.translation.keeps.texts) lint.push('--allow', text);
    run('span-scan.mjs', lint);
  } else assert.equal(review.translation, null);
  assert.equal(review.browser.status, 'passed'); assert.equal(review.browser.deterministic, true);
  for (const record of [review.browser.first, review.browser.second, ...review.browser.englishBaseline]) {
    assert.match(record.exportSha256, /^[a-f0-9]{64}$/); assert.match(record.reportSha256, /^[a-f0-9]{64}$/);
    assert.equal(record.cells, historicalSource.notebook.cells.length); assert.equal(record.blockedRequests, 0); assert.equal(record.pageErrors, 0);
  }
  assert(review.browser.textOracle.first.pass && review.browser.textOracle.second.pass);
  assert.equal(review.browser.plotData.status, 'passed');
  if (lesson === 'markov-groups') {
    const historicalSourceSha256 = stage4 ? digest(pinned(sourcePath)) : review.source.sha256;
    const historicalTargetSha256 = stage4 ? digest(pinned(targetPath)) : review.target.sha256;
    if (stage4) {
      const previous = JSON.parse(pinned(`reviews/examples/${locale}/${lesson}.json`));
      assert.equal(stage4.predecessorCommit, MARKOV_STAGE4_PREDECESSOR);
      assert.equal(stage4.predecessorSourceSha256, historicalSourceSha256);
      assert.equal(stage4.predecessorTargetSha256, historicalTargetSha256);
      assert.equal(stage4.historicalEvidence.predecessorReceiptSha256, digest(pinned(`reviews/examples/${locale}/${lesson}.json`)));
      assert.equal(stage4.historicalEvidence.cells, 9); assert.equal(historicalSource.notebook.cells.length, 9);
      assert.deepEqual(stage4.historicalEvidence.retainedFields, ['browser', 'coordinateUpdate', 'cyclesUpdate', 'layoutUpdate']);
      for (const key of ['coordinateUpdate', 'cyclesUpdate', 'layoutUpdate'])
        assert.deepEqual(review[key], previous[key], 'Historical receipt was changed: ' + key);
      const browser = structuredClone(review.browser); browser.caveat = previous.browser.caveat;
      assert.deepEqual(browser, previous.browser, 'Historical nine-cell executable evidence was changed');
      assert.equal(review.target.title, previous.target.title); assert.equal(review.target.description, previous.target.description);
    }
    const layout = review.layoutUpdate;
    const priorMarkdown = index => {
      const part = layout?.addenda.find(part => part.index === index);
      return part ? historicalTarget.notebook.cells[index].code.slice(0, part.prefixCodeUnits) : historicalTarget.notebook.cells[index].code;
    };
    assert.equal(review.browser.scope, 'prior-revision-runtime');
    assert.match(review.browser.checkedSourceSha256, /^[a-f0-9]{64}$/);
    assert.match(review.browser.checkedTargetSha256, /^[a-f0-9]{64}$/);
    assert.notEqual(review.browser.checkedSourceSha256, review.source.sha256);
    assert.notEqual(review.browser.checkedTargetSha256, review.target.sha256);
    const update = review.coordinateUpdate;
    assert.equal(update.cell, 'coordinates');
    assert.equal(update.finalSourceSha256, review.cyclesUpdate?.predecessorSourceSha256 || historicalSourceSha256);
    assert.equal(update.finalTargetSha256, review.cyclesUpdate?.predecessorTargetSha256 || historicalTargetSha256);
    assert.notEqual(update.generationSourceSha256, update.finalSourceSha256);
    assert.match(update.generationSourceSha256, /^[a-f0-9]{64}$/);
    assert.match(update.preGeometryTargetSha256, /^[a-f0-9]{64}$/);
    assert.equal(update.proseSha256, createHash('sha256')
      .update(splitCoordinateDiagrams(priorMarkdown(1)).prose).digest('hex'));
    assert.equal(update.layoutOnlyRefinement, true);
    assert.equal(update.unchangedExecutableAndOtherCells, true);
    assert.equal(update.nativeSpeakerReview, locale === 'en' ? 'not-applicable' : 'pending');
    assert.equal(update.rendering.status, 'passed');
    assert.equal(update.rendering.workbookSha256, update.finalTargetSha256);
    assert.equal(update.rendering.sha256, sha(update.rendering.path));
    const rendering = read(update.rendering.path), records = rendering.tests.filter(test => test.locale === locale);
    assert.equal(rendering.tests.length, EXAMPLE_LOCALES.length * 2);
    assert.deepEqual(records.map(test => test.theme).sort(), ['dark', 'light']);
    for (const record of records) {
      assert(record.passed); assert.equal(record.workbookSha256, update.finalTargetSha256);
      assert.equal(record.rendered.cells, 9); assert.equal(record.rendered.codeExecuted, false);
      assert.equal(record.rendered.diagrams.length, 2);
      for (const svg of record.rendered.diagrams) {
        assert.equal(svg.unsafe, 0); assert.equal(svg.external, false);
        assert(svg.title && svg.description); assert(svg.width <= record.rendered.bodyWidth);
      }
    }
    assertCoordinateSvgInvariants(xx.notebook.cells[1].code);
    if (review.cyclesUpdate) {
      const cycle = review.cyclesUpdate;
      assert.equal(cycle.cell, 'cycles'); assert.equal(cycle.sourceSha256, layout?.predecessorSourceSha256 || historicalSourceSha256);
      assert.equal(cycle.targetSha256, layout?.predecessorTargetSha256 || historicalTargetSha256); assert.equal(cycle.unchangedExecutableAndOtherCells, true);
      assert.equal(cycle.cyclesCellSha256, createHash('sha256').update(priorMarkdown(4)).digest('hex'));
      assert.equal(cycle.preservedCoordinateCellSha256, createHash('sha256').update(priorMarkdown(1)).digest('hex'));
      assert.equal(cycle.nativeSpeakerReview, locale === 'en' ? 'not-applicable' : 'pending');
      assert.equal(cycle.rendering.status, 'passed'); assert.equal(cycle.rendering.workbookSha256, cycle.targetSha256);
      assert.equal(cycle.rendering.sha256, sha(cycle.rendering.path));
      const rendered = read(cycle.rendering.path), checks = rendered.tests.filter(test => test.locale === locale);
      assert.equal(rendered.tests.length, EXAMPLE_LOCALES.length * 2);
      assert.deepEqual(checks.map(test => test.theme).sort(), ['dark', 'light']);
      for (const check of checks) {
        assert(check.passed); assert.equal(check.workbookSha256, cycle.targetSha256);
        assert.equal(check.rendered.cells, 9); assert.equal(check.rendered.codeExecuted, false);
        assert(check.rendered.cycles.textLength > 0 && check.rendered.cycles.paragraphCount >= 7);
        assert.equal(check.rendered.cycles.unsafe, 0);
        assert(check.rendered.cycles.width <= check.rendered.bodyWidth);
        assert(check.rendered.cycles.scrollWidth <= check.rendered.bodyWidth);
      }
    }
    if (layout) {
      const digest = value => createHash('sha256').update(value).digest('hex');
      const serialized = value => JSON.stringify(value, null, 2) + '\n';
      assert.equal(layout.predecessorCommit, MARKOV_LAYOUT_PREDECESSOR);
      assert.equal(layout.sourceSha256, historicalSourceSha256); assert.equal(layout.targetSha256, historicalTargetSha256);
      assert.equal(layout.unchangedPriorMarkdownAndSvg, true);
      assert.equal(layout.nativeSpeakerReview, locale === 'en' ? 'not-applicable' : 'pending');
      assert.equal(layout.modelReviewScope, 'supplied-new-Markdown-addenda-only');
      assert.equal(layout.addenda.length, 2);
      assert.deepEqual(layout.addenda.map(part => [part.cell, part.index]), [['coordinates', 1], ['cycles', 4]]);
      for (const part of layout.addenda) {
        assert(Number.isInteger(part.prefixCodeUnits) && part.prefixCodeUnits > 0);
        const current = historicalTarget.notebook.cells[part.index].code;
        assert(current.length > part.prefixCodeUnits);
        assert.equal(part.preservedPrefixSha256, digest(priorMarkdown(part.index)));
        assert.equal(part.appendedTextSha256, digest(current.slice(part.prefixCodeUnits)));
        assert.equal(part.currentCellSha256, digest(current));
      }
      const generation = structuredClone(historicalTarget);
      generation.notebook.cells[2].code = withoutCycleComments(generation.notebook.cells[2].code);
      const refinement = layout.headerRefinement;
      const originalGeneration = refinement ? refineLayoutTables(generation, locale, { reverse: true }) : generation;
      assert.equal(digest(serialized(originalGeneration)), layout.generationTargetSha256);
      if (refinement) {
        assert.equal(refinement.method, 'controller-rendered-table-header-wrap'); assert.equal(refinement.modelRequests, 0);
        assert.equal(refinement.generationTargetSha256, layout.generationTargetSha256);
        assert.equal(refinement.refinedGenerationSha256, digest(serialized(generation)));
        assert.deepEqual(refinement.changes, MARKOV_TABLE_REFINEMENTS[locale]);
        assert.deepEqual(refineLayoutTables(originalGeneration, locale), generation);
        assert.equal(refinement.nativeSpeakerReview, 'pending');
      }
      const annotations = annotateMoveCycles(generation.notebook.cells[2].code, cycleCommentLabels(historicalTarget.notebook.cells[4].code));
      assert.equal(annotations.code, historicalTarget.notebook.cells[2].code); assert.equal(annotations.comments.length, 30);
      assert.equal(layout.comments.count, 30); assert.deepEqual(layout.comments.labels, annotations.labels);
      assert.equal(layout.comments.method, 'controller-reused-localized-Markdown-labels');
      assert.equal(layout.comments.nativeSpeakerReview, locale === 'en' ? 'not-applicable' : 'pending');
      assert.equal(layout.comments.unchangedNumericCyclesAndRemainingPython, true);
      assert.equal(layout.comments.generationCellSha256, digest(generation.notebook.cells[2].code));
      assert.equal(layout.comments.finalCellSha256, digest(historicalTarget.notebook.cells[2].code));
      const predecessor = structuredClone(originalGeneration);
      for (const part of layout.addenda) predecessor.notebook.cells[part.index].code = priorMarkdown(part.index);
      assert.equal(digest(serialized(predecessor)), layout.predecessorTargetSha256);
      if (locale === 'en') {
        assert.equal(layout.generationSourceSha256, layout.generationTargetSha256);
        assert.equal(layout.predecessorSourceSha256, layout.predecessorTargetSha256);
      }
      assert.equal(layout.rendering.sha256, sha(layout.rendering.path));
      assert.equal(layout.rendering.workbookSha256, historicalTargetSha256);
      const render = read(layout.rendering.path), runs = render.tests.filter(test => test.locale === locale);
      assert.equal(render.tests.length, EXAMPLE_LOCALES.length * 2);
      assert.deepEqual(runs.map(test => test.theme).sort(), ['dark', 'light']);
      for (const run of runs) {
        assert(run.passed); assert.equal(run.workbookSha256, historicalTargetSha256);
        assert.equal(run.rendered.cells, 9); assert.equal(run.rendered.codeExecuted, false);
        for (const [table, rows] of [['numbering', 7], ['grouping', 3]]) {
          assert.equal(run.rendered[table].rows.length, rows);
          assert(run.rendered[table].rows.every(row => row.length === 3));
          assert(run.rendered[table].scrollWidth <= run.rendered.bodyWidth);
        }
        assert.equal(run.rendered.cycles.unsafe, 0); assert.equal(run.rendered.diagrams.length, 2);
      }
    }
    if (stage4) {
      assert.equal(stage4.sourceSha256, review.source.sha256); assert.equal(stage4.targetSha256, review.target.sha256);
      assert.equal(stage4.cells, 13); assert.equal(en.notebook.cells.length, 13); assert.equal(xx.notebook.cells.length, 13);
      const sourceParts = loadStage4Parts();
      const generation = applyStage4MathDirection(xx, locale, { reverse: true });
      const targetParts = Object.fromEntries(MARKOV_STAGE4_PARTS.map(part => [part.key, generation.notebook.cells[part.index].code]));
      assert.deepEqual(en, expectedStage4(historicalSource, sourceParts), 'English Stage 4 drift from approved pinned construction');
      assert.deepEqual(generation, expectedStage4(historicalTarget, targetParts), 'Locale changed outside approved Stage 4 construction');
      assert.deepEqual(xx, applyStage4MathDirection(generation, locale), 'Not the exact Arabic-only math-direction refinement');
      assert.equal(stage4.generationTargetSha256, digest(JSON.stringify(generation, null, 2) + '\n'));
      if (locale === 'ar') {
        assert.notEqual(stage4.generationTargetSha256, review.target.sha256);
        assert.deepEqual(stage4.mathDirectionRefinement, { method: 'controller-math-direction-ltr', modelRequests: 0,
          locale, generationTargetSha256: stage4.generationTargetSha256, targetSha256: review.target.sha256, wrappers: 4,
          scope: 'Four trusted LTR wrappers around unchanged Stage 4 display formulas; Arabic prose stays RTL',
          nativeSpeakerReview: 'pending', unchangedSourceMathAndProse: true });
      } else {
        assert.equal(stage4.mathDirectionRefinement, null); assert.equal(stage4.generationTargetSha256, review.target.sha256);
      }
      assert.deepEqual(stage4.sourceProse, { path: 'tools/markov-stage4-text.json', sha256: sha('tools/markov-stage4-text.json') });
      assert.deepEqual(stage4.parts, MARKOV_STAGE4_PARTS.map(part => ({ ...part,
        sourceMarkdownSha256: digest(sourceParts[part.key]), targetMarkdownSha256: digest(targetParts[part.key]),
        currentMarkdownSha256: digest(xx.notebook.cells[part.index].code),
        codeCellSha256: digest(xx.notebook.cells[part.index + 1].code) })));
      assert.deepEqual(stage4.intro, { cell: 'intro', method: 'exact-inline-code-run-order-insertion',
        from: STAGE4_RUN_ORDER_OLD, to: STAGE4_RUN_ORDER_NEW,
        predecessorCellSha256: digest(historicalTarget.notebook.cells[0].code), currentCellSha256: digest(xx.notebook.cells[0].code) });
      assert.deepEqual(stage4.preserved, { firstSixExceptIntro: true, takeaways: true, coordinatesCyclesAndSvg: true,
        localizedPythonCommentsAndOutputLabels: true, metadata: true });
      assert.deepEqual(stage4.executable, { method: 'split-pinned-Python-and-exact-sum-to-loop-substitution',
        predecessorFormulaSha256: digest(STAGE4_ORIGINAL_FORMULA), currentFormulaSha256: digest(STAGE4_EXPLICIT_FORMULA),
        numericalEquivalence: 'local-preinstalled-NumPy', pythonAppRuntime: 'not-run' });
      assert.equal(stage4.nativeSpeakerReview, locale === 'en' ? 'not-applicable' : 'pending');
      assert.equal(stage4.modelReviewScope, 'supplied-three-new-Markdown-fields-only');
      if (locale === 'en') {
        assert.equal(stage4.method, 'controller-authored'); assert.equal(stage4.model, null);
        assert.equal(stage4.requests, null); assert.equal(stage4.modelProseApproved, false);
      } else {
        assert(['Gemini-draft-and-fresh-same-model-review', 'controller-manual-fallback-after-model-failure'].includes(stage4.method));
        assert.equal(stage4.requests.draft, 1); assert.equal(stage4.requests.repair, 0);
        assert([0, 1].includes(stage4.requests.freshReview));
        assert.equal(stage4.modelProseApproved, stage4.method === 'Gemini-draft-and-fresh-same-model-review');
        if (stage4.modelProseApproved) assert.equal(stage4.requests.freshReview, 1);
        const previous = JSON.parse(pinned(`reviews/examples/${locale}/${lesson}.json`));
        assert.deepEqual(review.translation.contentAudit.provenance, { predecessorCommit: MARKOV_STAGE4_PREDECESSOR,
          predecessorSourceSha256: historicalSourceSha256, predecessorTargetSha256: historicalTargetSha256,
          priorAuditSha256: digest(JSON.stringify(previous.translation.contentAudit)), stage4ThreeMarkdownFieldsOnly: true,
          reviewMethod: stage4.method, modelProseApproved: stage4.modelProseApproved });
        assert.deepEqual(review.translation.keeps.texts, previous.translation.keeps.texts);
        assert.deepEqual(review.translation.policy.protectedTexts, previous.translation.policy.protectedTexts);
      }
      const rendered = stage4.rendering;
      assert.equal(rendered.status, 'passed'); assert.equal(rendered.path, 'reviews/markov-stage4-rendering.json');
      assert.equal(rendered.sha256, sha(rendered.path)); assert.equal(rendered.workbookSha256, review.target.sha256);
      assert.equal(rendered.pythonExecuted, false);
      const renderReport = read(rendered.path);
      assert.equal(rendered.platform, renderReport.platform); assert.equal(rendered.scope, renderReport.scope);
      assert.deepEqual(rendered.viewport, renderReport.viewport);
      assertStage4Rendering(renderReport, locale, review.target.sha256);
      const runtime = stage4.runtime;
      assert.equal(runtime.status, 'passed'); assert.equal(runtime.path, 'reviews/markov-stage4-runtime.json');
      assert.equal(runtime.sha256, sha(runtime.path)); assert.equal(runtime.workbookSha256, review.target.sha256);
      assert.equal(runtime.platform, 'local-preinstalled-NumPy'); assert.equal(runtime.executedLocale, 'en');
      assert.equal(runtime.pythonAppRuntime, 'not-run');
      const runtimeReport = read(runtime.path);
      assert.equal(runtime.numpyVersion, runtimeReport.numpyVersion);
      assertStage4Runtime(runtimeReport, locale, review.target.sha256, historicalTargetSha256);
      for (const report of [renderReport, runtimeReport])
        assert(!JSON.stringify(report).includes('/home/'), 'Private host path leaked into public Stage 4 report');
    }
  }
  if (lesson === 'oil-shocks-demand') {
    assert.equal(review.browser.plotData.count, 3);
    assert.equal(review.browser.renderedReview, 'controller-AI-reviewed');
    const rendering = review.browser.rendering;
    assert.equal(rendering.status, 'passed');
    assert.equal(rendering.nativeSpeakerReview, 'pending');
    assert.equal(rendering.captures.length, 2);
    for (const [index, capture] of rendering.captures.entries()) {
      assert.equal(capture.reportSha256, index === 0 ? review.browser.first.reportSha256 : review.browser.second.reportSha256);
      assert.equal(capture.pngs.length, 3);
      for (const [plotIndex, png] of capture.pngs.entries()) {
        assert.equal(png.index, plotIndex);
        assert.match(png.sha256, /^[a-f0-9]{64}$/);
        assert(Number.isInteger(png.width) && png.width > 0);
        assert(Number.isInteger(png.height) && png.height > 0);
      }
    }
  }
  assert(!JSON.stringify(review).includes('/home/'), 'Private host path leaked into public receipt');
  assert(!JSON.stringify(review).includes('reviews/translation-pilot'), 'Private evidence path leaked into public receipt');
  count++; console.log(`[PASS] ${lesson}/${locale}: hashes, names, Markdown invariants, code spans and review receipts`);
}
console.log(`${count} reviewed example editions verified without workbook execution.`);
