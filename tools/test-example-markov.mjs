#!/usr/bin/env node
// Data-only example checks: never execute a workbook cell or invoke a runtime.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
