#!/usr/bin/env node
// Record additive Markdown + authorized comment-only changes, retaining history.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { MARKOV_LAYOUT_ADDENDA, MARKOV_LAYOUT_PREDECESSOR, ADDENDUM_SEPARATOR,
  expectedLayoutSource } from './markov-layout-addenda.mjs';
import { annotateMoveCycles, cycleCommentLabels, withoutCycleComments } from './markov-cycle-comments.mjs';
import { MARKOV_TABLE_REFINEMENTS, refineLayoutTables } from './markov-table-refinements.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = 'reviews/translations/markov-layout-addenda-20261007';
const renderPath = 'reviews/markov-layout-rendering.json';
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = file => readFileSync(path.join(root, file));
const json = file => JSON.parse(bytes(file));
const priorBytes = file => execFileSync('git', ['show', `${MARKOV_LAYOUT_PREDECESSOR}:${file}`], { cwd: root });
const serialized = book => Buffer.from(JSON.stringify(book, null, 2) + '\n');
const withoutAnnotations = book => {
  const clean = structuredClone(book);
  clean.notebook.cells[2].code = withoutCycleComments(clean.notebook.cells[2].code);
  return clean;
};
const sourcePath = 'workbooks/en/markov-groups.srwb', sourceSha256 = sha(bytes(sourcePath));
const sourceGenerationBytes = bytes(`${evidence}/en/markov-groups/layout.generation.srwb`);
const sourceGeneration = JSON.parse(sourceGenerationBytes);
assert.deepEqual(withoutAnnotations(json(sourcePath)), sourceGeneration);
const generationSourceSha256 = sha(sourceGenerationBytes);
assert.equal(sha(serialized(sourceGeneration)), generationSourceSha256);
const predecessorSourceSha256 = sha(priorBytes(sourcePath));
assert.deepEqual(sourceGeneration, expectedLayoutSource(JSON.parse(priorBytes(sourcePath))));
const renderBytes = bytes(renderPath), rendering = JSON.parse(renderBytes);
assert.equal(rendering.tests.length, EXAMPLE_LOCALES.length * 2);
const updates = [];
for (const locale of EXAMPLE_LOCALES) {
  const targetPath = `workbooks/${locale}/markov-groups.srwb`, receiptPath = `reviews/examples/${locale}/markov-groups.json`;
  const old = json(receiptPath); assert(!old.layoutUpdate, 'Refuse silently replaying finished layout receipts');
  const predecessorBytes = priorBytes(targetPath), baseline = JSON.parse(predecessorBytes);
  assert.equal(old.source.sha256, predecessorSourceSha256); assert.equal(old.target.sha256, sha(predecessorBytes));
  const targetBytes = bytes(targetPath), target = JSON.parse(targetBytes), targetSha256 = sha(targetBytes);
  const generationBytes = bytes(`${evidence}/${locale}/markov-groups/layout.generation.srwb`);
  const originalGeneration = JSON.parse(generationBytes), generationTargetSha256 = sha(generationBytes);
  const refinementPath = `${evidence}/${locale}/markov-groups/layout.render-refinement.json`;
  let headerRefinement = null, generation = originalGeneration;
  if (existsSync(path.join(root, refinementPath))) {
    headerRefinement = json(refinementPath); assert.equal(headerRefinement.locale, locale);
    assert.equal(headerRefinement.generationTargetSha256, generationTargetSha256);
    assert.equal(headerRefinement.method, 'controller-rendered-table-header-wrap');
    assert.equal(headerRefinement.modelRequests, 0); assert.equal(headerRefinement.targetSha256, targetSha256);
    assert.deepEqual(headerRefinement.changes, MARKOV_TABLE_REFINEMENTS[locale]);
    generation = refineLayoutTables(originalGeneration, locale);
    assert.deepEqual(refineLayoutTables(generation, locale, { reverse: true }), originalGeneration);
    assert.equal(sha(serialized(generation)), headerRefinement.refinedGenerationSha256);
  }
  assert.deepEqual(withoutAnnotations(target), generation);
  assert.equal(sha(serialized(originalGeneration)), generationTargetSha256);
  const labels = cycleCommentLabels(target.notebook.cells[4].code);
  const annotated = annotateMoveCycles(generation.notebook.cells[2].code, labels);
  assert.equal(annotated.code, target.notebook.cells[2].code, 'Not the exact 30 authorized comment insertions');
  assert.equal(annotated.comments.length, 30);
  const addenda = [];
  for (const part of MARKOV_LAYOUT_ADDENDA) {
    const prefix = baseline.notebook.cells[part.index].code, current = generation.notebook.cells[part.index].code;
    assert(current.startsWith(prefix + ADDENDUM_SEPARATOR));
    assert(current.length > prefix.length + ADDENDUM_SEPARATOR.length);
    addenda.push({ cell: part.name, index: part.index, prefixCodeUnits: prefix.length,
      preservedPrefixSha256: sha(prefix), appendedTextSha256: sha(current.slice(prefix.length)), currentCellSha256: sha(current) });
  }
  const restored = structuredClone(originalGeneration);
  for (const part of MARKOV_LAYOUT_ADDENDA) restored.notebook.cells[part.index].code = baseline.notebook.cells[part.index].code;
  assert.deepEqual(restored, baseline, 'Changed beyond two addenda and authorized comments');
  const generated = locale === 'en' ? null : json(`${evidence}/${locale}/markov-groups/layout.refresh.json`);
  if (generated) {
    assert.equal(generated.status, 'static-gates-passed');
    assert.equal(generated.mode, 'layout-addenda-only-source-refresh');
    assert.equal(generated.sourceSha256, generationSourceSha256);
    assert.equal(generated.predecessorSourceSha256, predecessorSourceSha256);
    assert.equal(generated.predecessorTargetSha256, old.target.sha256);
    assert.equal(generated.targetSha256, generationTargetSha256);
    assert.equal(generated.requests.draft, 1); assert.equal(generated.requests.repair, 0);
    assert([0, 1].includes(generated.requests.freshReview));
    assert(['Gemini-draft-and-fresh-same-model-review', 'controller-manual-fallback-after-model-failure']
      .includes(generated.reviewMethod));
  }
  const runs = rendering.tests.filter(test => test.locale === locale);
  assert.deepEqual(runs.map(test => test.theme).sort(), ['dark', 'light']);
  for (const run of runs) {
    assert(run.passed); assert.equal(run.workbookSha256, targetSha256);
    assert.equal(run.rendered.cells, 9); assert.equal(run.rendered.codeExecuted, false);
    assert.equal(run.rendered.cycles.unsafe, 0); assert(run.rendered.cycles.paragraphCount >= 7);
    for (const [table, rows] of [['numbering', 7], ['grouping', 3]]) {
      assert.equal(run.rendered[table].rows.length, rows);
      assert(run.rendered[table].rows.every(row => row.length === 3));
      assert(run.rendered[table].scrollWidth <= run.rendered.bodyWidth);
    }
    assert.equal(run.rendered.diagrams.length, 2);
    for (const svg of run.rendered.diagrams) { assert.equal(svg.unsafe, 0); assert.equal(svg.external, false); }
  }
  const updated = structuredClone(old);
  updated.source.sha256 = sourceSha256; Object.assign(updated.target, { sha256: targetSha256, size: targetBytes.length });
  updated.browser.caveat = 'Historical executable runs predate the Markdown updates and authorized comment insertions. Current Python changes are comments only; no fresh Python app-runtime run is claimed. Current Markdown import/render checks are separate.';
  if (updated.translation) {
    updated.translation.manifest = JSON.parse(execFileSync(process.execPath,
      [path.join(root, 'tools/span-derive.mjs'), sourcePath, targetPath, locale], { cwd: root, encoding: 'utf8' }));
    Object.assign(updated.translation.contentAudit, { sourceSha256, targetSha256,
      reviewMethod: 'Prior prose audits retained; only the new addenda received bounded review. Comments reuse localized Markdown labels under controller review.',
      provenance: { predecessorSourceSha256, predecessorTargetSha256: old.target.sha256,
        priorAuditSha256: sha(JSON.stringify(old.translation.contentAudit)), layoutAddendaAndCommentsOnly: true } });
  }
  updated.layoutUpdate = { predecessorCommit: MARKOV_LAYOUT_PREDECESSOR, predecessorSourceSha256,
    predecessorTargetSha256: old.target.sha256, generationSourceSha256, generationTargetSha256,
    sourceSha256, targetSha256, addenda, unchangedPriorMarkdownAndSvg: true,
    method: generated?.reviewMethod || 'controller-authored', model: generated?.model || null,
    modelProseApproved: generated?.modelProseApproved || false, modelReviewScope: 'supplied-new-Markdown-addenda-only',
    requests: generated?.requests || null, nativeSpeakerReview: locale === 'en' ? 'not-applicable' : 'pending',
    headerRefinement: headerRefinement ? { method: headerRefinement.method, modelRequests: 0,
      generationTargetSha256, refinedGenerationSha256: headerRefinement.refinedGenerationSha256,
      changes: headerRefinement.changes, nativeSpeakerReview: 'pending' } : null,
    comments: { method: 'controller-reused-localized-Markdown-labels', cell: 'cube_moves', count: 30, labels,
      generationCellSha256: sha(generation.notebook.cells[2].code), finalCellSha256: sha(target.notebook.cells[2].code),
      unchangedNumericCyclesAndRemainingPython: true, nativeSpeakerReview: locale === 'en' ? 'not-applicable' : 'pending' },
    rendering: { status: 'passed', path: renderPath, sha256: sha(renderBytes), workbookSha256: targetSha256,
      platform: rendering.platform, viewport: rendering.viewport, scope: rendering.scope } };
  updates.push({ locale, receiptPath, updated });
}
// Complete all gates/manifest derivations before changing any public receipt.
for (const { locale, receiptPath, updated } of updates) {
  writeFileSync(path.join(root, receiptPath), JSON.stringify(updated, null, 2) + '\n');
  console.log(`[PASS] ${locale}: additive layout/comment provenance; prior receipts retained`);
}
