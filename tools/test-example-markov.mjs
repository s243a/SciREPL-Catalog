#!/usr/bin/env node
// Data-only example checks: never execute a workbook cell or invoke a runtime.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { coordinateDiagrams, assertCoordinateSvgInvariants, splitCoordinateDiagrams,
  restoreCoordinateDiagrams, reembedCoordinateDiagrams, diagramAccessibility } from './markov-coordinate-diagrams.mjs';
import { parseMoveCycles, annotateMoveCycles, cycleCommentLabels, withoutCycleComments } from './markov-cycle-comments.mjs';

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
    'show_turn', 'markov_bridge', 'transition_matrix', 'sticker_bridge',
    'sticker_step', 'trajectory_bridge', 'random_walk', 'takeaways',
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
const cycles = parseMoveCycles(named('cube_moves'));
const faceNames = 'UDFBLR';
const centres = [4, 13, 22, 31, 40, 49];
const identity = Array.from({ length: 54 }, (_, i) => i);
const permutations = {};

check('Nested-list comments label geometry without changing the literal or other code', () => {
  const original = withoutCycleComments(named('cube_moves'));
  const labels = cycleCommentLabels(named('cycles'));
  const result = annotateMoveCycles(original, labels);
  assert.equal(result.comments.length, 30);
  assert.equal(named('cube_moves'), result.code, 'English workbook must include the actual explanatory comments');
  assert.equal(withoutCycleComments(result.code), original);
  assert.deepEqual(parseMoveCycles(result.code), cycles);
  assert.equal(annotateMoveCycles(result.code, labels).code, result.code);
  assert.throws(() => annotateMoveCycles(original, { ...labels, strip: 'unsafe\ncode' }));
  assert.throws(() => annotateMoveCycles(original, { ...labels, strip: 'unsafe\u0000label' }));
  assert.throws(() => annotateMoveCycles(original, { ...labels, strip: 'unsafe\u2028label' }));
  assert.throws(() => annotateMoveCycles(original, { ...labels, corner: undefined }));
});

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
check('Front-referenced global-axis rotations reproduce every face frame', () => {
  const front = faces.find(face => face.name === 'F');
  const rotateFrame = (axis, quarterTurns, vector) => {
    let result = [...vector];
    for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) {
      const [x, y, z] = result;
      result = (axis === 'y' ? [z, y, -x] : [x, -z, y]).map(value => value || 0);
    }
    return result;
  };
  for (const [name, axis, quarterTurns] of [
    ['R', 'y', 1], ['B', 'y', 2], ['L', 'y', -1], ['U', 'x', -1], ['D', 'x', 1],
  ]) {
    const target = faces.find(face => face.name === name);
    for (const key of ['right', 'up', 'normal']) {
      assert.deepEqual(rotateFrame(axis, quarterTurns, front[key]), target[key], `${name}/${key}`);
    }
  }
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
  assert.equal(book.notebook.cells.length, 13);
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
  assert.equal(named('cube_moves').match(/FACE_NAMES = "([A-Z]+)"/)?.[1], faceNames);
  assert.deepEqual(Object.keys(cycles), [...faceNames]);
});
check('Stored cycles use smallest-index starts and ascending first-index order', () => {
  for (const move of Object.values(cycles)) {
    const firstIndices = move.map(cycle => cycle[0]);
    assert.deepEqual(firstIndices, [...firstIndices].sort((a, b) => a - b));
    for (const cycle of move) assert.equal(cycle[0], Math.min(...cycle));
  }
});
check('Own-face cycles and neighbouring-strip cycles have the documented grouping', () => {
  faces.forEach((face, faceIndex) => {
    const ownCycles = [], stripCycles = [];
    cycles[face.name].forEach((cycle, cycleIndex) => {
      const ownerFaces = cycle.map(position => Math.floor(position / 9));
      if (ownerFaces.every(owner => owner === faceIndex)) ownCycles.push(cycleIndex + 1);
      else {
        assert(ownerFaces.every(owner => owner !== faceIndex), 'Cycle mixes face and strip positions');
        assert.equal(new Set(ownerFaces).size, 4, 'Strip cycle must visit four distinct adjacent faces');
        ownerFaces.forEach(owner => assert.equal(dot(face.normal, faces[owner].normal), 0));
        stripCycles.push(cycleIndex + 1);
      }
    });
    assert.deepEqual(ownCycles, ['U', 'D'].includes(face.name) ? [1, 2] : [4, 5]);
    assert.deepEqual(stripCycles, ['U', 'D'].includes(face.name) ? [3, 4, 5] : [1, 2, 3]);
  });
  assert.deepEqual(cycles.F[0], [6, 45, 11, 44]);
  assert.deepEqual(cycles.F[0].map(position => faceNames[Math.floor(position / 9)]), ['U', 'R', 'D', 'L']);
});
check('Changing the starting entry of a cycle does not change its directed permutation', () => {
  const destinations = cycle => Object.fromEntries(cycle.map((position, i) => [position, cycle[(i + 1) % cycle.length]]));
  for (const move of Object.values(cycles)) for (const cycle of move) {
    for (let offset = 1; offset < cycle.length; offset++) {
      assert.deepEqual(destinations([...cycle.slice(offset), ...cycle.slice(0, offset)]), destinations(cycle));
    }
  }
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
  assert.deepEqual(quotedCycles.slice(0, 3), cycles.U.slice(0, 3));
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
check('English data-geometry explanation states the actual deterministic presentation', () => {
  const prose = named('cycles');
  assert.match(prose, /smallest flat sticker index/);
  assert.match(prose, /sorted by those starting indices/);
  assert.match(prose, /not a choice to start at local drawing-right/);
  assert(prose.includes('`9 * face_index + 3 * row + column`'));
  assert(prose.includes('`[6, 45, 11, 44]`'));
  assert.match(prose, /U bottom-left → R top-left → D top-right → L bottom-right → U bottom-left/);
  assert.match(prose, /\| `U`, `D` \| `1–2` \| `3–5` \|/);
  assert.match(prose, /\| `F`, `B`, `L`, `R` \| `4–5` \| `1–3` \|/);
  const locations = cycles.F[0].map(index => [faceNames[Math.floor(index / 9)],
    Math.floor((index % 9) / 3), index % 3]);
  assert.deepEqual(locations, [['U', 2, 0], ['R', 0, 0], ['D', 0, 2], ['L', 2, 2]]);
});
check('Face-numbering table agrees with zero-based positions and printed one-based numbers', () => {
  const prose = named('coordinates');
  const rows = prose.split('\n').filter(line => /^\| `[UDFBLR]` —/.test(line));
  assert.equal(rows.length, 6);
  rows.forEach((line, index) => {
    const row = line.split('|').map(text => text.trim()).filter(Boolean);
    assert(row[0].startsWith(`\`${faceNames[index]}\``));
    assert(row[0].includes(`(\`${index}\`)`));
    assert.equal(row[1], `\`${9 * index}–${9 * index + 8}\``);
    assert.equal(row[2], `\`${9 * index + 1}–${9 * index + 9}\``);
  });
  assert(prose.includes('`FACE_NAMES = "UDFBLR"` defines the numbering'));
  assert.match(prose, /reordering only that dictionary does not renumber sticker positions/);
  assert.match(prose, /Starting afresh from F for each face/);
  assert(prose.includes('`r = -x`, `u = +y`, `n = -z`'));
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

const optionsLiteral = named('transition_matrix').match(/MOVE_OPTIONS = (\[[^\n]+\])/);
assert(optionsLiteral, 'Missing lazy-walk move data');
const options = JSON.parse(optionsLiteral[1]);
check('Lazy symmetric walk has exactly identity and all moves/inverses', () => {
  assert.deepEqual(options, ['I', ...[...faceNames].flatMap(name => [name, `${name}'`])]);
});
check('Stage 4 places each explanation immediately before its own code', () => {
  for (const [prose, code] of [['markov_bridge', 'transition_matrix'],
    ['sticker_bridge', 'sticker_step'], ['trajectory_bridge', 'random_walk']]) {
    const index = markov.notebook.cells.findIndex(cell => cell.name === prose);
    assert.equal(markov.notebook.cells[index].type, 'markdown');
    assert.equal(markov.notebook.cells[index + 1].name, code);
    assert.equal(markov.notebook.cells[index + 1].type, 'code');
  }
  assert.match(named('intro'), /`show_turn`, `transition_matrix`, `sticker_step`/);
});
check('Readable transition construction counts alternatives rather than composing them', () => {
  assert.match(named('transition_matrix'), /move_counts = IDENTITY\.copy\(\)\nfor name in FACE_NAMES:\n    move_counts \+= M\[name\]\n    move_counts \+= M\[name\]\.T\nT = move_counts \/ len\(MOVE_OPTIONS\)/);
  assert.match(named('markov_bridge'), /alternatives for one step, not moves performed in sequence/);
  assert.match(named('markov_bridge'), /Every chosen move still acts on the whole cube/);
  assert.match(named('trajectory_bridge'), /Here `a` is chosen first, then `b`/);
  assert(!named('random_walk').includes('location_probability'));
});
check('One-hot code and TeX make the single-sticker observable explicit', () => {
  assert.match(named('sticker_step'), /location_probability = np\.zeros\(N\)\nlocation_probability\[0\] = 1\nafter_one_step = T @ location_probability/);
  assert(named('sticker_bridge').includes('`T[:, 0]`'));
  assert(named('sticker_bridge').includes('x_i^{(0)}=\\begin{cases}1,&i=j'));
  assert(named('sticker_bridge').includes('x_d^{(1)}=\\sum_{i=0}^{53}T_{d,i}x_i^{(0)}.'));
  assert(named('sticker_bridge').includes('\\Longrightarrow\\quad x_d^{(1)}=T_{d,j}'));
  assert(!named('sticker_bridge').includes('=T_{d,0}'));
  assert(named('sticker_bridge').includes('**any starting probability distribution**'));
  assert(named('sticker_bridge').includes('**one-hot at position `j`**'));
  assert(named('sticker_bridge').includes('`SOLVED[0] = 1` and `SOLVED[5] = 6`'));
  const formulas = ['markov_bridge', 'sticker_bridge', 'trajectory_bridge']
    .flatMap(name => [...named(name).matchAll(/\$\$[\s\S]*?\$\$/g)]);
  assert.equal(formulas.length, 4);
  assert.match(named('sticker_bridge'), /normalization only/);
});
check('Actual moves confirm seven stays and six one-step destinations for position zero', () => {
  const destinations = options.map(option => {
    const permutation = option === 'I' ? identity : option.endsWith("'")
      ? inverse(permutations[option.slice(0, -1)]) : permutations[option];
    return permutation[0];
  });
  assert.deepEqual(options.filter((_, index) => destinations[index] === 0),
    ['I', 'D', "D'", 'F', "F'", 'R', "R'"]);
  assert.deepEqual(destinations.filter(destination => destination !== 0).sort((a, b) => a - b),
    [2, 6, 18, 35, 42, 47]);
  assert(named('sticker_bridge').includes('`T[0, 0] = 7/13`'));
  for (const [move, destination] of [['U', 2], ["U'", 6], ['L', 18], ["L'", 35], ['B', 42], ["B'", 47]]) {
    const permutation = move.endsWith("'") ? inverse(permutations[move.slice(0, -1)]) : permutations[move];
    assert.equal(permutation[0], destination);
    assert(named('sticker_bridge').includes('`' + move + '` → `' + destination + '`'));
  }
});
check('Column mechanics include their destination-probability meaning', () => {
  assert(named('markov_bridge').includes('`move_counts[d, j]`'));
  assert(named('sticker_bridge').includes('`after_one_step[d] = T[d, 0]`'));
  assert.match(named('sticker_bridge'), /probability that sticker 1 is at position `d`/);
  assert.match(named('sticker_bridge'), /distribution of destinations for the sticker starting at position 0/);
  assert.match(named('markov_bridge'), /one 1 per column and one 1 per row/);
  assert.match(named('markov_bridge'), /Separately, equal weighting/);
});
check('Convergence and the corner-position hint distinguish the two models', () => {
  assert.match(named('markov_bridge'), /Vertices are reachable configurations/);
  assert.match(named('trajectory_bridge'), /connected on reachable configurations \(irreducible\)/);
  assert.match(named('trajectory_bridge'), /self-loop makes it aperiodic/);
  assert.match(named('takeaways'), /\*\*Hint for question 5:\*\*/);
  assert.match(named('takeaways'), /24 corner-sticker positions/);
  assert.match(named('takeaways'), /not uniform across all 54 positions/);
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
