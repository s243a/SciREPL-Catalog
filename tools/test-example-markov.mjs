#!/usr/bin/env node
// Data-only example checks: never execute a workbook cell or invoke a runtime.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { coordinateDiagrams, assertCoordinateSvgInvariants, splitCoordinateDiagrams,
  restoreCoordinateDiagrams, reembedCoordinateDiagrams, diagramAccessibility } from './markov-coordinate-diagrams.mjs';

const readWorkbook = name => JSON.parse(readFileSync(
  new URL(`../workbooks/en/${name}.srwb`, import.meta.url), 'utf8'));
const markov = readWorkbook('markov-groups');
const simpson = readWorkbook('simpsons-paradox');
let passed = 0;
const check = (name, test) => { test(); passed++; console.log(`[PASS] ${name}`); };

for (const [name, workbook] of [['Markov', markov], ['Simpson', simpson]]) {
  check(`${name} uses clean catalog metadata`, () => {
    assert.deepEqual(Object.keys(workbook).sort(), ['format', 'notebook', 'version']);
    assert.equal(workbook.format, 'srwb');
    assert.equal(workbook.version, '1.0');
    assert.deepEqual(Object.keys(workbook.notebook).sort(), ['cells', 'name']);
    const names = new Set();
    for (const cell of workbook.notebook.cells) {
      assert.deepEqual(Object.keys(cell).sort(), ['code', 'language', 'name', 'type']);
      assert.match(cell.name, /^[a-z][a-z0-9_]*$/);
      assert(!names.has(cell.name), `Duplicate cell name: ${cell.name}`);
      names.add(cell.name);
      assert.equal(typeof cell.code, 'string');
      assert(!['ai', 'sql'].includes(cell.language));
    }
  });
}

const named = name => {
  const cell = markov.notebook.cells.find(cell => cell.name === name);
  assert(cell, `Missing cell: ${name}`);
  return cell.code;
};
check('Markov has staged, named Python and Markdown cells', () => {
  assert.deepEqual(markov.notebook.cells.map(cell => cell.name), [
    'intro', 'coordinates', 'cube_moves', 'check_moves', 'cycles',
    'show_turn', 'markov_bridge', 'random_walk', 'takeaways',
  ]);
  for (const cell of markov.notebook.cells) {
    assert.equal(cell.language, cell.type === 'markdown' ? 'markdown' : 'python');
  }
});
check('Simpson retains its load-bearing English names', () => {
  assert.deepEqual(simpson.notebook.cells.map(cell => cell.name), [
    'intro', 'data', 'pause', 'compute', 'viz', 'js_check', 'explanation',
  ]);
});

const cycleLiteral = named('cube_moves').match(/MOVE_CYCLES = ([\s\S]+?)\n\n/);
assert(cycleLiteral, 'Missing literal move-cycle data');
const cycles = JSON.parse(cycleLiteral[1]);
const faceNames = 'UDFBLR';
const centres = [4, 13, 22, 31, 40, 49];
const identity = Array.from({ length: 54 }, (_, i) => i);
const permutations = {};

