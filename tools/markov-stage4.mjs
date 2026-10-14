// Controller-owned Stage 4 mechanics. Only three new Markdown texts are
// translation inputs; existing localized code/comments/output labels are not.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const MARKOV_STAGE4_PREDECESSOR = '017ea7eed65a9dc7875aa5b8c59df489114facbd';
export const MARKOV_STAGE4_PARTS = Object.freeze([
  Object.freeze({ key: 'matrix', name: 'markov_bridge', field: 'markdown:6', index: 6, codeName: 'transition_matrix' }),
  Object.freeze({ key: 'sticker', name: 'sticker_bridge', field: 'markdown:8', index: 8, codeName: 'sticker_step' }),
  Object.freeze({ key: 'trajectory', name: 'trajectory_bridge', field: 'markdown:10', index: 10, codeName: 'random_walk' }),
]);
const OLD_ORDER = ['intro', 'coordinates', 'cube_moves', 'check_moves', 'cycles',
  'show_turn', 'markov_bridge', 'random_walk', 'takeaways'];
const OLD_TYPES = ['markdown', 'markdown', 'code', 'code', 'markdown', 'code', 'markdown', 'code', 'markdown'];
export const STAGE4_ORIGINAL_FORMULA = 'T = (IDENTITY + sum((M[name] + M[name].T for name in FACE_NAMES), np.zeros((N, N), dtype=int))) / len(MOVE_OPTIONS)';
export const STAGE4_EXPLICIT_FORMULA = [
  'move_counts = IDENTITY.copy()',
  'for name in FACE_NAMES:',
  '    move_counts += M[name]',
  '    move_counts += M[name].T',
  'T = move_counts / len(MOVE_OPTIONS)',
].join('\n');
export const STAGE4_RUN_ORDER_OLD = '`show_turn`';
export const STAGE4_RUN_ORDER_NEW = '`show_turn`, `transition_matrix`, `sticker_step`';

export function assertStage4Parts(parts) {
  assert(parts && typeof parts === 'object' && !Array.isArray(parts), 'Stage 4 parts must be an object');
  assert.deepEqual(Object.keys(parts).sort(), MARKOV_STAGE4_PARTS.map(part => part.key).sort(),
    'Stage 4 requires exactly three Markdown strings');
  for (const part of MARKOV_STAGE4_PARTS) {
    assert.equal(typeof parts[part.key], 'string');
    assert(parts[part.key].trim(), 'Empty Stage 4 Markdown');
    assert(!parts[part.key].includes('\uFFFD'), 'Stage 4 transport corruption');
    assert(!parts[part.key].includes('<'), 'No HTML is authorized in Stage 4');
    assert(!parts[part.key].includes('```'), 'Stage 4 code belongs in its following executable cell');
  }
  return parts;
}

export function loadStage4Parts() {
  return assertStage4Parts(JSON.parse(readFileSync(new URL('./markov-stage4-text.json', import.meta.url), 'utf8')));
}

export function splitStage4Code(code) {
  assert.equal(typeof code, 'string');
  const blocks = code.split('\n\n');
  assert.equal(blocks.length, 3, 'Pinned random_walk must have exactly three blank-line-separated blocks');
  const lines = blocks.map(block => block.split('\n'));
  assert.deepEqual(lines.map(block => block.length), [6, 6, 10], 'Pinned Stage 4 block line counts changed');
  assert.equal(lines[0][0], 'MOVE_OPTIONS = ["I", "U", "U\'", "D", "D\'", "F", "F\'", "B", "B\'", "L", "L\'", "R", "R\'"]');
  assert.equal(lines[0][1], STAGE4_ORIGINAL_FORMULA, 'Pinned Stage 4 formula changed');
  assert.deepEqual(lines[0].slice(2), ['assert np.all(T >= 0)', 'assert np.allclose(T.sum(axis=0), 1)',
    'assert np.allclose(T.sum(axis=1), 1)', 'assert np.allclose(T, T.T)']);
  assert(lines[1][0].startsWith('# '), 'Missing preserved sticker comment');
  assert.deepEqual(lines[1].slice(1, 5), ['location_probability = np.zeros(N)', 'location_probability[0] = 1',
    'after_one_step = T @ location_probability', 'assert np.isclose(after_one_step.sum(), 1)']);
  assert(lines[1][5].startsWith('print('), 'Missing preserved sticker output');
  assert(lines[2][0].startsWith('# ') && lines[2][1].startsWith('# '), 'Missing preserved trajectory comments');
  assert.deepEqual(lines[2].slice(2, 7), ['rng = np.random.default_rng(7)',
    'moves = rng.choice(MOVE_OPTIONS, size=12).tolist()', 'walk_state = apply(SOLVED, *moves)',
    'assert np.array_equal(np.sort(walk_state), SOLVED)', 'assert np.array_equal(walk_state[CENTRES], SOLVED[CENTRES])']);
  assert(lines[2].slice(7).every(line => line.startsWith('print(')), 'Missing preserved trajectory outputs');
  const transition = [lines[0][0], STAGE4_EXPLICIT_FORMULA, ...lines[0].slice(2)].join('\n');
  return [transition, blocks[1], blocks[2]];
}

