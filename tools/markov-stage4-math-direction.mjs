// Controller-owned rendered scaffolding, never model-proposed HTML. Arabic
// display math gets an exact LTR container; every other byte stays unchanged.
import assert from 'node:assert/strict';
import { MARKOV_STAGE4_PARTS, loadStage4Parts } from './markov-stage4.mjs';

export const STAGE4_MATH_OPEN = '<div dir="ltr">\n\n';
export const STAGE4_MATH_CLOSE = '\n\n</div>';
const RAW_MATH = /\$\$[\s\S]*?\$\$/g;
const WRAPPED_MATH = /<div dir="ltr">\n\n(\$\$[\s\S]*?\$\$)\n\n<\/div>/g;
const COUNTS = [1, 2, 1];
const ORDER = ['intro', 'coordinates', 'cube_moves', 'check_moves', 'cycles', 'show_turn',
  'markov_bridge', 'transition_matrix', 'sticker_bridge', 'sticker_step',
  'trajectory_bridge', 'random_walk', 'takeaways'];
const LOCALES = ['en', 'ar', 'bn', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt-BR', 'ru', 'zh'];

export function applyStage4MathDirection(book, locale, { reverse = false } = {}) {
  assert(LOCALES.includes(locale), 'Unknown Stage 4 locale');
  assert.equal(typeof reverse, 'boolean');
  const result = structuredClone(book);
  if (locale !== 'ar') return result;
  assert.equal(book?.format, 'srwb');
  assert.deepEqual(book?.notebook?.cells?.map(cell => cell.name), ORDER,
    'Arabic math refinement requires the exact thirteen-cell Stage 4 order');
  const source = loadStage4Parts();
  let total = 0;
  for (const [i, part] of MARKOV_STAGE4_PARTS.entries()) {
    const cell = result.notebook.cells[part.index];
    assert.equal(cell.name, part.name); assert.equal(cell.type, 'markdown'); assert.equal(cell.language, 'markdown');
    assert.equal(typeof cell.code, 'string');
    const before = cell.code;
    let raw = before;
    if (reverse) {
      const wrappers = [...before.matchAll(WRAPPED_MATH)];
      assert.equal(wrappers.length, COUNTS[i], part.name + ': missing, duplicate or unknown LTR wrapper');
      raw = before.replace(WRAPPED_MATH, (_match, math) => math);
    }
    assert(!raw.includes('<'), part.name + ': no other HTML or wrapper drift is authorized');
    const math = [...raw.matchAll(RAW_MATH)].map(match => match[0]);
    assert.equal(math.length, COUNTS[i], part.name + ': display-math block count changed');
    assert.equal((raw.match(/\$\$/g) || []).length, 2 * COUNTS[i], part.name + ': unmatched math delimiter');
    assert.deepEqual(math, [...source[part.key].matchAll(RAW_MATH)].map(match => match[0]),
      part.name + ': protected formula drift');
    cell.code = reverse ? raw : raw.replace(RAW_MATH, math => STAGE4_MATH_OPEN + math + STAGE4_MATH_CLOSE);
    assert.deepEqual([...cell.code.matchAll(RAW_MATH)].map(match => match[0]), math, 'Math direction changed a formula');
    total += math.length;
  }
  assert.equal(total, 4, 'Arabic Stage 4 requires exactly four display-math wrappers');
  // Enforce that the only mutation is the checked scaffolding in these cells.
  const restored = structuredClone(result);
  for (const part of MARKOV_STAGE4_PARTS) restored.notebook.cells[part.index].code = book.notebook.cells[part.index].code;
  assert.deepEqual(restored, book);
  return result;
}

export function unwrappedStage4Parts(book, locale) {
  const raw = applyStage4MathDirection(book, locale, { reverse: true });
  return Object.fromEntries(MARKOV_STAGE4_PARTS.map(part => [part.key, raw.notebook.cells[part.index].code]));
}
