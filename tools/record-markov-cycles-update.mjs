#!/usr/bin/env node
// Preserve the coordinate/runtime history while recording the cycles-only update.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = 'reviews/translations/markov-cycles-20261006';
const renderPath = 'reviews/markov-cycles-rendering.json';
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = file => readFileSync(path.join(root, file));
const json = file => JSON.parse(bytes(file));
const sourcePath = 'workbooks/en/markov-groups.srwb', sourceSha256 = sha(bytes(sourcePath));
const oldSourceSha256 = sha(bytes(`${evidence}/english.predecessor.srwb`));
const rendering = json(renderPath);
assert.equal(rendering.tests.length, EXAMPLE_LOCALES.length * 2);
const updates = [];
for (const locale of EXAMPLE_LOCALES) {
  const targetPath = `workbooks/${locale}/markov-groups.srwb`, receiptPath = `reviews/examples/${locale}/markov-groups.json`;
  const old = json(receiptPath); assert(!old.cyclesUpdate, 'Refuse silently replaying a finished cycles receipt');
  const baselinePath = locale === 'en' ? `${evidence}/english.predecessor.srwb`
    : `${evidence}/${locale}/markov-groups/cycles.predecessor.srwb`;
  const baselineBytes = bytes(baselinePath), baseline = JSON.parse(baselineBytes);
  const targetBytes = bytes(targetPath), target = JSON.parse(targetBytes), targetSha256 = sha(targetBytes);
  assert.equal(old.source.sha256, oldSourceSha256); assert.equal(old.target.sha256, sha(baselineBytes));
  const restored = structuredClone(target); restored.notebook.cells[4].code = baseline.notebook.cells[4].code;
  assert.deepEqual(restored, baseline, locale + ': changed outside cycles Markdown');
  const generated = locale === 'en' ? null : json(`${evidence}/${locale}/markov-groups/cycles.refresh.json`);
  if (generated) {
    assert.equal(generated.status, 'static-gates-passed'); assert.equal(generated.sourceSha256, sourceSha256);
    assert.equal(generated.predecessorTargetSha256, old.target.sha256); assert.equal(generated.targetSha256, targetSha256);
  }
  const runs = rendering.tests.filter(test => test.locale === locale);
  assert.deepEqual(runs.map(test => test.theme).sort(), ['dark', 'light']);
  for (const run of runs) {
    assert(run.passed); assert.equal(run.workbookSha256, targetSha256);
    assert.equal(run.rendered.cells, 9); assert.equal(run.rendered.codeExecuted, false);
    assert(run.rendered.cycles.textLength > 0 && run.rendered.cycles.paragraphCount >= 7);
    assert.equal(run.rendered.cycles.unsafe, 0);
    assert(run.rendered.cycles.width <= run.rendered.bodyWidth);
    assert(run.rendered.cycles.scrollWidth <= run.rendered.bodyWidth);
    assert.equal(run.rendered.diagrams.length, 2);
    for (const svg of run.rendered.diagrams) { assert.equal(svg.unsafe, 0); assert.equal(svg.external, false); }
  }
  const updated = structuredClone(old);
  updated.source.sha256 = sourceSha256; Object.assign(updated.target, { sha256: targetSha256, size: targetBytes.length });
  updated.browser.caveat = 'Historical executable runs predate the coordinates/cycles Markdown updates; no fresh Python app-runtime run is claimed. Current Markdown import/render checks are recorded separately.';
  if (updated.translation) {
    updated.translation.manifest = JSON.parse(execFileSync(process.execPath,
      [path.join(root, 'tools/span-derive.mjs'), sourcePath, targetPath, locale], { cwd: root, encoding: 'utf8' }));
    Object.assign(updated.translation.contentAudit, { sourceSha256, targetSha256,
      reviewMethod: 'Prior audits retained for unchanged cells; cycles-only prose received the identified bounded review and exact KEEP/data gates.',
      provenance: { predecessorSourceSha256: old.source.sha256, predecessorTargetSha256: old.target.sha256,
        priorAuditSha256: sha(JSON.stringify(old.translation.contentAudit)), cyclesUpdateOnly: true } });
  }
  updated.cyclesUpdate = { cell: 'cycles', predecessorSourceSha256: old.source.sha256,
    predecessorTargetSha256: old.target.sha256, sourceSha256, targetSha256,
    cyclesCellSha256: sha(target.notebook.cells[4].code), preservedCoordinateCellSha256: sha(target.notebook.cells[1].code),
    unchangedExecutableAndOtherCells: true,
    method: generated?.reviewMethod || 'controller-authored', model: generated?.model || null,
    modelProseApproved: generated?.modelProseApproved || false, requests: generated?.requests || null,
    nativeSpeakerReview: locale === 'en' ? 'not-applicable' : 'pending',
    rendering: { status: 'passed', path: renderPath, sha256: sha(bytes(renderPath)), workbookSha256: targetSha256,
      platform: rendering.platform, viewport: rendering.viewport, scope: rendering.scope } };
  updates.push({ locale, receiptPath, updated });
}
// Validate every edition and derive every manifest before changing public receipts.
for (const { locale, receiptPath, updated } of updates) {
  writeFileSync(path.join(root, receiptPath), JSON.stringify(updated, null, 2) + '\n');
  console.log(`[PASS] ${locale}: cycles-only provenance + retained prior coordinate/runtime evidence`);
}
