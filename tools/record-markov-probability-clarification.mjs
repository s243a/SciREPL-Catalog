#!/usr/bin/env node
// Record a controller-authored Markdown clarification, never replay Stage 4.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { MARKOV_PROBABILITY_PREDECESSOR, GENERAL_PROBABILITY_MATH, ONE_HOT_PROBABILITY_MATH,
  applyProbabilityClarification } from './markov-probability-clarification.mjs';
import { assertStage4Rendering, assertStage4Runtime } from './record-markov-stage4-update.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = 'workbooks/en/markov-groups.srwb';
const prosePath = 'tools/markov-stage4-text.json';
const renderPath = 'reviews/markov-probability-rendering.json';
const runtimePath = 'reviews/markov-probability-runtime.json';
const retainedFields = ['browser', 'coordinateUpdate', 'cyclesUpdate', 'layoutUpdate', 'stage4Update'];
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = file => readFileSync(path.join(root, file));
const json = file => JSON.parse(bytes(file));
const pinned = file => execFileSync('git', ['show', `${MARKOV_PROBABILITY_PREDECESSOR}:${file}`], { cwd: root });
const tool = (name, args) => execFileSync(process.execPath, [path.join(root, 'tools', name), ...args],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const formulas = book => book.notebook.cells.flatMap(cell => cell.type === 'markdown'
  ? cell.code.match(/\$\$[\s\S]*?\$\$/g) || [] : []);

export function clarificationProvenance(previous, predecessorSourceSha256, predecessorTargetSha256) {
  return { predecessorCommit: MARKOV_PROBABILITY_PREDECESSOR, predecessorSourceSha256, predecessorTargetSha256,
    priorAuditSha256: sha(JSON.stringify(previous)), cell: 'sticker_bridge', index: 8,
    method: 'controller-authored-localized-probability-clarification', modelRequests: 0,
    unchangedPythonAndOtherMarkdown: true, changedDisplayFormulaBlocks: 2, nativeSpeakerReview: 'pending' };
}

export function recordProbabilityClarification() {
  const predecessorSourceBytes = pinned(sourcePath), predecessorSource = JSON.parse(predecessorSourceBytes);
  const predecessorSourceSha256 = sha(predecessorSourceBytes);
  const sourceBytes = bytes(sourcePath), source = JSON.parse(sourceBytes), sourceSha256 = sha(sourceBytes);
  assert.deepEqual(source, applyProbabilityClarification(predecessorSource, 'en'), 'English clarification differs from exact authorized replacement');
  const sourceFormulas = formulas(source), priorSourceFormulas = formulas(predecessorSource);
  assert.equal(sourceFormulas.length, 4); assert.equal(priorSourceFormulas.length, 4);
  assert.equal(sourceFormulas[0], priorSourceFormulas[0]); assert.equal(sourceFormulas[3], priorSourceFormulas[3]);
  assert.equal(sourceFormulas[1], GENERAL_PROBABILITY_MATH); assert.equal(sourceFormulas[2], ONE_HOT_PROBABILITY_MATH);
  const priorParts = JSON.parse(pinned(prosePath)), currentParts = json(prosePath);
  assert.deepEqual(Object.keys(currentParts).sort(), ['matrix', 'sticker', 'trajectory']);
  assert.equal(currentParts.matrix, priorParts.matrix); assert.equal(currentParts.trajectory, priorParts.trajectory);
  assert.equal(priorParts.sticker, predecessorSource.notebook.cells[8].code);
  assert.equal(currentParts.sticker, source.notebook.cells[8].code);
  assert.notEqual(currentParts.sticker, priorParts.sticker);
  const renderingBytes = bytes(renderPath), rendering = JSON.parse(renderingBytes);
  const runtimeBytes = bytes(runtimePath), runtime = JSON.parse(runtimeBytes);
  assert(!JSON.stringify({ rendering, runtime }).includes('/home/'), 'Private host path in public clarification evidence');
  const updates = [];
  for (const locale of EXAMPLE_LOCALES) {
    const targetPath = `workbooks/${locale}/markov-groups.srwb`, receiptPath = `reviews/examples/${locale}/markov-groups.json`;
    const predecessorReceiptBytes = pinned(receiptPath), previous = JSON.parse(predecessorReceiptBytes);
    assert.deepEqual(json(receiptPath), previous, 'Public receipt changed since clarification predecessor');
    assert(!previous.probabilityClarification, 'Refuse replaying a completed clarification'); assert(previous.stage4Update);
    const predecessorTargetBytes = pinned(targetPath), predecessorTarget = JSON.parse(predecessorTargetBytes);
    const predecessorTargetSha256 = sha(predecessorTargetBytes);
    assert.equal(previous.source.sha256, predecessorSourceSha256); assert.equal(previous.target.sha256, predecessorTargetSha256);
    const targetBytes = bytes(targetPath), target = JSON.parse(targetBytes), targetSha256 = sha(targetBytes);
    assert.deepEqual(target, applyProbabilityClarification(predecessorTarget, locale), 'Changed outside exact authorized localized clarification');
    assert.equal(target.notebook.cells.length, 13); assert.equal(target.notebook.cells[8].name, 'sticker_bridge');
    assert.notEqual(target.notebook.cells[8].code, predecessorTarget.notebook.cells[8].code);
    const restored = structuredClone(target); restored.notebook.cells[8].code = predecessorTarget.notebook.cells[8].code;
    assert.deepEqual(restored, predecessorTarget, 'Python, other Markdown or metadata changed');
    const currentFormulas = formulas(target), priorFormulas = formulas(predecessorTarget);
    assert.equal(currentFormulas.length, 4); assert.equal(priorFormulas.length, 4);
    assert.equal(currentFormulas[0], priorFormulas[0]); assert.equal(currentFormulas[3], priorFormulas[3]);
    assert.deepEqual(currentFormulas, sourceFormulas, 'Clarified formulas differ from approved current English');
    // Historical reports certify their historical bytes, not this clarification.
    for (const field of ['rendering', 'runtime']) {
      const record = previous.stage4Update[field];
      assert.equal(sha(bytes(record.path)), record.sha256);
      assert.deepEqual(bytes(record.path), pinned(record.path), 'Historical Stage 4 report was changed');
    }
    assertStage4Rendering(rendering, locale, targetSha256);
    assertStage4Runtime(runtime, locale, targetSha256, previous.stage4Update.predecessorTargetSha256);
    const updated = structuredClone(previous);
    updated.source.sha256 = sourceSha256; Object.assign(updated.target, { sha256: targetSha256, size: targetBytes.length });
    if (updated.translation) {
      updated.translation.manifest = JSON.parse(tool('span-derive.mjs', [sourcePath, targetPath, locale]));
      const sourceCandidates = JSON.parse(tool('span-apply.mjs', ['candidates', sourcePath])).candidates;
      const targetCandidates = new Map(JSON.parse(tool('span-apply.mjs', ['candidates', targetPath])).candidates.map(candidate => [candidate.id, candidate]));
      const candidatesById = new Map(sourceCandidates.map(candidate => [candidate.id, candidate]));
      for (const id of updated.translation.keeps.ids) {
        assert(candidatesById.has(id), 'Stale KEEP id after unchanged-code clarification');
        assert.equal(targetCandidates.get(id)?.text, candidatesById.get(id).text, 'Current KEEP changed');
      }
      const lint = [sourcePath, '--lint', targetPath, '--strict'];
      for (const text of updated.translation.keeps.texts) lint.push('--allow', text);
      tool('span-scan.mjs', lint);
      Object.assign(updated.translation.contentAudit, { sourceSha256, targetSha256,
        clarificationProvenance: clarificationProvenance(previous.translation.contentAudit,
          predecessorSourceSha256, predecessorTargetSha256) });
    }
    updated.probabilityClarification = { predecessorCommit: MARKOV_PROBABILITY_PREDECESSOR,
      predecessorSourceSha256, predecessorTargetSha256, sourceSha256, targetSha256,
      cell: 'sticker_bridge', index: 8, cells: 13,
      predecessorCellSha256: sha(predecessorTarget.notebook.cells[8].code), currentCellSha256: sha(target.notebook.cells[8].code),
      sourceProse: { path: prosePath, predecessorSha256: sha(pinned(prosePath)), sha256: sha(bytes(prosePath)) },
      method: 'controller-authored-localized-probability-clarification', modelRequests: 0, modelProseApproved: false,
      nativeSpeakerReview: locale === 'en' ? 'not-applicable' : 'pending',
      unchangedPythonAndOtherMarkdown: true, unchangedMetadataAndFormulaCount: true, changedDisplayFormulaBlocks: 2,
      historicalEvidence: { predecessorReceiptSha256: sha(predecessorReceiptBytes), retainedFields },
      rendering: { status: 'passed', path: renderPath, sha256: sha(renderingBytes), workbookSha256: targetSha256,
        platform: rendering.platform, viewport: rendering.viewport, scope: rendering.scope, pythonExecuted: false },
      runtime: { status: 'passed', path: runtimePath, sha256: sha(runtimeBytes), workbookSha256: targetSha256,
        platform: 'local-preinstalled-NumPy', numpyVersion: runtime.numpyVersion, executedLocale: 'en',
        scope: 'Inspected English Python rechecked locally; locale structure and exact clarification checked mechanically. No Python app runtime, Android or Pro runtime.',
        pythonAppRuntime: 'not-run' } };
    for (const field of retainedFields) assert.deepEqual(updated[field], previous[field]);
    updates.push({ locale, receiptPath, updated });
  }
  // Validate every locale/report before replacing any public receipt.
  for (const { locale, receiptPath, updated } of updates) {
    writeFileSync(path.join(root, receiptPath), JSON.stringify(updated, null, 2) + '\n');
    console.log(`[PASS] ${locale}: separate probability clarification; completed Stage 4 history retained`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) recordProbabilityClarification();
