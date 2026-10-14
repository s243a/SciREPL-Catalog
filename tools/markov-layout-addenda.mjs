// Controller-owned source for the additive layout clarification. Existing
// Markdown prefixes, SVGs and executable cells are not translation inputs.
import assert from 'node:assert/strict';
export const ADDENDUM_SEPARATOR = '\n\n';
export const MARKOV_LAYOUT_PREDECESSOR = '35b7527e607e089e14deb60ef28ef5e21abd4bee';
export const MARKOV_LAYOUT_ADDENDA = [
  { index: 1, name: 'coordinates', field: 'append:coordinates', text: [
    '### Constructing every face frame from F',
    '',
    'Start with F: `r = +x`, `u = +y`, `n = +z`. Keep the global axes fixed and rotate the whole paper frame. Positive angles follow the right-hand rule about the named positive global axis:',
    '',
    '- Starting afresh from F for each face, about global `+y`, obtain R by `+90°`, B by `180°`, and L by `-90°`.',
    '- Independently from F, about global `+x`, obtain U by `-90°` and D by `+90°`.',
    '',
    'All three frame directions rotate together. On B, this gives `r = -x`, `u = +y`, `n = -z`: viewed from outside the back face, drawing-right points toward global left. The U and D paper planes are horizontal, with normals `+y` and `-y`; “up” within those planes is not global up.',
    '',
    'These specified routes construct the table’s chosen drawing convention. They do not claim that every route between faces gives the same in-plane orientation, and they are not legal cube face moves.',
    '',
    '### Face numbering',
    '',
    '`FACE_NAMES = "UDFBLR"` defines the numbering below. Starting the frame construction from F does not make F the first numbered face. `MOVE_CYCLES` happens to list its keys in the same order as `FACE_NAMES`; reordering only that dictionary does not renumber sticker positions.',
    '',
    '| Face (index) | Positions | Printed |',
    '| --- | --- | --- |',
    '| `U` — up (`0`) | `0–8` | `1–9` |',
    '| `D` — down (`1`) | `9–17` | `10–18` |',
    '| `F` — front (`2`) | `18–26` | `19–27` |',
    '| `B` — back (`3`) | `27–35` | `28–36` |',
    '| `L` — left (`4`) | `36–44` | `37–45` |',
    '| `R` — right (`5`) | `45–53` | `46–54` |',
    '',
    'Positions are zero-based. The last column gives the one-based position numbers printed by `show_turn`. In the solved state these also equal the initial sticker labels, but sticker labels move when you scramble.',
  ].join('\n') + '\n' },
  { index: 4, name: 'cycles', field: 'append:cycles', text: [
    '### How the stored cycle lists are grouped',
    '',
    'Each `MOVE_CYCLES` face entry contains five disjoint four-cycles: two on the turned face (corner stickers and edge-middle stickers), and three on neighbouring strips. The order of those groups in the stored list is not universal:',
    '',
    '| Face | Face cycles | Strip cycles |',
    '| --- | --- | --- |',
    '| `U`, `D` | `1–2` | `3–5` |',
    '| `F`, `B`, `L`, `R` | `4–5` | `1–3` |',
    '',
    'Here the cycle numbers are one-based positions within the list of five cycles, not sticker positions. Each stored cycle begins with its smallest flat sticker index, and the five cycles are sorted by those starting indices. This is a deterministic index-based presentation, not a choice to start at local drawing-right. Within each cycle, entries follow the clockwise source-to-destination path; they are not numerically sorted.',
    '',
    'The U corner and edge examples above are its first two cycles. For F, the first stored cycle is `[6, 45, 11, 44]`: U bottom-left → R top-left → D top-right → L bottom-right → U bottom-left. All four positions lie on neighbouring faces, not F; F’s own face cycles are fourth and fifth.',
    '',
    'A flat index is `9 * face_index + 3 * row + column`, with `row = 0` at the top and `column = 0` at the left in that face’s outside view. Each listed integer is an absolute zero-based sticker position across all six faces, not a component of local `r` or `u`.',
    '',
    'Mathematically, the starting entry can be shifted: `[a, b, c, d]` and `[b, c, d, a]` describe the same cycle. The source data chooses the minimum-index rule above. Reversing the source-to-destination order gives the inverse cycle.',
    '',
    'The arrows always mean source → destination for one clockwise quarter turn viewed from outside the turned face, about its outward normal. `show_turn` adds `1` to each stored position when printing it; this changes the displayed numbering, not the move.',
  ].join('\n') + '\n' },
];

