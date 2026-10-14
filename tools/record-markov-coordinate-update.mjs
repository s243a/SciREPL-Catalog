#!/usr/bin/env node
// Compact current Markdown evidence; historical Python runs retain their scope.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { splitCoordinateDiagrams, assertCoordinateSvgInvariants } from './markov-coordinate-diagrams.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const baselineRef = arg('baseline-ref', 'e717ba2');
const evidence = arg('evidence', 'reviews/translations/markov-coordinates-20261006');
const renderPath = 'reviews/markov-coordinate-rendering.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = file => readFileSync(path.join(root, file));
const json = file => JSON.parse(bytes(file));
const previous = file => execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: root });
const layout = json(`${evidence}/geometry-refinement-baseline.json`);
const rendering = json(renderPath);
assert.equal(rendering.tests.length, EXAMPLE_LOCALES.length * 2);
const sourcePath = 'workbooks/en/markov-groups.srwb', sourceSha256 = sha(bytes(sourcePath));
const generationSourceSha256 = layout.find(item => item.locale === 'en').beforeSha256;
for (const locale of EXAMPLE_LOCALES) {
  const targetPath = `workbooks/${locale}/markov-groups.srwb`;
  const receiptPath = `reviews/examples/${locale}/markov-groups.json`;
  const old = JSON.parse(previous(receiptPath)), baseline = JSON.parse(previous(targetPath));
  const targetBytes = bytes(targetPath), target = JSON.parse(targetBytes), targetSha256 = sha(targetBytes);
  const restored = structuredClone(target); restored.notebook.cells[1].code = baseline.notebook.cells[1].code;
  assert.deepEqual(restored, baseline, locale + ': changed outside coordinates Markdown');
  assertCoordinateSvgInvariants(target.notebook.cells[1].code);
  const frozen = layout.find(item => item.locale === locale);
  assert.equal(sha(splitCoordinateDiagrams(target.notebook.cells[1].code).prose), frozen.proseSha256);
  const runs = rendering.tests.filter(test => test.locale === locale);
  assert.deepEqual(runs.map(test => test.theme).sort(), ['dark', 'light']);
  for (const run of runs) {
    assert(run.passed); assert.equal(run.workbookSha256, targetSha256);
    assert.equal(run.rendered.cells, 9); assert.equal(run.rendered.codeExecuted, false);
    assert.equal(run.rendered.diagrams.length, 2);
    for (const svg of run.rendered.diagrams) { assert.equal(svg.unsafe, 0); assert.equal(svg.external, false); }
  }
  const generated = locale === 'en' ? null : json(`${evidence}/${locale}/markov-groups/coordinates.refresh.json`);
  if (generated) {
    assert.equal(generated.status, 'static-gates-passed');
    assert.equal(generated.sourceSha256, generationSourceSha256);
    assert.equal(generated.targetSha256, frozen.beforeSha256);
  }
  const updated = structuredClone(old);
  updated.source.sha256 = sourceSha256;
  Object.assign(updated.target, { sha256: targetSha256, size: targetBytes.length });
  updated.browser.scope = 'prior-revision-runtime';
  updated.browser.checkedSourceSha256 = old.source.sha256;
  updated.browser.checkedTargetSha256 = old.target.sha256;
  updated.browser.caveat = 'These historical executable runs predate the coordinate Markdown update; no new Python runtime run is claimed. Current diagram-only checks are recorded separately.';
  if (updated.translation) {
    updated.translation.manifest = JSON.parse(execFileSync(process.execPath,
      [path.join(root, 'tools/span-derive.mjs'), sourcePath, targetPath, locale], { cwd: root, encoding: 'utf8' }));
    Object.assign(updated.translation.contentAudit, { sourceSha256, targetSha256,
      reviewMethod: 'Prior audit retained for unchanged cells; the coordinates-only source update passed exact KEEP/SVG/data gates and the separately identified scoped prose review.',
      provenance: { predecessorSourceSha256: old.source.sha256, predecessorTargetSha256: old.target.sha256,
        priorAuditSha256: sha(JSON.stringify(old.translation.contentAudit)), coordinateUpdateOnly: true } });
  }
  updated.coordinateUpdate = { cell: 'coordinates', generationSourceSha256, finalSourceSha256: sourceSha256,
    preGeometryTargetSha256: frozen.beforeSha256, finalTargetSha256: targetSha256,
    proseSha256: frozen.proseSha256, layoutOnlyRefinement: true, unchangedExecutableAndOtherCells: true,
    method: generated?.reviewMethod || (locale === 'en' ? 'controller-authored' : 'Gemini-draft-and-fresh-same-model-review'),
    model: generated?.model || null, requests: generated?.requests || null,
    nativeSpeakerReview: locale === 'en' ? 'not-applicable' : 'pending',
    rendering: { status: 'passed', path: renderPath, sha256: sha(bytes(renderPath)),
      workbookSha256: targetSha256, platform: rendering.platform, viewport: rendering.viewport,
      themes: ['dark', 'light'], scope: rendering.scope } };
  writeFileSync(path.join(root, receiptPath), JSON.stringify(updated, null, 2) + '\n');
  console.log(`[PASS] ${locale}: prior runtime scope + current coordinate Markdown/render evidence`);
}
