#!/usr/bin/env node
// Record the approved Stage 4 split without rewriting historical evidence.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { MARKOV_STAGE4_PREDECESSOR, MARKOV_STAGE4_PARTS, STAGE4_ORIGINAL_FORMULA,
  STAGE4_EXPLICIT_FORMULA, STAGE4_RUN_ORDER_OLD, STAGE4_RUN_ORDER_NEW,
  expectedStage4, loadStage4Parts } from './markov-stage4.mjs';
import { applyStage4MathDirection } from './markov-stage4-math-direction.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = 'reviews/translations/markov-stage4-20261007';
const renderPath = 'reviews/markov-stage4-rendering.json';
const runtimePath = 'reviews/markov-stage4-runtime.json';
const prosePath = 'tools/markov-stage4-text.json';
const sourcePath = 'workbooks/en/markov-groups.srwb';
const sha = value => createHash('sha256').update(value).digest('hex');
const serialized = book => Buffer.from(JSON.stringify(book, null, 2) + '\n');
const bytes = file => readFileSync(path.join(root, file));
const json = file => JSON.parse(bytes(file));
const pinned = file => execFileSync('git', ['show', `${MARKOV_STAGE4_PREDECESSOR}:${file}`], { cwd: root });
const tool = (name, args) => execFileSync(process.execPath, [path.join(root, 'tools', name), ...args],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

export function assertStage4Rendering(report, locale, targetSha256) {
  assert.equal(report.tests.length, EXAMPLE_LOCALES.length * 2);
  assert.equal(new Set(report.tests.map(run => run.locale + '/' + run.theme)).size, report.tests.length);
  assert.deepEqual([...new Set(report.tests.map(run => run.locale))].sort(), [...EXAMPLE_LOCALES].sort());
  assert.deepEqual(report.viewport, { width: 320, height: 844 });
  assert.deepEqual(report.formulaVisualReview, { passed: true, expectedSets: 26, reviewedSets: 26, failedSets: [],
    scope: 'Controller visual review of all four formulas in each locale/theme; not native-prose review' });
  const runs = report.tests.filter(run => run.locale === locale);
  assert.deepEqual(runs.map(run => run.theme).sort(), ['dark', 'light']);
  for (const run of runs) {
    assert.equal(run.passed, true); assert.equal(run.workbookSha256, targetSha256);
    assert.equal(run.formulaVisualReview, true);
    assert(run.assertions.includes('all Python and Markdown source exact after export and reimport'));
    for (const key of ['external', 'runtimes', 'errors', 'dialogs']) assert.deepEqual(run[key], []);
    for (const rendered of [run.rendered, run.reimported]) {
      assert.equal(rendered.cellCount, 13); assert.equal(rendered.theme, run.theme);
      assert.equal(rendered.codeOutputs, 0); assert.equal(rendered.kernelReady, false);
      assert.deepEqual(rendered.calls, { ensureReady: 0, execute: 0, rerun: 0 });
      assert.equal(rendered.diagrams, 2); assert.equal(rendered.stage.length, 3);
      for (const [index, part] of MARKOV_STAGE4_PARTS.entries()) {
        const item = rendered.stage[index];
        assert.equal(item.name, part.name); assert.equal(item.nextCellName, part.codeName);
        assert.equal(item.nextCardCellName, part.codeName);
        if (locale === 'ar') assert.equal(item.bodyDirection, 'rtl');
        assert(item.textLength > 180); assert(item.paragraphs.length >= (index === 0 ? 4 : 3));
        assert(item.mathCount >= (index === 1 ? 2 : 1)); assert.equal(item.mathErrors, 0);
        assert(item.math.length >= (index === 1 ? 2 : 1));
        assert.equal(item.rawDisplayDelimiters, false); assert.equal(item.unsafeElements, 0);
        assert.deepEqual(item.unsafeAttributes, []);
        assert(item.width > 200 && item.width <= 320); assert(item.scrollWidth <= item.width + 1);
        for (const p of item.paragraphs) {
          assert(p.width <= item.width + 1 && p.scrollWidth <= item.width + 1);
          assert(p.bottom > p.top && p.lineHeight > 0);
        }
        for (let p = 1; p < item.paragraphs.length; p++)
          assert(item.paragraphs[p].top >= item.paragraphs[p - 1].bottom);
        for (const math of item.math) {
          assert(math.clientWidth > 0 && math.height > 0);
          assert.equal(math.htmlDirection, 'ltr');
          if (math.scrollWidth > math.clientWidth + 1) assert(['auto', 'scroll'].includes(math.overflowX));
        }
      }
    }
  }
  return runs;
}

export function assertStage4Runtime(report, locale, targetSha256, predecessorTargetSha256) {
  assert.equal(report.predecessorCommit, MARKOV_STAGE4_PREDECESSOR);
  assert.equal(report.allPassed, true); assert.equal(report.matrixExactToOldSum, true);
  assert.equal(report.seededTrajectoryExact, true); assert.equal(report.splitOutputsExact, true);
  assert.equal(report.twoStepOrderedEnumerationPassed, true); assert.equal(report.negativeRegressions, 2);
  assert.equal(typeof report.numpyVersion, 'string'); assert(report.numpyVersion);
  assert(report.limits.includes('No browser/Pyodide runtime initialized'));
  assert.equal(report.localeStructure.length, EXAMPLE_LOCALES.length);
  assert.deepEqual(report.localeStructure.map(item => item.locale).sort(), [...EXAMPLE_LOCALES].sort());
  const item = report.localeStructure.find(item => item.locale === locale);
  assert.equal(item.sha256, targetSha256); assert.equal(item.cells, 13);
  assert.equal(item.predecessorSha256, predecessorTargetSha256); assert.equal(item.preservationPassed, true);
  assert.deepEqual(report.firstColumn.map(item => item.position), [0, 2, 6, 18, 35, 42, 47]);
  assert.deepEqual(report.firstColumn.map(item => item.choicesOutOf13), [7, 1, 1, 1, 1, 1, 1]);
  assert.equal(report.sampledMoves.length, 12);
  const choices = ['I', 'U', "U'", 'D', "D'", 'F', "F'", 'B', "B'", 'L', "L'", 'R', "R'"];
  for (const move of report.sampledMoves) assert(choices.includes(move));
  return item;
}

// Cell/token IDs can move when one code cell becomes three. Preserve the
// candidate's identity, not its former index. Ambiguous matches are refused.
export function remapStage4Keeps(oldTranslation, priorCandidates, currentCandidates) {
  const originalName = name => ['transition_matrix', 'sticker_step', 'random_walk'].includes(name) ? 'random_walk' : name;
  const identity = candidate => JSON.stringify([originalName(candidate.cell_name), candidate.kind, candidate.text, candidate.context]);
  const oldById = new Map(priorCandidates.map(candidate => [candidate.id, candidate]));
  const remap = ids => ids.map(id => {
    const candidate = oldById.get(id); assert(candidate, 'Unknown predecessor KEEP id: ' + id);
    const matches = currentCandidates.filter(current => identity(current) === identity(candidate));
    assert.equal(matches.length, 1, 'Missing/ambiguous current KEEP identity: ' + id);
    return matches[0].id;
  });
  const keeps = { ...structuredClone(oldTranslation.keeps), ids: remap(oldTranslation.keeps.ids) };
  const policy = { ...structuredClone(oldTranslation.policy), protectedIds: remap(oldTranslation.policy.protectedIds) };
  assert.equal(new Set(keeps.ids).size, keeps.ids.length);
  for (const id of policy.protectedIds) assert(keeps.ids.includes(id));
  return { keeps, policy };
}

export function recordStage4() {
  const sourceBytes = bytes(sourcePath), source = JSON.parse(sourceBytes), sourceSha256 = sha(sourceBytes);
  const priorSourceBytes = pinned(sourcePath), priorSource = JSON.parse(priorSourceBytes);
  const predecessorSourceSha256 = sha(priorSourceBytes), sourceParts = loadStage4Parts();
  const sourceProseSha256 = sha(bytes(prosePath));
  assert.deepEqual(source, expectedStage4(priorSource, sourceParts), 'English is not the approved pinned Stage 4 construction');
  const renderBytes = bytes(renderPath), rendering = JSON.parse(renderBytes);
  const runtimeBytes = bytes(runtimePath), runtime = JSON.parse(runtimeBytes);
  assert(!JSON.stringify({ rendering, runtime }).includes('/home/'), 'Private host path in public Stage 4 evidence');
  const currentCandidates = JSON.parse(tool('span-apply.mjs', ['candidates', sourcePath])).candidates;
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'markov-stage4-keeps-'));
  const updates = [];
  try {
    const priorCandidatePath = path.join(scratch, 'predecessor.srwb');
    writeFileSync(priorCandidatePath, priorSourceBytes);
    const priorCandidates = JSON.parse(tool('span-apply.mjs', ['candidates', priorCandidatePath])).candidates;
    for (const locale of EXAMPLE_LOCALES) {
      const targetPath = `workbooks/${locale}/markov-groups.srwb`, receiptPath = `reviews/examples/${locale}/markov-groups.json`;
      const predecessorReceiptBytes = pinned(receiptPath), old = JSON.parse(predecessorReceiptBytes);
      assert.deepEqual(json(receiptPath), old, 'Public receipt changed since pinned Stage 4 predecessor');
      assert(!old.stage4Update, 'Refuse replaying completed Stage 4 receipts');
      const priorTargetBytes = pinned(targetPath), baseline = JSON.parse(priorTargetBytes);
      assert.equal(old.source.sha256, predecessorSourceSha256); assert.equal(old.target.sha256, sha(priorTargetBytes));
      const targetBytes = bytes(targetPath), target = JSON.parse(targetBytes), targetSha256 = sha(targetBytes);
      const generation = applyStage4MathDirection(target, locale, { reverse: true });
      const generationTargetSha256 = sha(serialized(generation));
      const targetParts = Object.fromEntries(MARKOV_STAGE4_PARTS.map(part => [part.key, generation.notebook.cells[part.index].code]));
      assert.deepEqual(generation, expectedStage4(baseline, targetParts), 'Changed beyond the authorized Stage 4 construction');
      assert.deepEqual(target, applyStage4MathDirection(generation, locale), 'Not the exact authorized math-direction wrappers');
      const refinementPath = `${evidence}/${locale}/markov-groups/stage4.render-refinement.json`;
      let mathDirectionRefinement = null;
      if (locale === 'ar') {
        const refinement = json(refinementPath);
        assert.deepEqual(refinement, { method: 'controller-math-direction-ltr', modelRequests: 0, locale,
          generationTargetSha256, targetSha256, wrappers: 4,
          scope: 'Four trusted LTR wrappers around unchanged Stage 4 display formulas; Arabic prose stays RTL' });
        const archivedGeneration = bytes(`${evidence}/${locale}/markov-groups/stage4.generation.srwb`);
        assert.equal(sha(archivedGeneration), generationTargetSha256);
        assert.deepEqual(JSON.parse(archivedGeneration), generation);
        assert.notEqual(generationTargetSha256, targetSha256);
        mathDirectionRefinement = { ...refinement, nativeSpeakerReview: 'pending', unchangedSourceMathAndProse: true };
      } else {
        assert(!existsSync(path.join(root, refinementPath)), 'Math-direction refinement is Arabic-only');
        assert.equal(generationTargetSha256, targetSha256);
      }
      assert.equal(target.notebook.name, old.target.title);
      const generated = locale === 'en' ? null : json(`${evidence}/${locale}/markov-groups/stage4.refresh.json`);
      if (generated) {
        assert.equal(generated.status, 'static-gates-passed'); assert.equal(generated.mode, 'stage4-three-part-source-refresh');
        assert.equal(generated.locale, locale); assert.equal(generated.workbook, 'markov-groups');
        assert.equal(generated.predecessorCommit, MARKOV_STAGE4_PREDECESSOR);
        assert.equal(generated.sourceSha256, sourceSha256); assert.equal(generated.currentSourceSha256, sourceSha256);
        assert.equal(generated.predecessorSourceSha256, predecessorSourceSha256);
        assert.equal(generated.predecessorTargetSha256, old.target.sha256);
        assert.equal(generated.sourceProseSha256, sourceProseSha256); assert.equal(generated.targetSha256, generationTargetSha256);
        assert.deepEqual(generated.fields, MARKOV_STAGE4_PARTS.map(part => part.field)); assert.equal(generated.cells, 13);
        assert.equal(generated.requests.draft, 1); assert.equal(generated.requests.repair, 0);
        assert([0, 1].includes(generated.requests.freshReview));
        assert(['Gemini-draft-and-fresh-same-model-review', 'controller-manual-fallback-after-model-failure'].includes(generated.reviewMethod));
        assert.equal(generated.modelProseApproved, generated.reviewMethod === 'Gemini-draft-and-fresh-same-model-review');
        if (generated.modelProseApproved) assert.equal(generated.requests.freshReview, 1);
        assert.equal(generated.nativeSpeakerReview, 'pending');
      }
      assertStage4Rendering(rendering, locale, targetSha256);
      assertStage4Runtime(runtime, locale, targetSha256, old.target.sha256);
      const updated = structuredClone(old);
      updated.source.sha256 = sourceSha256; Object.assign(updated.target, { sha256: targetSha256, size: targetBytes.length });
      updated.browser.caveat = 'Historical nine-cell executable runs are retained unchanged. The current thirteen-cell Stage 4 split has separate import/render and local preinstalled-NumPy equivalence evidence; no fresh Python app-runtime or Android/Pro runtime is claimed.';
      if (updated.translation) {
        Object.assign(updated.translation, remapStage4Keeps(old.translation, priorCandidates, currentCandidates));
        updated.translation.manifest = JSON.parse(tool('span-derive.mjs', [sourcePath, targetPath, locale]));
        const targetCandidates = new Map(JSON.parse(tool('span-apply.mjs', ['candidates', targetPath])).candidates.map(candidate => [candidate.id, candidate]));
        for (const candidate of currentCandidates.filter(candidate => updated.translation.keeps.ids.includes(candidate.id)))
          assert.equal(targetCandidates.get(candidate.id)?.text, candidate.text, 'Current KEEP changed');
        const lint = [sourcePath, '--lint', targetPath, '--strict'];
        for (const text of updated.translation.keeps.texts) lint.push('--allow', text);
        tool('span-scan.mjs', lint);
        Object.assign(updated.translation.contentAudit, { sourceSha256, targetSha256,
          reviewMethod: 'Prior prose audits retained. Only the three new Stage 4 Markdown fields received bounded review; existing localized comments and output labels were mechanically preserved.'
            + (mathDirectionRefinement ? ' Four trusted Arabic math-direction wrappers are a separate controller-only rendering correction with zero model requests and unchanged prose/formulas.' : ''),
          provenance: { predecessorCommit: MARKOV_STAGE4_PREDECESSOR, predecessorSourceSha256,
            predecessorTargetSha256: old.target.sha256, priorAuditSha256: sha(JSON.stringify(old.translation.contentAudit)),
            stage4ThreeMarkdownFieldsOnly: true, reviewMethod: generated.reviewMethod, modelProseApproved: generated.modelProseApproved } });
      }
      updated.stage4Update = { predecessorCommit: MARKOV_STAGE4_PREDECESSOR, predecessorSourceSha256,
        predecessorTargetSha256: old.target.sha256, sourceSha256, targetSha256, generationTargetSha256, cells: 13,
        sourceProse: { path: prosePath, sha256: sourceProseSha256 },
        parts: MARKOV_STAGE4_PARTS.map(part => ({ ...part, sourceMarkdownSha256: sha(sourceParts[part.key]),
          targetMarkdownSha256: sha(targetParts[part.key]), currentMarkdownSha256: sha(target.notebook.cells[part.index].code),
          codeCellSha256: sha(target.notebook.cells[part.index + 1].code) })),
        intro: { cell: 'intro', method: 'exact-inline-code-run-order-insertion', from: STAGE4_RUN_ORDER_OLD,
          to: STAGE4_RUN_ORDER_NEW, predecessorCellSha256: sha(baseline.notebook.cells[0].code), currentCellSha256: sha(target.notebook.cells[0].code) },
        preserved: { firstSixExceptIntro: true, takeaways: true, coordinatesCyclesAndSvg: true,
          localizedPythonCommentsAndOutputLabels: true, metadata: true },
        executable: { method: 'split-pinned-Python-and-exact-sum-to-loop-substitution',
          predecessorFormulaSha256: sha(STAGE4_ORIGINAL_FORMULA), currentFormulaSha256: sha(STAGE4_EXPLICIT_FORMULA),
          numericalEquivalence: 'local-preinstalled-NumPy', pythonAppRuntime: 'not-run' },
        method: generated?.reviewMethod || 'controller-authored', model: generated?.model || null,
        modelProseApproved: generated?.modelProseApproved || false, modelReviewScope: 'supplied-three-new-Markdown-fields-only',
        mathDirectionRefinement,
        requests: generated?.requests || null, nativeSpeakerReview: locale === 'en' ? 'not-applicable' : 'pending',
        historicalEvidence: { predecessorReceiptSha256: sha(predecessorReceiptBytes), cells: 9,
          retainedFields: ['browser', 'coordinateUpdate', 'cyclesUpdate', 'layoutUpdate'] },
        rendering: { status: 'passed', path: renderPath, sha256: sha(renderBytes), workbookSha256: targetSha256,
          platform: rendering.platform, viewport: rendering.viewport, scope: rendering.scope, pythonExecuted: false },
        runtime: { status: 'passed', path: runtimePath, sha256: sha(runtimeBytes), workbookSha256: targetSha256,
          platform: 'local-preinstalled-NumPy', numpyVersion: runtime.numpyVersion, executedLocale: 'en',
          scope: 'Actual English Python executed locally; all locale structures/syntax checked and preserved code/labels verified mechanically. No Python app runtime, Android or Pro runtime.',
          pythonAppRuntime: 'not-run' } };
      updates.push({ locale, receiptPath, updated });
    }
  } finally { rmSync(scratch, { recursive: true }); }
  // Do not change any public receipt unless every locale and both fresh reports pass.
  for (const { locale, receiptPath, updated } of updates) {
    writeFileSync(path.join(root, receiptPath), JSON.stringify(updated, null, 2) + '\n');
    console.log(`[PASS] ${locale}: current thirteen-cell Stage 4 evidence; historical nine-cell receipts retained`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) recordStage4();
