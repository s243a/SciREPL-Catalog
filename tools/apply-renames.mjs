#!/usr/bin/env node
/**
 * apply-renames.mjs — mechanically apply an identifier/cell-name glossary to
 * a workbook. The Stage B division of labor: a worker (any model) PROPOSES
 * the glossary; this tool APPLIES it deterministically; span-derive
 * --allow-renames and the runtime oracle VERIFY it. No agent edits code.
 *
 *   node tools/apply-renames.mjs <workbook.srwb> <glossary.json> <out.srwb>
 *
 * Glossary shape:
 *   { "renames":    { "sides": "lados", ... },
 *     "cell_names": { "bounds": "cotas", ... } }
 *
 * Rules enforced here (span-derive re-verifies independently):
 * - only id micro-tokens in CODE tokens and non-literal f-string
 *   placeholders are renamed; comments, strings, literal runs, attribute
 *   positions (after '.'), keywords, and numbers are never touched
 * - targets must be valid NFC Python identifiers
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  cellsOf, tokenize, segmentFString, microTokens,
  isValidPyIdentifier, PY_KEYWORDS,
} from './span-lib.mjs';

const [, , wbPath, glossPath, outPath] = process.argv;
if (!wbPath || !glossPath || !outPath) {
  console.error('usage: apply-renames.mjs <workbook.srwb> <glossary.json> <out.srwb>');
  process.exit(2);
}

const wb = JSON.parse(readFileSync(wbPath, 'utf8'));
const gloss = JSON.parse(readFileSync(glossPath, 'utf8'));
// NFC-normalize all targets: some scripts' natural forms are not NFC as
// typed (Bengali ড়ঃ etc. are composition-EXCLUDED, so NFC is the
// decomposed sequence) — and Python normalizes identifiers itself, so a
// consistent normalization is semantically transparent.
const renames = new Map(Object.entries(gloss.renames || {}).map(([k, v]) => [k, String(v).normalize('NFC')]));
const cellNames = new Map(Object.entries(gloss.cell_names || {}).map(([k, v]) => [k, String(v).normalize('NFC')]));

// glossary sanity before touching anything
const bad = [];
for (const [from, to] of renames) {
  if (PY_KEYWORDS.has(from)) bad.push(`'${from}' is a keyword`);
  if (!isValidPyIdentifier(to)) bad.push(`target '${to}' is not a valid identifier`);
  if (to !== to.normalize('NFC')) bad.push(`target '${to}' is not NFC`);
  if (PY_KEYWORDS.has(to)) bad.push(`target '${to}' is a keyword`);
}
const targets = [...renames.values()];
if (new Set(targets).size !== targets.length) bad.push('rename targets collide');
for (const [, to] of cellNames) {
  if (!to || to.includes('/') || to.startsWith('.') || /^In\[\d+\]$/.test(to)) {
    bad.push(`cell name '${to}' is invalid`);
  }
  if (to !== to.normalize('NFC')) bad.push(`cell name '${to}' is not NFC`);
}
if (bad.length) {
  console.error('GLOSSARY REJECTED:');
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}

const renameMs = (ms) => ms.map((m) =>
  (m.kind === 'id' && !m.afterDot && !m.kwargPos && renames.has(m.text))
    ? renames.get(m.text) : m.text
).join('');

const LIT_PH = /^\{\s*'([^']*)'\s*(:[^}]*)?\}$/;
const renameFBody = (body) => segmentFString(body).map((s) => {
  if (s.type !== 'ph') return s.text;
  if (LIT_PH.test(s.text)) return s.text;    // quoted-literal header: Stage A domain
  return renameMs(microTokens(s.text));       // placeholder code: fresh context
}).join('');

// bracket context threads across the cell's code tokens (a call may be
// split around a string argument), held in `stack` during the cell walk
const rebuild = (tok, stack) => {
  if (tok.kind === 'code') {
    const ms = microTokens(tok.text, stack.current);
    stack.current = ms.finalStack;
    return renameMs(ms);
  }
  if (tok.kind === 'comment') return tok.text;
  // string: body untouched unless f-string placeholders contain identifiers
  const q = tok.quote.repeat(tok.triple ? 3 : 1);
  const body = tok.isF ? renameFBody(tok.text) : tok.text;
  return (tok.prefix || '') + q + body + q;
};

let cellsChanged = 0;
for (const c of cellsOf(wb)) {
  if (cellNames.has(c.cell.name)) c.cell.name = cellNames.get(c.cell.name);
  if (c.type === 'markdown') continue;
  const toks = tokenize(c.code);
  const roundtrip = toks.map((t) => (t.kind === 'string'
    ? (t.prefix || '') + t.quote.repeat(t.triple ? 3 : 1) + t.text + t.quote.repeat(t.triple ? 3 : 1)
    : t.text)).join('');
  if (roundtrip !== c.code) {
    console.error(`INTERNAL: tokenizer does not round-trip cell ${c.index}; refusing to rewrite`);
    process.exit(1);
  }
  const stack = { current: [] };
  const next = toks.map((t) => rebuild(t, stack)).join('');
  if (next !== c.code) {
    c.cell.code = next;
    cellsChanged++;
  }
}

writeFileSync(outPath, JSON.stringify(wb, null, 2) + '\n');
console.error(`applied ${renames.size} renames + ${cellNames.size} cell names; ${cellsChanged} code cell(s) changed -> ${outPath}`);