export function expectedLayoutSource(predecessor) {
  const expected = structuredClone(predecessor);
  for (const part of MARKOV_LAYOUT_ADDENDA) {
    assert.equal(expected.notebook.cells[part.index].name, part.name);
    assert.equal(expected.notebook.cells[part.index].type, 'markdown');
    expected.notebook.cells[part.index].code += ADDENDUM_SEPARATOR + part.text;
  }
  return expected;
}

export function layoutProposalValues(review) {
  assert.deepEqual(Object.keys(review), ['entries']); assert(Array.isArray(review.entries));
  assert.equal(review.entries.length, MARKOV_LAYOUT_ADDENDA.length);
  const values = new Map();
  const tableTokens = text => text.split('\n').filter(line => line.trim().startsWith('|'))
    .map(line => [...line.matchAll(/`([^`\n]+)`/g)].map(match => match[1]));
  for (const entry of review.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['book', 'field', 'text']); assert.equal(entry.book, 'markov-groups');
    const part = MARKOV_LAYOUT_ADDENDA.find(part => part.field === entry.field);
    assert(part && !values.has(entry.field)); assert.equal(typeof entry.text, 'string');
    assert(!entry.text.includes('<'), 'No HTML is authorized in addenda');
    assert.deepEqual(tableTokens(entry.text), tableTokens(part.text), part.name + ': table data/order drift');
    values.set(entry.field, entry.text);
  }
  return values;
}

export function testLayoutAddenda() {
  let checks = 0;
  const good = { entries: MARKOV_LAYOUT_ADDENDA.map(part => ({ book: 'markov-groups', field: part.field, text: part.text })) };
  assert.equal(layoutProposalValues(good).size, 2); checks++;
  const extra = structuredClone(good); extra.entries.push({ ...extra.entries[0], field: 'append:intro' });
  assert.throws(() => layoutProposalValues(extra)); checks++;
  const unknown = structuredClone(good); unknown.entries[0].field = 'markdown:1';
  assert.throws(() => layoutProposalValues(unknown)); checks++;
  const duplicate = structuredClone(good); duplicate.entries[1] = duplicate.entries[0];
  assert.throws(() => layoutProposalValues(duplicate)); checks++;
  const html = structuredClone(good); html.entries[0].text += '\n<img src="https://example.invalid">';
  assert.throws(() => layoutProposalValues(html)); checks++;
  const reordered = structuredClone(good), lines = reordered.entries[0].text.split('\n');
  const row = lines.findIndex(line => line.startsWith('| `U`'));
  [lines[row], lines[row + 1]] = [lines[row + 1], lines[row]];
  reordered.entries[0].text = lines.join('\n');
  assert.throws(() => layoutProposalValues(reordered)); checks++;
  const baseline = { notebook: { cells: Array.from({ length: 9 }, (_, i) => ({
    name: i === 1 ? 'coordinates' : i === 4 ? 'cycles' : `cell_${i}`,
    type: [1, 4].includes(i) ? 'markdown' : 'code', code: `preserved_${i}` })) } };
  const source = expectedLayoutSource(baseline);
  assert.deepEqual(source, expectedLayoutSource(baseline)); checks++;
  const wrongPredecessor = structuredClone(baseline); wrongPredecessor.notebook.cells[2].code += 'changed';
  assert.throws(() => assert.deepEqual(source, expectedLayoutSource(wrongPredecessor))); checks++;
  const wrongSource = structuredClone(source); wrongSource.notebook.cells[1].code = wrongSource.notebook.cells[1].code.slice(1);
  assert.throws(() => assert.deepEqual(wrongSource, expectedLayoutSource(baseline))); checks++;
  return checks;
}
