// Controller-reviewed heading reflow after the actual 320px rendering check.
import assert from 'node:assert/strict';

export const MARKOV_TABLE_REFINEMENTS = {
  de: [{ index: 4,
    before: '| Fläche | Flächenzyklen | Streifenzyklen |',
    after: '| Fläche | Zyklen auf der Fläche | Zyklen in Streifen |' }],
};

export function refineLayoutTables(book, locale, { reverse = false } = {}) {
  const result = structuredClone(book);
  for (const change of MARKOV_TABLE_REFINEMENTS[locale] || []) {
    const from = reverse ? change.after : change.before, to = reverse ? change.before : change.after;
    const cell = result.notebook.cells[change.index];
    assert.equal(cell.type, 'markdown');
    assert.equal(cell.code.split(from).length, 2, 'Expected exactly one approved table heading');
    cell.code = cell.code.replace(from, to);
  }
  return result;
}
