// Owner-requested controller clarification; no model calls or workbook writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { applyStage4MathDirection } from './markov-stage4-math-direction.mjs';

export const MARKOV_PROBABILITY_PREDECESSOR = '1d8e5fd1e0a3c1970cf87947697b724ee5dd5501';
export const GENERAL_PROBABILITY_MATH = '$$\nx_d^{(1)}=\\sum_{i=0}^{53}T_{d,i}x_i^{(0)}.\n$$';
export const ONE_HOT_PROBABILITY_MATH = '$$\n\\begin{gathered}\nx_i^{(0)}=\\begin{cases}1,&i=j,\\\\0,&i\\ne j,\\end{cases}\\\\\n\\Longrightarrow\\quad x_d^{(1)}=T_{d,j}.\n\\end{gathered}\n$$';
const root = fileURLToPath(new URL('..', import.meta.url));
const prose = JSON.parse(readFileSync(new URL('./markov-probability-clarification.json', import.meta.url), 'utf8'));
assert.deepEqual(Object.keys(prose).sort(), [...EXAMPLE_LOCALES].sort());
for (const locale of EXAMPLE_LOCALES) for (const key of ['labels', 'general', 'conditional', 'example']) {
  const protectedParts = text => ({
    inline: [...text.matchAll(/`([^`\n]+)`/g)].map(match => match[1]).sort(),
    numbers: [...text.matchAll(/\d+(?:\.\d+)?/g)].map(match => match[0]).sort(),
  });
  assert.deepEqual(protectedParts(prose[locale][key]), protectedParts(prose.en[key]),
    `${locale}/${key}: protected inline-code or numeric-token drift`);
}
const cache = new Map();
const pinned = rel => {
  if (!cache.has(rel)) cache.set(rel, JSON.parse(execFileSync('git', ['show', `${MARKOV_PROBABILITY_PREDECESSOR}:${rel}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })));
  return structuredClone(cache.get(rel));
};
const priorParts = pinned('tools/markov-stage4-text.json');

function clarifiedSticker(raw, locale) {
  const paragraphs = raw.split('\n\n');
  assert.equal(paragraphs.length, 9, 'Require pinned sticker explanation structure');
  const text = prose[locale];
  assert.deepEqual(Object.keys(text).sort(), ['conditional', 'example', 'general', 'labels']);
  for (const value of Object.values(text)) {
    assert.equal(typeof value, 'string'); assert(value.trim());
    assert(!/\n|<|\uFFFD/.test(value), 'Invalid controller clarification paragraph');
  }
  return [paragraphs[0], text.labels, text.general, GENERAL_PROBABILITY_MATH,
    text.conditional, ONE_HOT_PROBABILITY_MATH, text.example, ...paragraphs.slice(7)].join('\n\n');
}

export const clarifiedStage4Parts = Object.freeze({ ...priorParts, sticker: clarifiedSticker(priorParts.sticker, 'en') });

export function applyProbabilityClarification(book, locale) {
  assert(EXAMPLE_LOCALES.includes(locale), 'Unknown clarification locale');
  assert.deepEqual(book, pinned(`workbooks/${locale}/markov-groups.srwb`), 'Require exact reviewed Stage 4 predecessor');
  const result = applyStage4MathDirection(book, locale, { reverse: true, sourceParts: priorParts });
  const cell = result.notebook.cells[8];
  assert.equal(cell.name, 'sticker_bridge'); assert.equal(cell.type, 'markdown');
  cell.code = clarifiedSticker(cell.code, locale);
  const wrapped = applyStage4MathDirection(result, locale, { sourceParts: clarifiedStage4Parts });
  const restored = structuredClone(wrapped);
  restored.notebook.cells[8] = structuredClone(book.notebook.cells[8]);
  assert.deepEqual(restored, book, 'Clarification changed code, other Markdown, order or metadata');
  return wrapped;
}