export function expectedStage4(predecessor, parts) {
  assertStage4Parts(parts);
  assert.equal(predecessor?.format, 'srwb');
  const cells = predecessor?.notebook?.cells;
  assert(Array.isArray(cells));
  assert.deepEqual(cells.map(cell => cell.name), OLD_ORDER, 'Require pinned nine-cell predecessor order');
  assert.deepEqual(cells.map(cell => cell.type), OLD_TYPES, 'Pinned predecessor cell types changed');
  assert.deepEqual(cells.map(cell => cell.language), OLD_TYPES.map(type => type === 'code' ? 'python' : 'markdown'));
  const blocks = splitStage4Code(cells[7].code);
  const expected = structuredClone(predecessor);
  assert.equal(cells[0].code.split(STAGE4_RUN_ORDER_OLD).length, 2, 'Require exactly one pinned show_turn run-order token');
  expected.notebook.cells[0].code = cells[0].code.replace(STAGE4_RUN_ORDER_OLD, STAGE4_RUN_ORDER_NEW);
  const replacements = MARKOV_STAGE4_PARTS.flatMap((part, i) => [
    { ...structuredClone(cells[6]), name: part.name, code: parts[part.key] },
    { ...structuredClone(cells[7]), name: part.codeName, code: blocks[i] },
  ]);
  expected.notebook.cells.splice(6, 2, ...replacements);
  assert.equal(expected.notebook.cells.length, 13);
  const restoredPrefix = structuredClone(expected.notebook.cells.slice(0, 6));
  restoredPrefix[0].code = restoredPrefix[0].code.replace(STAGE4_RUN_ORDER_NEW, STAGE4_RUN_ORDER_OLD);
  assert.deepEqual(restoredPrefix, cells.slice(0, 6));
  assert.deepEqual(expected.notebook.cells[12], cells[8]);
  return expected;
}

export function stage4ProposalValues(review) {
  assert.deepEqual(Object.keys(review), ['entries'], 'Stage 4 proposal permits only entries');
  assert(Array.isArray(review.entries));
  assert.equal(review.entries.length, 3, 'Stage 4 requires exactly three flat entries');
  const values = new Map();
  for (const entry of review.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['book', 'field', 'text']);
    assert.equal(entry.book, 'markov-groups');
    const part = MARKOV_STAGE4_PARTS.find(part => part.field === entry.field);
    assert(part && !values.has(entry.field), 'Unknown or duplicate Stage 4 field');
    assert.equal(typeof entry.text, 'string');
    values.set(entry.field, entry.text);
  }
  return assertStage4Parts(Object.fromEntries(MARKOV_STAGE4_PARTS.map(part => [part.key, values.get(part.field)])));
}

export function gateStage4Parts(review, sourceParts, { cleanText, markdownKeeps, markdownAudit, scriptRule } = {}) {
  for (const gate of [cleanText, markdownKeeps, markdownAudit]) assert.equal(typeof gate, 'function');
  assertStage4Parts(sourceParts);
  const proposed = stage4ProposalValues(review);
  const parts = {};
  for (const part of MARKOV_STAGE4_PARTS) {
    const text = cleanText(proposed[part.key]);
    assert.deepEqual(markdownKeeps(text), markdownKeeps(sourceParts[part.key]), part.name + ': Stage 4 KEEP drift');
    assert.deepEqual(markdownAudit(sourceParts[part.key], text), [], part.name + ': untranslated English Stage 4 prose');
    if (scriptRule) assert(scriptRule.test(text), part.name + ': missing locale script');
    parts[part.key] = text;
  }
  return assertStage4Parts(parts);
}
