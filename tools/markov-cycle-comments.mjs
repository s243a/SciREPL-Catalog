// Pure data helpers for user-authorized explanatory comments. No code is run.
import assert from 'node:assert/strict';

const literalPattern = /MOVE_CYCLES = ([\s\S]+?)\n\n/;
const faceNames = 'UDFBLR';
const insertedCommentLines = /^ {8}# [^\r\n]*\n/gm;
const unsafeLabel = /[\u0000-\u001f\u007f-\u009f\u2028\u2029#<>]/u;

function assertCommentLabels(labels) {
  for (const key of ['corner', 'edge', 'strip']) {
    assert(typeof labels[key] === 'string' && labels[key].trim() && !unsafeLabel.test(labels[key]),
      'Unsafe/empty cycle comment label');
  }
}

function literalOf(code) {
  const match = code.match(literalPattern);
  assert(match, 'Missing MOVE_CYCLES literal');
  return match[1];
}

export function withoutCycleComments(code) {
  const literal = literalOf(code);
  const clean = literal.replace(insertedCommentLines, '');
  assert(!clean.includes('#'), 'Unexpected comment inside the move data');
  JSON.parse(clean);
  return code.replace(literalPattern, () => `MOVE_CYCLES = ${clean}\n\n`);
}

export function parseMoveCycles(code) {
  return JSON.parse(literalOf(withoutCycleComments(code)));
}

export function cycleCommentLabels(markdown) {
  const labelFor = cycle => {
    const line = markdown.split('\n').find(text => text.includes('`' + cycle + '`'));
    assert(line, 'Missing unchanged corner/edge explanation');
    const label = line.match(/\*\*([^*]+)\*\*/)?.[1];
    assert(label, 'Missing localized corner/edge label');
    return label.replace(/[:：\s]+$/u, '');
  };
  const table = markdown.split('\n').find(line => /^\|[^`]*\|[^`]*\|[^`]*\|\s*$/.test(line)
    && !/^\|[\s|:-]+$/.test(line));
  assert(table, 'Missing localized cycle-grouping table header');
  const strip = table.split('|').map(text => text.trim()).filter(Boolean)[2];
  const labels = { corner: labelFor('[0, 2, 8, 6]'), edge: labelFor('[1, 5, 7, 3]'), strip };
  assertCommentLabels(labels);
  return labels;
}

export function annotateMoveCycles(code, labels) {
  assertCommentLabels(labels);
  const baseline = withoutCycleComments(code);
  const literal = literalOf(baseline), cycles = JSON.parse(literal);
  const comments = [];
  for (const [face, move] of Object.entries(cycles)) {
    for (const [cycleIndex, cycle] of move.entries()) {
      const ownFace = cycle.every(position => faceNames[Math.floor(position / 9)] === face);
      let text;
      if (ownFace) {
        const local = cycle.map(position => position % 9);
        const corner = local.every(position => [0, 2, 6, 8].includes(position));
        assert(corner || local.every(position => [1, 3, 5, 7].includes(position)));
        text = `${face}: ${corner ? labels.corner : labels.edge}`;
      } else {
        const route = [...cycle, cycle[0]].map(position => faceNames[Math.floor(position / 9)]).join(' → ');
        text = `${labels.strip}: ${route}`;
      }
      assert(!/[\r\n#]/u.test(text), 'Unsafe comment');
      comments.push({ face, cycleIndex, text });
    }
  }
  assert.equal(comments.length, 30);
  let cursor = 0;
  const annotatedLiteral = literal.replace(/^ {8}\[$/gm, line => {
    const entry = comments[cursor++];
    assert(entry, 'More arrays than authorized comments');
    return `        # ${entry.text}\n${line}`;
  });
  assert.equal(cursor, 30, 'Expected the existing 30 nested cycle arrays');
  const annotated = baseline.replace(literalPattern, () => `MOVE_CYCLES = ${annotatedLiteral}\n\n`);
  assert.equal(withoutCycleComments(annotated), baseline);
  assert.deepEqual(parseMoveCycles(annotated), cycles);
  return { code: annotated, comments, labels };
}
