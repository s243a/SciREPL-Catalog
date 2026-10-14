// Small controller-reviewed prose replacements; all completed history is pinned.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_LOCALES } from './example-lessons.mjs';
import { applyStage4MathDirection } from './markov-stage4-math-direction.mjs';

export const MARKOV_CLARITY_PREDECESSOR = 'f5958682ec637e7e7bd6470d84d489b9d267c982';
export const MARKOV_CLARITY_KEYS = ['vertices', 'counts', 'sums', 'example', 'destinations', 'convergence', 'hint'];
const root = fileURLToPath(new URL('..', import.meta.url));
const prose = JSON.parse(readFileSync(new URL('./markov-stage4-clarity.json', import.meta.url), 'utf8'));
assert.deepEqual(Object.keys(prose).sort(), [...EXAMPLE_LOCALES].sort(), 'Require all 13 localized clarity proposals');
const cache = new Map();
const pinned = rel => {
  if (!cache.has(rel)) cache.set(rel, JSON.parse(execFileSync('git', ['show', `${MARKOV_CLARITY_PREDECESSOR}:${rel}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })));
  return structuredClone(cache.get(rel));
};
const priorParts = pinned('tools/markov-stage4-text.json');
const scripts = { ar: /\p{Script=Arabic}/u, bn: /\p{Script=Bengali}/u,
  hi: /\p{Script=Devanagari}/u, ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  ko: /\p{Script=Hangul}/u, ru: /\p{Script=Cyrillic}/u, zh: /\p{Script=Han}/u };
export const clarityProtectedParts = text => ({
  inline: [...text.matchAll(/`([^`\n]+)`/g)].map(match => match[1]).sort(),
  numbers: [...text.matchAll(/\d+(?:\.\d+)?/g)].map(match => match[0]).sort(),
});
export function assertClarityProse(values, locale) {
  assert.deepEqual(Object.keys(values).sort(), [...MARKOV_CLARITY_KEYS].sort());
  for (const key of MARKOV_CLARITY_KEYS) {
    const text = values[key];
    assert.equal(typeof text, 'string'); assert(text.trim());
    assert(!/\n|<|\uFFFD/.test(text), 'Invalid localized clarity paragraph');
    assert.deepEqual(clarityProtectedParts(text), clarityProtectedParts(prose.en[key]), `${locale}/${key}: protected token drift`);
    if (locale !== 'en') assert.notEqual(text, prose.en[key], `${locale}/${key}: untranslated paragraph`);
    if (scripts[locale]) assert(scripts[locale].test(text), `${locale}/${key}: missing locale script`);
  }
  return values;
}
for (const [locale, values] of Object.entries(prose)) assertClarityProse(values, locale);

function replacements(book, locale) {
  assert(EXAMPLE_LOCALES.includes(locale), 'Unknown clarity locale');
  const text = assertClarityProse(prose[locale], locale);
  const result = applyStage4MathDirection(book, locale, { reverse: true, sourceParts: priorParts });
  for (const [index, count, changes] of [
    [6, 9, { 3: text.vertices, 6: text.counts, 8: text.sums }],
    [8, 9, { 6: text.example, 7: text.destinations }],
    [10, 6, { 5: text.convergence }],
  ]) {
    const paragraphs = result.notebook.cells[index].code.split('\n\n');
    assert.equal(paragraphs.length, count, `Require pinned Markdown structure at cell ${index}`);
    for (const [part, value] of Object.entries(changes)) paragraphs[Number(part)] = value;
    result.notebook.cells[index].code = paragraphs.join('\n\n');
  }
  result.notebook.cells[12].code += '\n\n' + text.hint;
  return result;
}
const priorEnglish = pinned('workbooks/en/markov-groups.srwb');
const revisedEnglish = replacements(priorEnglish, 'en');
export const clarityStage4Parts = Object.freeze(Object.fromEntries([
  ['matrix', 6], ['sticker', 8], ['trajectory', 10],
].map(([key, index]) => [key, revisedEnglish.notebook.cells[index].code])));

export function applyStage4Clarity(book, locale) {
  assert(EXAMPLE_LOCALES.includes(locale), 'Unknown clarity locale');
  assert.deepEqual(book, pinned(`workbooks/${locale}/markov-groups.srwb`), 'Require exact reviewed clarity predecessor');
  const raw = replacements(book, locale);
  const wrapped = applyStage4MathDirection(raw, locale, { sourceParts: clarityStage4Parts });
  const restored = structuredClone(wrapped);
  for (const index of [6, 8, 10, 12]) restored.notebook.cells[index] = structuredClone(book.notebook.cells[index]);
  assert.deepEqual(restored, book, 'Clarity pass changed code, other Markdown, order or metadata');
  const formulas = value => value.notebook.cells.flatMap(cell => cell.type === 'markdown'
    ? cell.code.match(/\$\$[\s\S]*?\$\$/g) || [] : []);
  assert.deepEqual(formulas(wrapped), formulas(book), 'Clarity pass changed mathematics');
  return wrapped;
}
