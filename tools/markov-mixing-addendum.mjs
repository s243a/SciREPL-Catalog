#!/usr/bin/env node
// Local, unregistered candidate: preserve all pinned catalog bytes until the
// complete locale/runtime/rendering campaign is ready for promotion.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MIXING_PREDECESSOR = 'f88d9b9e26364eeb5e7ff1ee9bcce5f27d47c66e';
export const MIXING_CORE_ORDER = ['intro', 'coordinates', 'cube_moves', 'check_moves', 'cycles',
  'show_turn', 'markov_bridge', 'transition_matrix', 'sticker_bridge', 'sticker_step',
  'trajectory_bridge', 'random_walk', 'takeaways'];
export const MIXING_PARTS = [
  { key: 'setup', name: 'mixing_bridge', codeName: 'mixing_setup', file: 'corner_orbits.py', index: 13 },
  { key: 'sticker', name: 'visit_bridge', codeName: 'sticker_visits', file: 'sticker_visits.py', index: 15 },
  { key: 'joint', name: 'joint_bridge', codeName: 'joint_visits', file: 'joint_visits.py', index: 17 },
];
export const mixingRepo = path.resolve(new URL('..', import.meta.url).pathname);
export const mixingSha = bytes => createHash('sha256').update(bytes).digest('hex');
export function mixingPinned(locale = 'en', repo = mixingRepo) {
  return execFileSync('git', ['show', `${MIXING_PREDECESSOR}:workbooks/${locale}/markov-groups.srwb`], { cwd: repo });
}
export function mixingParts() {
  const parts = JSON.parse(readFileSync(new URL('./markov-mixing-addendum-text.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(parts).sort(), MIXING_PARTS.map(part => part.key).sort());
  for (const text of Object.values(parts)) {
    assert.equal(typeof text, 'string'); assert(text.trim());
    assert(!/[\u0000\uFFFD]/u.test(text)); assert(!text.includes('<')); assert(!text.includes('```'));
  }
  return parts;
}
export function mixingCode() {
  return MIXING_PARTS.map(part => readFileSync(new URL(`./markov-mixing/${part.file}`, import.meta.url), 'utf8'));
}
export function expectedMixing(predecessor, parts = mixingParts(), code = mixingCode()) {
  assert.equal(predecessor?.format, 'srwb');
  assert.deepEqual(predecessor.notebook.cells.map(cell => cell.name), MIXING_CORE_ORDER);
  assert.deepEqual(Object.keys(parts).sort(), MIXING_PARTS.map(part => part.key).sort());
  assert.equal(code.length, 3); assert(code.every(text => typeof text === 'string' && text.trim()));
  const result = structuredClone(predecessor);
  result.notebook.cells.push(...MIXING_PARTS.flatMap((part, index) => [
    { name: part.name, type: 'markdown', language: 'markdown', code: parts[part.key] },
    { name: part.codeName, type: 'code', language: 'python', code: code[index] },
  ]));
  assertMixingPreservation(predecessor, result);
  return result;
}
export function assertMixingPreservation(predecessor, result) {
  assert.equal(result.notebook.cells.length, 19, 'Expected core 13 plus six opt-in cells');
  assert.deepEqual(result.notebook.cells.slice(0, 13), predecessor.notebook.cells, 'Core cells changed');
  const restored = structuredClone(result); restored.notebook.cells = predecessor.notebook.cells;
  assert.deepEqual(restored, predecessor, 'Container metadata changed');
  assert.deepEqual(result.notebook.cells.slice(13).map(cell => cell.name),
    MIXING_PARTS.flatMap(part => [part.name, part.codeName]));
}
export function prepareMixing(repo = mixingRepo, refreshDraft = false) {
  const pinnedBytes = mixingPinned('en', repo), source = JSON.parse(pinnedBytes);
  assert.deepEqual(readFileSync(path.join(repo, 'workbooks/en/markov-groups.srwb')), pinnedBytes,
    'Shipped English source must remain the exact frozen predecessor');
  const candidate = expectedMixing(source), draft = 'drafts/markov-mixing/en/markov-groups.srwb';
  const bytes = JSON.stringify(candidate, null, 2) + '\n';
  mkdirSync(path.dirname(path.join(repo, draft)), { recursive: true });
  if (existsSync(path.join(repo, draft)) && refreshDraft) {
    assertMixingPreservation(source, JSON.parse(readFileSync(path.join(repo, draft), 'utf8')));
    writeFileSync(path.join(repo, draft), bytes);
  } else if (existsSync(path.join(repo, draft))) assert.equal(readFileSync(path.join(repo, draft), 'utf8'), bytes,
    'Existing draft differs: use --refresh-draft to explicitly regenerate this unregistered candidate');
  else writeFileSync(path.join(repo, draft), bytes, { flag: 'wx' });
  const candidates = JSON.parse(execFileSync(process.execPath,
    [path.join(repo, 'tools/span-apply.mjs'), 'candidates', path.join(repo, draft)], { encoding: 'utf8' })).candidates;
  // The scanner deliberately over-approximates strings. This explicit prose
  // list protects all chart API/data tokens and sends no original cell.
  const prose = new Set(['Corner positions:', 'Reachable ordered pairs:', 'Masked same-cubie pairs:',
    'Observed visits', 'Uniform target', 'One sticker', 'Two stickers', 'steps',
    'Label 1 position', 'Label 1 corner index', 'Label 3 corner index', 'Visit frequency',
    'steps; visit-average distance:', 'exact end-position distance:',
    'steps; joint visit-average distance:', 'Uniform target per reachable ordered pair:']);
  const appended = candidates.filter(candidate => Number(candidate.id.split(':')[0]) >= 13);
  const spans = appended.filter(candidate => candidate.kind === 'comment' || prose.has(candidate.text));
  const protectedCandidates = appended.filter(candidate => !spans.includes(candidate));
  assert(spans.length > 0); assert(prose.size === new Set(spans.filter(c => c.kind !== 'comment').map(c => c.text)).size);
  const fields = {
    schema: 'markov-mixing-fields-v1', predecessorCommit: MIXING_PREDECESSOR,
    predecessorEnglishSha256: mixingSha(pinnedBytes), candidateEnglishSha256: mixingSha(bytes),
    coreCells: 13, candidateCells: 19,
    markdown: MIXING_PARTS.map(part => ({ field: `markdown:${part.index}`, text: candidate.notebook.cells[part.index].code })),
    candidates: spans,
    protectedCandidates: protectedCandidates.map(candidate => ({ id: candidate.id, text: candidate.text })),
    workerEntries: [
      ...MIXING_PARTS.map(part => ({ book: 'markov-groups', field: `markdown:${part.index}`,
        kind: 'markdown', text: candidate.notebook.cells[part.index].code })),
      ...spans.map(span => ({ book: 'markov-groups', field: `span:${span.id}`, kind: span.kind,
        text: span.text, context: span.context, ...(span.width ? { width: span.width } : {}) })),
    ],
    application: {
      mode: 'pending scoped append-only adapter; never run the general whole-workbook translator',
      workerResponse: `Exactly ${MIXING_PARTS.length + spans.length} flat entries: {book, field, text}; only the supplied three Markdown fields and ${spans.length} span IDs`,
      calls: 'One tool-free agy/Gemini draft plus one fresh same-model review; no automatic repairs',
      baseline: 'Full 19-cell hybrid: exact pinned localized core 13 plus frozen English suffix six; never reindex candidate IDs',
      apply: 'span-apply.mjs apply markdown-applied.srwb spans.json translated.srwb --en apply-source.srwb',
      derive: 'span-derive.mjs apply-source.srwb translated.srwb <locale>',
      gates: 'Exact old core/container; three Markdown KEEP/script/residue checks; full authorized span coverage; unchanged protected IDs; derived spans only in cells 14,16,18; final-byte runtime and rendering',
      evidence: 'Fresh campaign directory, exact source/fields/locale pins, exclusive pre-send started marker; never reuse or overwrite old receipts/budgets',
      promotion: 'Held: do not register, overwrite shipped workbooks, push, create remote PR, merge, or tag',
    },
    neverTranslate: ['Identifiers', 'cell names', 'API/dict keys', 'mode strings', 'numeric data', 'face-frame data',
      'format specifiers', 'f-string placeholders', 'all original 13 cells'],
    reviewStatus: { translation: 'not started', nativeSpeaker: 'pending', browserRuntime: 'pending', rendered: 'pending' },
  };
  const fieldPath = path.join(repo, 'drafts/markov-mixing/translation-fields.json');
  const fieldBytes = JSON.stringify(fields, null, 2) + '\n';
  if (existsSync(fieldPath) && refreshDraft) {
    assert.equal(JSON.parse(readFileSync(fieldPath, 'utf8')).predecessorCommit, MIXING_PREDECESSOR);
    writeFileSync(fieldPath, fieldBytes);
  } else if (existsSync(fieldPath)) assert.equal(readFileSync(fieldPath, 'utf8'), fieldBytes, 'Canonical fields changed');
  else writeFileSync(fieldPath, fieldBytes, { flag: 'wx' });
  return { draft, fields: path.relative(repo, fieldPath), sha256: mixingSha(bytes), candidates: spans.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  console.log(JSON.stringify(prepareMixing(mixingRepo, process.argv.includes('--refresh-draft')), null, 2));
