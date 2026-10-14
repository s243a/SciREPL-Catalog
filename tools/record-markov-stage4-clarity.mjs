#!/usr/bin/env node
// Add clarity provenance; never rewrite completed translation/render history.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { MARKOV_CLARITY_PREDECESSOR, clarityStage4Parts, applyStage4Clarity } from './markov-stage4-clarity.mjs';
import { assertStage4Rendering, assertStage4Runtime } from './record-markov-stage4-update.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = 'workbooks/en/markov-groups.srwb', prosePath = 'tools/markov-stage4-text.json';
const renderPath = 'reviews/markov-clarity-rendering.json', runtimePath = 'reviews/markov-clarity-runtime.json';
export const CLARITY_CELLS = Object.freeze([6, 8, 10, 12]);
export const CLARITY_RETAINED_FIELDS = Object.freeze(['browser', 'coordinateUpdate', 'cyclesUpdate', 'layoutUpdate', 'stage4Update', 'probabilityClarification']);
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = file => readFileSync(path.join(root, file));
const json = file => JSON.parse(bytes(file));
const pinned = file => execFileSync('git', ['show', `${MARKOV_CLARITY_PREDECESSOR}:${file}`], { cwd: root });
const tool = (name, args) => execFileSync(process.execPath, [path.join(root, 'tools', name), ...args],
  { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
export const clarityFormulas = book => book.notebook.cells.flatMap(cell => cell.type === 'markdown'
  ? cell.code.match(/\$\$[\s\S]*?\$\$/g) || [] : []);

export function assertClarityBooks(predecessor, current, locale) {
  assert.deepEqual(current, applyStage4Clarity(predecessor, locale), 'Not the exact authorized Stage 4 clarity update');
  assert.equal(current.notebook.cells.length, 13);
  const restored = structuredClone(current);
  for (const index of CLARITY_CELLS) {
    assert.equal(current.notebook.cells[index].type, 'markdown');
    assert.equal(current.notebook.cells[index].language, 'markdown');
    assert.notEqual(current.notebook.cells[index].code, predecessor.notebook.cells[index].code);
    restored.notebook.cells[index].code = predecessor.notebook.cells[index].code;
  }
  assert.deepEqual(restored, predecessor, 'Clarity changed Python, other Markdown, metadata or cell order');
  const before = clarityFormulas(predecessor), after = clarityFormulas(current);
  assert.equal(before.length, 4); assert.deepEqual(after, before, 'Clarity changed a protected formula');
  assert(current.notebook.cells[12].code.startsWith(predecessor.notebook.cells[12].code + '\n\n'), 'Prior takeaways changed instead of receiving the authorized suffix');
}

export function clarityProvenance(previous, predecessorSourceSha256, predecessorTargetSha256) {
  return { predecessorCommit: MARKOV_CLARITY_PREDECESSOR, predecessorSourceSha256, predecessorTargetSha256,
    priorAuditSha256: sha(JSON.stringify(previous)), cells: [...CLARITY_CELLS],
    method: 'controller-authored-localized-stage4-clarity', modelRequests: 0, modelProseApproved: false,
    unchangedPythonMetadataAndFormulas: true, nativeSpeakerReview: 'pending' };
}

export function assertClarityReportAdditions(rendering, runtime, locale) {
  const runs = rendering.tests.filter(run => run.locale === locale); assert.equal(runs.length, 2);
  for (const run of runs) {
    for (const state of [run.rendered, run.reimported]) {
      assert.equal(typeof state.takeaways.textLength, 'number'); assert(state.takeaways.textLength > 0);
      assert.equal(state.takeaways.unsafe, 0); assert.equal(state.takeaways.preserved, true);
    }
    for (const field of ['textLength', 'unsafe', 'preserved'])
      assert.equal(run.rendered.takeaways[field], run.reimported.takeaways[field],
        `Takeaways ${field} changed during export/reimport`);
  }
  assert.equal(runtime.clarityPredecessorCommit, MARKOV_CLARITY_PREDECESSOR);
  assert.equal(runtime.perMovePositionZeroDestinationsPassed, true);
  assert.equal(runtime.cornerStickerOrbitSize, 24);
  assert.equal(runtime.cornerUniformStationaryPassed, true);
  assert.equal(runtime.cornerLongRunNumericalCheckPassed, true);
}

export function assertClarityReports(rendering, runtime, locale, targetSha256, runtimePredecessorTargetSha256) {
  assertStage4Rendering(rendering, locale, targetSha256);
  assertStage4Runtime(runtime, locale, targetSha256, runtimePredecessorTargetSha256);
  assertClarityReportAdditions(rendering, runtime, locale);
}

export function recordStage4Clarity() {
  const priorSourceBytes = pinned(sourcePath), priorSource = JSON.parse(priorSourceBytes), predecessorSourceSha256 = sha(priorSourceBytes);
  const sourceBytes = bytes(sourcePath), source = JSON.parse(sourceBytes), sourceSha256 = sha(sourceBytes);
  assertClarityBooks(priorSource, source, 'en'); assert.deepEqual(json(prosePath), clarityStage4Parts);
  for (const [key, index] of [['matrix', 6], ['sticker', 8], ['trajectory', 10]])
    assert.equal(clarityStage4Parts[key], source.notebook.cells[index].code);
  const renderingBytes = bytes(renderPath), rendering = JSON.parse(renderingBytes);
  const runtimeBytes = bytes(runtimePath), runtime = JSON.parse(runtimeBytes);
  assert(!JSON.stringify({ rendering, runtime }).includes('/home/'), 'Private host path in public clarity evidence');
  const updates = [];
  for (const locale of EXAMPLE_LOCALES) {
    const targetPath = `workbooks/${locale}/markov-groups.srwb`, receiptPath = `reviews/examples/${locale}/markov-groups.json`;
    const predecessorReceiptBytes = pinned(receiptPath), previous = JSON.parse(predecessorReceiptBytes);
    assert.deepEqual(bytes(receiptPath), predecessorReceiptBytes, 'Receipt bytes changed since pinned clarity predecessor');
    assert(!previous.stage4Clarity, 'Refuse replaying completed clarity receipts'); assert(previous.probabilityClarification);
    const priorTargetBytes = pinned(targetPath), priorTarget = JSON.parse(priorTargetBytes), predecessorTargetSha256 = sha(priorTargetBytes);
    assert.equal(previous.source.sha256, predecessorSourceSha256); assert.equal(previous.target.sha256, predecessorTargetSha256);
    const targetBytes = bytes(targetPath), target = JSON.parse(targetBytes), targetSha256 = sha(targetBytes);
    assertClarityBooks(priorTarget, target, locale); assert.deepEqual(clarityFormulas(target), clarityFormulas(source));
    for (const field of CLARITY_RETAINED_FIELDS) {
      assert(previous[field], 'Missing prior receipt field: ' + field);
      const historical = previous[field].rendering;
      if (historical?.path) {
        assert.equal(sha(bytes(historical.path)), historical.sha256);
        assert.deepEqual(bytes(historical.path), pinned(historical.path), 'Historical rendering report bytes changed');
      }
      const runtime = previous[field].runtime;
      if (runtime?.path) {
        assert.equal(sha(bytes(runtime.path)), runtime.sha256);
        assert.deepEqual(bytes(runtime.path), pinned(runtime.path), 'Historical runtime report bytes changed');
      }
    }
    assertClarityReports(rendering, runtime, locale, targetSha256, previous.stage4Update.predecessorTargetSha256);
    const updated = structuredClone(previous);
    updated.source.sha256 = sourceSha256; Object.assign(updated.target, { sha256: targetSha256, size: targetBytes.length });
    if (updated.translation) {
      updated.translation.manifest = JSON.parse(tool('span-derive.mjs', [sourcePath, targetPath, locale]));
      const sourceCandidates = new Map(JSON.parse(tool('span-apply.mjs', ['candidates', sourcePath])).candidates.map(candidate => [candidate.id, candidate]));
      const targetCandidates = new Map(JSON.parse(tool('span-apply.mjs', ['candidates', targetPath])).candidates.map(candidate => [candidate.id, candidate]));
      for (const id of updated.translation.keeps.ids) {
        assert(sourceCandidates.has(id), 'Stale KEEP id despite unchanged Python');
        assert.equal(targetCandidates.get(id)?.text, sourceCandidates.get(id).text);
      }
      const lint = [sourcePath, '--lint', targetPath, '--strict'];
      for (const text of updated.translation.keeps.texts) lint.push('--allow', text);
      tool('span-scan.mjs', lint);
      Object.assign(updated.translation.contentAudit, { sourceSha256, targetSha256,
        clarityProvenance: clarityProvenance(previous.translation.contentAudit, predecessorSourceSha256, predecessorTargetSha256) });
    }
    updated.stage4Clarity = { predecessorCommit: MARKOV_CLARITY_PREDECESSOR, predecessorSourceSha256, predecessorTargetSha256,
      sourceSha256, targetSha256, cells: 13,
      changes: CLARITY_CELLS.map(index => ({ index, cell: target.notebook.cells[index].name,
        predecessorCellSha256: sha(priorTarget.notebook.cells[index].code), currentCellSha256: sha(target.notebook.cells[index].code) })),
      takeaways: { preservedPrefixSha256: sha(priorTarget.notebook.cells[12].code),
        appendedTextSha256: sha(target.notebook.cells[12].code.slice(priorTarget.notebook.cells[12].code.length)) },
      sourceProse: { path: prosePath, predecessorSha256: sha(pinned(prosePath)), sha256: sha(bytes(prosePath)) },
      controllerProse: { path: 'tools/markov-stage4-clarity.json', sha256: sha(bytes('tools/markov-stage4-clarity.json')) },
      method: 'controller-authored-localized-stage4-clarity', modelRequests: 0, modelProseApproved: false,
      nativeSpeakerReview: locale === 'en' ? 'not-applicable' : 'pending', unchangedPythonMetadataAndFormulas: true,
      historicalEvidence: { predecessorReceiptSha256: sha(predecessorReceiptBytes), retainedFields: [...CLARITY_RETAINED_FIELDS] },
      rendering: { status: 'passed', path: renderPath, sha256: sha(renderingBytes), workbookSha256: targetSha256,
        platform: rendering.platform, viewport: rendering.viewport, scope: rendering.scope, pythonExecuted: false },
      runtime: { status: 'passed', path: runtimePath, sha256: sha(runtimeBytes), workbookSha256: targetSha256,
        platform: 'local-preinstalled-NumPy', numpyVersion: runtime.numpyVersion, executedLocale: 'en',
        scope: 'Inspected English Python rechecked locally; locale structure and exact clarity update checked mechanically. No Python app runtime, Android or Pro runtime.',
        pythonAppRuntime: 'not-run' } };
    for (const field of CLARITY_RETAINED_FIELDS) assert.deepEqual(updated[field], previous[field]);
    updates.push({ locale, receiptPath, updated });
  }
  // Every current/historical gate passes before any public receipt is replaced.
  for (const { locale, receiptPath, updated } of updates) {
    writeFileSync(path.join(root, receiptPath), JSON.stringify(updated, null, 2) + '\n');
    console.log(`[PASS] ${locale}: separate Stage 4 clarity evidence; all prior receipts retained`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) recordStage4Clarity();
