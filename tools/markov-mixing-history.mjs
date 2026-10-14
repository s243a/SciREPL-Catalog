// Strict historical-core compatibility. This certifies ONLY the unchanged
// 13-cell Markov lesson; the full append-only workbook needs its own new gate.
// Importing the module performs no I/O and never writes data or receipts.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';

export const MARKOV_MIXING_HISTORY_PREDECESSOR = 'f88d9b9e26364eeb5e7ff1ee9bcce5f27d47c66e';
export const MARKOV_MIXING_SUFFIX_NAMES = Object.freeze(['mixing_bridge', 'mixing_setup',
  'visit_bridge', 'sticker_visits', 'joint_bridge', 'joint_visits']);
export const MARKOV_MIXING_RETAINED_FIELDS = Object.freeze(['browser', 'coordinateUpdate', 'cyclesUpdate',
  'layoutUpdate', 'stage4Update', 'probabilityClarification', 'stage4Clarity']);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const pinnedCache = new Map();
export function pinnedMarkovHistoryBytes(file, { repo = ROOT } = {}) {
  const key = `${path.resolve(repo)}:${file}`;
  if (!pinnedCache.has(key)) pinnedCache.set(key, execFileSync('git', ['show',
    `${MARKOV_MIXING_HISTORY_PREDECESSOR}:${file}`], { cwd: repo, maxBuffer: 16 * 1024 * 1024 }));
  return Buffer.from(pinnedCache.get(key));
}
export function pinnedMarkovCore(locale, options) {
  assert(EXAMPLE_LOCALES.includes(locale), 'Unknown historical Markov locale');
  return JSON.parse(pinnedMarkovHistoryBytes(`workbooks/${locale}/markov-groups.srwb`, options));
}
export function projectMarkovHistoricalCore(book, locale, options) {
  assert(EXAMPLE_LOCALES.includes(locale), 'Unknown historical Markov locale');
  assert.equal(book?.format, 'srwb', 'Historical projection is Markov SRWB-only');
  const cells = book?.notebook?.cells;
  assert(Array.isArray(cells));
  assert([13, 19].includes(cells.length), 'Markov historical check requires exactly 13 or 19 cells');
  if (cells.length === 13) return structuredClone(book); // Run all ordinary legacy assertions.
  const suffix = cells.slice(13);
  assert.deepEqual(suffix.map(cell => cell.name), MARKOV_MIXING_SUFFIX_NAMES, 'Unknown Markov extension');
  suffix.forEach((cell, index) => {
    assert.deepEqual(Object.keys(cell).sort(), ['code', 'language', 'name', 'type'], 'Extension cell metadata changed');
    assert.equal(cell.type, index % 2 === 0 ? 'markdown' : 'code');
    assert.equal(cell.language, index % 2 === 0 ? 'markdown' : 'python');
    assert.equal(typeof cell.code, 'string'); assert(cell.code.trim(), 'Empty extension cell');
  });
  const core = structuredClone(book); core.notebook.cells = structuredClone(cells.slice(0, 13));
  assert.deepEqual(core, pinnedMarkovCore(locale, options),
    '19-cell Markov changed its exact pinned historical core or container');
  return core;
}
// Translation/addendum construction may run before OR after promotion. A
// thirteen-cell baseline remains byte-pinned; a nineteen-cell baseline must
// pass the exact historical projection, never an unconditional array slice.
export function assertMarkovMixingBaselineBytes(bytes, locale, options) {
  const book = JSON.parse(bytes);
  if (book?.notebook?.cells?.length === 13) assert.deepEqual(Buffer.from(bytes),
    pinnedMarkovHistoryBytes(`workbooks/${locale}/markov-groups.srwb`, options), 'Pinned 13-cell workbook bytes changed');
  return projectMarkovHistoricalCore(book, locale, options);
}
export function assertRetainedMarkovHistory(review, locale, options) {
  const receipt = JSON.parse(pinnedMarkovHistoryBytes(`reviews/examples/${locale}/markov-groups.json`, options));
  for (const field of MARKOV_MIXING_RETAINED_FIELDS) {
    assert(receipt[field], 'Pinned historical field missing: ' + field);
    assert.deepEqual(review[field], receipt[field], 'Retained historical receipt changed: ' + field);
    for (const kind of ['rendering', 'runtime']) {
      const report = receipt[field][kind];
      if (report?.path) assert.deepEqual(readFileSync(path.join(options?.repo || ROOT, report.path)),
        pinnedMarkovHistoryBytes(report.path, options), 'Historical report bytes changed: ' + report.path);
    }
  }
  return receipt;
}
export function markovHistoricalEditionContext({ review, source, target, locale, repo = ROOT }) {
  const sourceCore = projectMarkovHistoricalCore(source, 'en', { repo });
  const targetCore = projectMarkovHistoricalCore(target, locale, { repo });
  if (!review.mixingUpdate) {
    assert.equal(source.notebook.cells.length, 13, '19-cell edition requires a separate mixing receipt');
    assert.equal(target.notebook.cells.length, 13, '19-cell edition requires a separate mixing receipt');
    return { review, source: sourceCore, target: targetCore };
  }
  assert.equal(source.notebook.cells.length, 19, 'Mixing receipt cannot bypass ordinary 13-cell checks');
  assert.equal(target.notebook.cells.length, 19, 'Mixing receipt requires the full 19-cell edition');
  assert.equal(review.mixingUpdate.predecessorCommit, MARKOV_MIXING_HISTORY_PREDECESSOR);
  const retained = assertRetainedMarkovHistory(review, locale, { repo });
  return { review: retained, source: sourceCore, target: targetCore };
}