// Independent physical oracle: rotate a layer by -90 degrees about its
// outward normal. A sticker has a cubelet position and a face normal.
const faces = [
  { name: 'U', normal: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] },
  { name: 'D', normal: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  { name: 'F', normal: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
  { name: 'B', normal: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0] },
  { name: 'L', normal: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
  { name: 'R', normal: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] },
];
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
check('Every face drawing frame is right-handed with its stated outward normal', () => {
  for (const face of faces) assert.deepEqual(cross(face.right, face.up).map(value => value || 0), face.normal);
  const tableRows = named('coordinates').split('\n').filter(line => /^\| [UDFBLR] \|/.test(line));
  assert.equal(tableRows.length, faces.length);
  faces.forEach((face, index) => {
    const row = tableRows[index].split('|').map(item => item.trim()).filter(Boolean);
    assert.equal(row[0], face.name);
    const vectors = row.slice(1).map(text => JSON.parse(text.replace('(', '[').replace(')', ']')));
    assert.deepEqual(vectors, [face.normal, face.right, face.up]);
  });
  assert.match(named('coordinates'), /Right in face view/);
  assert.match(named('coordinates'), /Up in face view/);
  assert.match(named('coordinates'), /perpendicular to the paper/);
  assert.match(named('coordinates'), /not a path-independent/);
});
check('Front-to-top tilt maps the full basis, not the fixed global axes', () => {
  const tilt = ([x, y, z]) => [x, z, -y].map(value => value || 0);
  const front = faces.find(face => face.name === 'F'), top = faces.find(face => face.name === 'U');
  assert.deepEqual(tilt(front.right), top.right);
  assert.deepEqual(tilt(front.up), top.up);
  assert.deepEqual(tilt(front.normal), top.normal);
  assert.deepEqual(cross(tilt(front.right), tilt(front.up)).map(value => value || 0), tilt(front.normal));
});
check('Static coordinate diagrams have fixed inert geometry and safe accessible text', () => {
  const english = named('coordinates'), { prose } = splitCoordinateDiagrams(english);
  assert.equal(restoreCoordinateDiagrams(prose, diagramAccessibility), english);
  assert.equal(reembedCoordinateDiagrams(english), english);
  assertCoordinateSvgInvariants(english);
  const quoted = diagramAccessibility.map(item => ({ title: item.title + ' " <tag>', desc: item.desc + ' & <tag>' }));
  const safe = coordinateDiagrams(quoted).join('\n');
  assertCoordinateSvgInvariants(safe);
  assert(!safe.includes('<tag>')); assert(safe.includes('&quot;'));
  assert.throws(() => assertCoordinateSvgInvariants(english.replace('stroke-width="2"', 'stroke-width="3"')));
  assert.throws(() => assertCoordinateSvgInvariants(english.replace('<path', '<path onclick="alert(1)"')));
});
for (const locale of EXAMPLE_LOCALES) check(`${locale} embeds both coordinate diagrams without runtime output`, () => {
  const book = JSON.parse(readFileSync(new URL(`../workbooks/${locale}/markov-groups.srwb`, import.meta.url), 'utf8'));
  assert.deepEqual(book.notebook.cells.map(cell => cell.name), markov.notebook.cells.map(cell => cell.name));
  assert.equal(book.notebook.cells.length, 9);
  const cell = book.notebook.cells[1];
  assert.equal(cell.name, 'coordinates'); assert.equal(cell.type, 'markdown');
  assertCoordinateSvgInvariants(cell.code);
  assert.match(cell.code, /`r × u = n`/);
});
const key = (position, normal) => `${position.join(',')}/${normal.join(',')}`;
const stickers = faces.flatMap((face, f) => Array.from({ length: 9 }, (_, i) => ({
  index: 9 * f + i,
  normal: face.normal,
  position: face.normal.map((n, axis) => n + (i % 3 - 1) * face.right[axis]
    + (1 - Math.floor(i / 3)) * face.up[axis]),
})));
const positions = new Map(stickers.map(sticker => [
  key(sticker.position, sticker.normal), sticker.index,
]));
const rotate = (vector, normal) => {
  const product = cross(normal, vector), projection = dot(normal, vector);
  return vector.map((_, axis) => -product[axis] + normal[axis] * projection);
};
const compose = (after, before) => before.map(destination => after[destination]);
const inverse = permutation => {
  const result = [];
  permutation.forEach((destination, source) => { result[destination] = source; });
  return result;
};

