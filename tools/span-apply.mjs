#!/usr/bin/env node
/**
 * span-apply.mjs — the Stage A analog of apply-renames: a worker PROPOSES
 * translations for prose spans as {id: text} JSON; this tool applies them
 * deterministically. No agent edits workbook bytes.
 *
 *   node tools/span-apply.mjs candidates <en.srwb>
 *       → JSON: every translatable prose position with a stable id, kind,
 *         width constraint (if any), and the English text
 *
 *   node tools/span-apply.mjs apply <target.srwb> <translations.json> <out.srwb> --en <en.srwb>
 *       → applies the map to target (a round-one workbook whose CODE cells
 *         must still be byte-identical to en — asserted, not assumed)
 *
 * IDs are `${cellIndex}:${tokenIndex}:${segIndex}` over the en tokenization,
 * so candidates and apply always agree. Traps (the symbols('…') argument)
 * are excluded from candidates and REFUSED by apply.
 *
 * Apply-time validation (rejects, never mangles):
 * - width-constrained header literals must fit their field width
 * - a translation may not contain the string's own quote char, a backslash,
 *   or (inside f-string literal runs) braces; single-line spans may not
 *   gain newlines
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { cellsOf, tokenize, segmentFString, widthOfSpec } from './span-lib.mjs';

const LIT_PH = /^\{\s*'([^']*)'\s*(:[^}]*)?\}$/;
const HAS_PROSE = /\p{L}\p{L}/u;

/** Enumerate translatable positions of one cell. Shared by both modes. */
function enumerate(cellIndex, code) {
  const out = [];
  const toks = tokenize(code);
  let symbolsCall = false;
  for (let t = 0; t < toks.length; t++) {
    const tok = toks[t];
    if (tok.kind === 'code') {
      if (/symbols\s*\($/.test(tok.text.trimEnd()) || /symbols\s*\(\s*$/.test(tok.text)) symbolsCall = true;
      else if (/\)/.test(tok.text)) symbolsCall = false;
      continue;
    }
    if (tok.kind === 'comment') {
      const body = tok.text.replace(/^#\s?/, '');
      if (HAS_PROSE.test(body)) {
        out.push({ id: `${cellIndex}:${t}:0`, kind: 'comment', text: body, tok, seg: null });
      }
      continue;
    }
    // strings
    if (symbolsCall) {
      out.push({ id: `${cellIndex}:${t}:0`, kind: 'trap', text: tok.text, tok, seg: null });
      symbolsCall = false;
      continue;
    }
    if (tok.isF) {
      const segs = segmentFString(tok.text);
      for (let s = 0; s < segs.length; s++) {
        const seg = segs[s];
        if (seg.type === 'lit') {
          if (HAS_PROSE.test(seg.text)) {
            out.push({ id: `${cellIndex}:${t}:${s}`, kind: 'display_string', text: seg.text, tok, seg: s });
          }
        } else {
          const m = LIT_PH.exec(seg.text);
          if (m && HAS_PROSE.test(m[1] + 'xx')) {  // headers may be short words
            out.push({
              id: `${cellIndex}:${t}:${s}`, kind: 'header_literal', text: m[1],
              width: widthOfSpec((m[2] || '').replace(/^:/, '')), tok, seg: s,
            });
          }
        }
      }
      continue;
    }
    if (HAS_PROSE.test(tok.text)) {
      out.push({
        id: `${cellIndex}:${t}:0`,
        kind: tok.triple ? 'docstring' : 'display_string',
        text: tok.text, tok, seg: null,
      });
    }
  }
  return out;
}

const [, , mode, ...rest] = process.argv;

if (mode === 'candidates') {
  const wb = JSON.parse(readFileSync(rest[0], 'utf8'));
  const candidates = [];
  for (const c of cellsOf(wb)) {
    if (c.type === 'markdown') continue;
    for (const e of enumerate(c.index, c.code)) {
      if (e.kind === 'trap') continue;   // never offered for translation
      const { tok, seg, ...pub } = e;
      pub.cell_name = c.name || null;
      candidates.push(pub);
    }
  }
  console.log(JSON.stringify({ workbook: rest[0], candidates }, null, 2));
  process.exit(0);
}

if (mode !== 'apply') {
  console.error('usage: span-apply.mjs candidates <en.srwb>\n       span-apply.mjs apply <target.srwb> <translations.json> <out.srwb> --en <en.srwb>');
  process.exit(2);
}

const [targetPath, transPath, outPath] = rest.filter(a => !a.startsWith('--'));
const enIdx = rest.indexOf('--en');
const enPath = enIdx !== -1 ? rest[enIdx + 1] : null;
if (!targetPath || !transPath || !outPath || !enPath) {
  console.error('apply requires <target> <translations.json> <out> --en <en.srwb>');
  process.exit(2);
}

const target = JSON.parse(readFileSync(targetPath, 'utf8'));
const enWb = JSON.parse(readFileSync(enPath, 'utf8'));
const translations = JSON.parse(readFileSync(transPath, 'utf8'));

const enCells = cellsOf(enWb);
const bad = [];
const used = new Set();

for (const c of cellsOf(target)) {
  if (c.type === 'markdown') continue;
  const enCell = enCells[c.index];
  if (!enCell || enCell.code !== c.code) {
    bad.push(`cell ${c.index}: target code differs from en — ids would not align; refuse`);
    continue;
  }
  const entries = enumerate(c.index, c.code);
  const byId = new Map(entries.map(e => [e.id, e]));
  // validate every translation targeting this cell
  const cellTrans = Object.entries(translations).filter(([id]) => id.startsWith(`${c.index}:`));
  for (let [id, t] of cellTrans) {
    const e = byId.get(id);
    if (!e) { bad.push(`${id}: unknown candidate id`); continue; }
    if (e.kind === 'trap') { bad.push(`${id}: is a no-translate trap (${JSON.stringify(e.text)})`); continue; }
    if (typeof t !== 'string' || !t.length) { bad.push(`${id}: translation must be a non-empty string`); continue; }
    // workers reasonably return REAL newlines where the source uses the \n
    // escape — normalize to the source convention for string bodies
    if (e.kind === 'display_string') { t = t.replace(/\n/g, '\\n'); translations[id] = t; }
    if (e.kind === 'header_literal' && e.width != null && [...t].length > e.width) {
      bad.push(`${id}: ${JSON.stringify(t)} exceeds field width ${e.width}`);
    }
    if (e.kind !== 'docstring' && t.includes('\n')) bad.push(`${id}: newline in single-line span`);
    if (e.kind !== 'comment') {
      // backslashes only as recognized escapes — a stray one (incl. trailing)
      // could swallow the closing quote or change rendering unpredictably
      if (/\\(?![ntr\\'"])/.test(t)) bad.push(`${id}: unrecognized backslash escape in proposed text`);
      if (e.tok.quote && t.includes(e.tok.quote) && !e.tok.triple) bad.push(`${id}: contains the string's quote char`);
      if ((e.kind === 'display_string' && e.tok.isF) || e.kind === 'header_literal') {
        if (/[{}]/.test(t)) bad.push(`${id}: braces not allowed in f-string literal text`);
      }
    }
    used.add(id);
  }
  if (bad.length) continue;

  // rebuild the cell with translations applied
  const toks = tokenize(c.code);
  const rebuilt = toks.map((tok, ti) => {
    const raw = (x) => x.kind === 'string'
      ? (x.prefix || '') + x.quote.repeat(x.triple ? 3 : 1) + x.text + x.quote.repeat(x.triple ? 3 : 1)
      : x.text;
    if (tok.kind === 'comment') {
      const id = `${c.index}:${ti}:0`;
      if (translations[id] === undefined) return tok.text;
      const body = tok.text.replace(/^#\s?/, '');
      const marker = tok.text.slice(0, tok.text.length - body.length);
      return marker + translations[id];
    }
    if (tok.kind !== 'string') return tok.text;
    const q = tok.quote.repeat(tok.triple ? 3 : 1);
    if (tok.isF) {
      const segs = segmentFString(tok.text);
      const body = segs.map((seg, si) => {
        const id = `${c.index}:${ti}:${si}`;
        if (translations[id] === undefined) return seg.text;
        if (seg.type === 'lit') return translations[id];
        const m = LIT_PH.exec(seg.text);
        return seg.text.replace(`'${m[1]}'`, `'${translations[id]}'`);
      }).join('');
      return (tok.prefix || '') + q + body + q;
    }
    const id = `${c.index}:${ti}:0`;
    const body = translations[id] !== undefined ? translations[id] : tok.text;
    return (tok.prefix || '') + q + body + q;
  }).join('');
  if (rebuilt !== c.code) c.cell.code = rebuilt;
}

for (const id of Object.keys(translations)) {
  if (!used.has(id)) bad.push(`${id}: translation provided but id not found in any cell`);
}

if (bad.length) {
  console.error('APPLY REJECTED:');
  for (const b of [...new Set(bad)]) console.error('  ' + b);
  process.exit(1);
}

writeFileSync(outPath, JSON.stringify(target, null, 2) + '\n');
console.error(`applied ${used.size} span translation(s) -> ${outPath}`);