check('Move data names all six faces in the stated layout', () => {
  assert.deepEqual(Object.keys(cycles), [...faceNames]);
});
for (const face of faces) {
  const permutation = [...identity];
  check(`${face.name} has five disjoint four-cycles`, () => {
    assert.equal(cycles[face.name].length, 5);
    const used = new Set();
    for (const cycle of cycles[face.name]) {
      assert.equal(cycle.length, 4);
      cycle.forEach((source, i) => {
        assert(Number.isInteger(source) && source >= 0 && source < 54);
        assert(!used.has(source), `Repeated cycle position: ${source}`);
        used.add(source);
        permutation[source] = cycle[(i + 1) % cycle.length];
      });
    }
    assert.equal(used.size, 20);
  });
  permutations[face.name] = permutation;
  check(`${face.name} is bijective and fixes all face centres`, () => {
    assert.deepEqual([...permutation].sort((a, b) => a - b), identity);
    for (const centre of centres) assert.equal(permutation[centre], centre);
  });
  check(`${face.name} has fourth power identity and a transpose inverse`, () => {
    let power = [...identity];
    for (let turn = 0; turn < 4; turn++) power = compose(permutation, power);
    assert.deepEqual(power, identity);
    assert.notDeepEqual(compose(permutation, permutation), identity);
    assert.deepEqual(compose(inverse(permutation), permutation), identity);
  });
  check(`${face.name} matches a physical clockwise layer rotation`, () => {
    const expected = stickers.map(sticker => dot(sticker.position, face.normal) === 1
      ? positions.get(key(rotate(sticker.position, face.normal),
        rotate(sticker.normal, face.normal))) : sticker.index);
    assert(!expected.includes(undefined));
    assert.deepEqual(permutation, expected);
  });
}
check('U cycle literals identify face corners, edge middles and adjacent top strips', () => {
  assert.deepEqual(cycles.U, [
    [0, 2, 8, 6], [1, 5, 7, 3],
    [18, 36, 27, 45], [19, 37, 28, 46], [20, 38, 29, 47],
  ]);
  for (const index of cycles.U[0]) {
    const { position, normal } = stickers[index];
    assert.deepEqual(normal, faces[0].normal);
    assert.equal(Math.abs(position[0]) + Math.abs(position[2]), 2);
  }
  for (const index of cycles.U[1]) {
    const { position, normal } = stickers[index];
    assert.deepEqual(normal, faces[0].normal);
    assert.equal(Math.abs(position[0]) + Math.abs(position[2]), 1);
  }
  cycles.U.slice(2).forEach((cycle, column) => assert.deepEqual(cycle.map(index => [
    faceNames[Math.floor(index / 9)], Math.floor((index % 9) / 3), index % 3,
  ]), ['F', 'L', 'B', 'R'].map(face => [face, 0, column])));
});
check('English U-cycle prose agrees with the literal data and printed position numbering', () => {
  const prose = named('cycles');
  const quotedCycles = [...prose.matchAll(/`(\[[\d,\s]+\])`/g)].map(match => JSON.parse(match[1]));
  assert.deepEqual(quotedCycles, cycles.U.slice(0, 3));
  assert.match(prose, /clockwise when viewed directly from outside the turned face/);
  assert.match(prose, /last entry moves back to the first/);
  assert.match(prose, /All five cycles act simultaneously/);
  for (const cycle of cycles.U.slice(0, 2)) {
    const path = [...cycle, cycle[0]].map(position => position + 1).join(' → ');
    assert(prose.includes(`\`${path}\``), `Missing one-based face cycle: ${path}`);
  }
  const strip = cycles.U[2];
  const facePath = [...strip, strip[0]].map(position => faceNames[Math.floor(position / 9)]).join(' → ');
  assert(prose.includes(`\`${facePath}\``));
  assert(prose.includes(`sticker at position \`${strip[0]}\` to position \`${strip[1]}\``));
  assert.match(prose, /positions, not necessarily the sticker labels/);
  assert.match(prose, /All face centres stay fixed/);
});
check('Shown U cycles add one to every position and close source-to-destination arrows', () => {
  const show = named('show_turn');
  assert.match(show, /for cycle in MOVE_CYCLES\["U"\]:/);
  assert.match(show, /" -> "\.join\(str\(position \+ 1\) for position in cycle \+ cycle\[:1\]\)/);
  const lines = cycles.U.map(cycle => [...cycle, cycle[0]].map(position => position + 1).join(' -> '));
  assert.deepEqual(lines, [
    '1 -> 3 -> 9 -> 7 -> 1', '2 -> 6 -> 8 -> 4 -> 2',
    '19 -> 37 -> 28 -> 46 -> 19', '20 -> 38 -> 29 -> 47 -> 20',
    '21 -> 39 -> 30 -> 48 -> 21',
  ]);
  assert.match(named('cube_moves'), /zip\(cycle, cycle\[1:\] \+ cycle\[:1\]\):\n\s+p\[source\] = destination/);
  for (const [face, moveCycles] of Object.entries(cycles)) for (const cycle of moveCycles) {
    const closed = [...cycle, cycle[0]];
    for (let i = 0; i < cycle.length; i++) {
      assert(!centres.includes(closed[i]), `${face} cycle must omit face centres`);
      assert.equal(permutations[face][closed[i]], closed[i + 1]);
    }
  }
});
check('Five U sticker cycles describe eight coupled physical pieces, not five independent moves', () => {
  const pieceStickerCounts = new Map();
  for (const index of cycles.U.flat()) {
    const position = stickers[index].position.join(',');
    pieceStickerCounts.set(position, (pieceStickerCounts.get(position) ?? 0) + 1);
  }
  assert.deepEqual([...pieceStickerCounts.values()].sort((a, b) => a - b), [2, 2, 2, 2, 3, 3, 3, 3]);
  assert.match(named('cycles'), /corner piece \(cubie\) carries three stickers, and an edge piece carries two/);
  assert.match(named('cycles'), /side stickers occur in the surrounding-strip cycles/);
  assert.match(named('cycles'), /not five independent moves of whole pieces/);
});
check('U and R do not commute', () => {
  assert.notDeepEqual(compose(permutations.U, permutations.R),
    compose(permutations.R, permutations.U));
});
check('Python matrix convention keeps sources in columns', () => {
  assert.match(named('cube_moves'), /P\[p, np\.arange\(N\)\] = 1/);
  assert.match(named('check_moves'), /matrix_power\(matrix, 4\)/);
  assert.match(named('check_moves'), /p\[CENTRES\]/);
});

const optionsLiteral = named('random_walk').match(/MOVE_OPTIONS = (\[[^\n]+\])/);
assert(optionsLiteral, 'Missing lazy-walk move data');
const options = JSON.parse(optionsLiteral[1]);
check('Lazy symmetric walk has exactly identity and all moves/inverses', () => {
  assert.deepEqual(options, ['I', ...[...faceNames].flatMap(name => [name, `${name}'`])]);
});
check('One-sticker mixture is doubly stochastic and fixes centres', () => {
  const counts = Array.from({ length: 54 }, () => Array(54).fill(0));
  for (const option of options) {
    const permutation = option === 'I' ? identity : option.endsWith("'")
      ? inverse(permutations[option.slice(0, -1)]) : permutations[option];
    permutation.forEach((destination, source) => { counts[destination][source]++; });
  }
  for (let i = 0; i < 54; i++) {
    assert.equal(counts[i].reduce((sum, x) => sum + x, 0), options.length);
    assert.equal(counts.reduce((sum, row) => sum + row[i], 0), options.length);
    for (let j = 0; j < 54; j++) assert.equal(counts[i][j], counts[j][i]);
  }
  for (const centre of centres) assert.equal(counts[centre][centre], options.length);
});

console.log(`PASS: ${passed} clean-example and cube-data checks (no workbook code executed).`);
