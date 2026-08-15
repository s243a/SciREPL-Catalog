#!/usr/bin/env node
/**
 * span-derive.mjs — derive the AUTHORITATIVE span manifest by diffing the
 * English and translated workbooks (docs/pilot/span-manifest.md: "spans are
 * derived, never self-certified").
 *
 *   node tools/span-derive.mjs workbooks/en/foo.srwb workbooks/es/foo.srwb es
 *       → prints a schema-shaped manifest (produced_by: "derived")
 *
 * Method: tokenize both cell sources with the same lexer. The token streams
 * must be structurally identical — same kinds, same order, identical CODE
 * token text. Only comment bodies and string bodies may differ; each
 * differing body becomes a span (f-strings are segmented so placeholders
 * are verified equal and only literal runs differ). Any CODE difference is
 * a hard error: the translation touched the executable surface.
 *
 * Exit 0 with manifest on stdout; exit 1 with the violation list otherwise.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  cellsOf, tokenize, segmentFString, microTokens,
  isValidPyIdentifier, PY_KEYWORDS,
} from './span-lib.mjs';

const argv = process.argv.slice(2);
const allowRenames = argv.includes('--allow-renames');
const [enPath, xxPath, locale] = argv.filter(a => !a.startsWith('--'));
if (!enPath || !xxPath || !locale) {
  console.error('usage: span-derive.mjs <en-workbook> <translated-workbook> <locale> [--allow-renames]');
  process.exit(2);
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const en = JSON.parse(readFileSync(enPath, 'utf8'));
const xx = JSON.parse(readFileSync(xxPath, 'utf8'));
const enCells = cellsOf(en);
const xxCells = cellsOf(xx);

const errors = [];
const spans = [];

/* --------------- Stage B: α-rename verification state ------------------ */
// en identifier -> es identifier (bijective); every occurrence must agree.
const renameMap = new Map();
const reverseMap = new Map();
const renameCounts = new Map();
const allEnIds = new Set();   // every identifier seen anywhere in EN code
const allEsIds = new Set();   // every identifier seen anywhere in ES code

/**
 * Compare two code fragments as micro-token streams. Non-identifier tokens
 * must be byte-identical; identifier pairs must rename consistently.
 * Returns error strings (empty = α-equivalent under the growing map).
 */
function alphaCompare(ma, mb, where) {
  const errs = [];
  if (ma.length !== mb.length) {
    return [`${where}: code token structure differs (${ma.length} vs ${mb.length} micro-tokens)`];
  }
  for (let k = 0; k < ma.length; k++) {
    const x = ma[k], y = mb[k];
    if (x.kind !== y.kind) { errs.push(`${where}: ${x.kind} vs ${y.kind} at ${JSON.stringify(x.text.slice(0, 30))}`); continue; }
    // kwarg names are API selectors, not variables: keep them out of the
    // variable inventories (a variable may legally share their spelling)
    if (x.kind === 'id' && !x.kwargPos) allEnIds.add(x.text);
    if (y.kind === 'id' && !y.kwargPos) allEsIds.add(y.text);
    if (x.text === y.text) continue;
    if (x.kind !== 'id') { errs.push(`${where}: ${x.kind} changed: ${JSON.stringify(x.text.slice(0, 40))} -> ${JSON.stringify(y.text.slice(0, 40))}`); continue; }
    // an identifier rename
    if (PY_KEYWORDS.has(x.text)) { errs.push(`${where}: keyword '${x.text}' renamed to '${y.text}'`); continue; }
    if (x.afterDot || y.afterDot) { errs.push(`${where}: attribute '.${x.text}' renamed to '.${y.text}' — attributes are API surface`); continue; }
    if (x.kwargPos || y.kwargPos) { errs.push(`${where}: keyword-argument name '${x.text}=' renamed to '${y.text}=' — call API surface`); continue; }
    if (!isValidPyIdentifier(y.text)) { errs.push(`${where}: '${y.text}' is not a valid Python identifier`); continue; }
    if (y.text !== y.text.normalize('NFC')) { errs.push(`${where}: '${y.text}' is not NFC-normalized`); continue; }
    if (PY_KEYWORDS.has(y.text)) { errs.push(`${where}: rename target '${y.text}' is a Python keyword`); continue; }
    const prior = renameMap.get(x.text);
    if (prior !== undefined && prior !== y.text) {
      errs.push(`${where}: inconsistent rename: '${x.text}' -> '${y.text}' but previously -> '${prior}'`);
      continue;
    }
    const priorRev = reverseMap.get(y.text);
    if (priorRev !== undefined && priorRev !== x.text) {
      errs.push(`${where}: rename collision: both '${x.text}' and '${priorRev}' -> '${y.text}'`);
      continue;
    }
    renameMap.set(x.text, y.text);
    reverseMap.set(y.text, x.text);
    renameCounts.set(x.text, (renameCounts.get(x.text) || 0) + 1);
  }
  return errs;
}

const CELL_NAME_OK = (n) =>
  n && !n.includes('/') && !n.startsWith('.') && !/^In\[\d+\]$/.test(n);

if (enCells.length !== xxCells.length) {
  errors.push(`cell count differs: ${enCells.length} vs ${xxCells.length}`);
}

for (let i = 0; i < Math.min(enCells.length, xxCells.length); i++) {
  const a = enCells[i], b = xxCells[i];
  if (a.type !== b.type) { errors.push(`cell ${i}: type ${a.type} vs ${b.type}`); continue; }
  if (a.name !== b.name) {
    if (!allowRenames) {
      errors.push(`cell ${i}: name ${a.name} vs ${b.name} (cell names stay English in Stage A)`);
    } else if (!CELL_NAME_OK(b.name)) {
      errors.push(`cell ${i}: translated cell name ${JSON.stringify(b.name)} is invalid (empty, '/', leading '.', or In[N] shape)`);
    } else if (b.name !== b.name.normalize('NFC')) {
      errors.push(`cell ${i}: translated cell name ${JSON.stringify(b.name)} is not NFC-normalized`);
    } else {
      spans.push({
        cell_index: i, cell_name: a.name,
        kind: 'cell_name', reaches_output: 'none',
        source_span: { text: a.name }, target_span: { text: b.name },
        placeholders: [],
      });
    }
  }
  if (a.type === 'markdown') continue;  // Stage A: markdown handled in round one; not this manifest's business
  if (a.code === b.code) {
    if (allowRenames) {
      // identical cells still contribute to both identifier inventories —
      // an incomplete rename hides in exactly such cells. Tokenize properly:
      // only CODE tokens count (string/comment words are not identifiers).
      let st = [];
      for (const tok of tokenize(a.code)) {
        if (tok.kind !== 'code') continue;
        const ms = microTokens(tok.text, st);
        st = ms.finalStack;
        for (const m of ms) if (m.kind === 'id' && !m.kwargPos) { allEnIds.add(m.text); allEsIds.add(m.text); }
      }
    }
    continue;
  }

  const ta = tokenize(a.code), tb = tokenize(b.code);
  if (ta.length !== tb.length) {
    errors.push(`cell ${i}: token stream length differs (${ta.length} vs ${tb.length}) — structural code change`);
    continue;
  }
  let enStack = [];
  for (let t = 0; t < ta.length; t++) {
    const x = ta[t], y = tb[t];
    if (x.kind !== y.kind) { errors.push(`cell ${i} tok ${t}: kind ${x.kind} vs ${y.kind}`); continue; }
    if (x.kind === 'code') {
      const startStack = enStack;
      const enMs = microTokens(x.text, startStack);
      enStack = enMs.finalStack;
      if (x.text !== y.text) {
        if (allowRenames) errors.push(...alphaCompare(enMs, microTokens(y.text, startStack), `cell ${i} tok ${t}`));
        else errors.push(`cell ${i} tok ${t}: CODE changed: ${JSON.stringify(x.text.slice(0, 60))} -> ${JSON.stringify(y.text.slice(0, 60))}`);
      } else if (allowRenames) {
        // unchanged code still contributes to both identifier inventories
        for (const m of enMs) if (m.kind === 'id' && !m.kwargPos) { allEnIds.add(m.text); allEsIds.add(m.text); }
      }
      continue;
    }
    if (x.text === y.text) continue;
    const base = {
      cell_index: i, cell_name: a.name,
      source_span: { start: x.kind === 'comment' ? x.start : x.bodyStart, end: x.kind === 'comment' ? x.end : x.bodyEnd, text: x.text },
      target_span: { start: y.kind === 'comment' ? y.start : y.bodyStart, end: y.kind === 'comment' ? y.end : y.bodyEnd, text: y.text },
    };
    if (x.kind === 'comment') {
      const bodyA = x.text.replace(/^#\s?/, ''), bodyB = y.text.replace(/^#\s?/, '');
      const markA = x.text.length - bodyA.length, markB = y.text.length - bodyB.length;
      if (x.text.slice(0, markA) !== y.text.slice(0, markB)) {
        errors.push(`cell ${i} tok ${t}: comment marker changed`);
        continue;
      }
      base.kind = 'comment'; base.reaches_output = 'none';
      base.source_span.text = bodyA; base.target_span.text = bodyB;
      base.placeholders = [];
      spans.push(base);
      continue;
    }
    // strings
    if ((x.prefix || '') !== (y.prefix || '') || x.quote !== y.quote || x.triple !== y.triple) {
      errors.push(`cell ${i} tok ${t}: string delimiter/prefix changed`);
      continue;
    }
    if (x.isF) {
      const sa = segmentFString(x.text), sb = segmentFString(y.text);
      const pa = sa.filter(s => s.type === 'ph').map(s => s.text);
      const pb = sb.filter(s => s.type === 'ph').map(s => s.text);
      // Placeholders whose expression is a pure quoted string literal are
      // translatable header content (span-scan extracts them as candidates
      // with widths): the format spec must be identical, only the inner
      // literal may differ. Everything else must match exactly.
      const LIT = /^\{\s*'([^']*)'\s*(:[^}]*)?\}$/;
      let phError = false, phReported = false;
      if (pa.length !== pb.length) phError = true;
      else for (let k = 0; k < pa.length; k++) {
        if (pa[k] === pb[k]) continue;
        const ma = LIT.exec(pa[k]), mb = LIT.exec(pb[k]);
        if (ma && mb && (ma[2] || '') === (mb[2] || '')) {
          spans.push({
            cell_index: i, cell_name: a.name,
            kind: 'display_string', reaches_output: 'stdout',
            // e.g. '>16' — the oracle masks the PADDED field, because equal
            // widths with different text lengths render different padding
            format_spec: (ma[2] || '').replace(/^:/, ''),
            source_span: { start: x.bodyStart, end: x.bodyEnd, text: ma[1] },
            target_span: { start: y.bodyStart, end: y.bodyEnd, text: mb[1] },
            placeholders: [],
          });
          continue;
        }
        if (allowRenames) {
          // placeholder expressions are code: α-compare them (renamed
          // variables inside {…} are legal, spec/op bytes must match)
          const phErrs = alphaCompare(microTokens(pa[k]), microTokens(pb[k]), `cell ${i} tok ${t} placeholder ${k}`);
          if (phErrs.length) { errors.push(...phErrs); phError = true; phReported = true; break; }
          continue;
        }
        phError = true; break;
      }
      if (phError) {
        if (!phReported) errors.push(`cell ${i} tok ${t}: placeholder set/order changed: [${pa}] vs [${pb}]`);
        continue;
      }
      const la = sa.filter(s => s.type === 'lit'), lb = sb.filter(s => s.type === 'lit');
      if (la.length !== lb.length) {
        errors.push(`cell ${i} tok ${t}: f-string literal segmentation differs`);
        continue;
      }
      for (let k = 0; k < la.length; k++) {
        if (la[k].text === lb[k].text) continue;
        spans.push({
          cell_index: i, cell_name: a.name,
          kind: 'display_string', reaches_output: 'stdout',
          source_span: { start: x.bodyStart, end: x.bodyEnd, text: la[k].text },
          target_span: { start: y.bodyStart, end: y.bodyEnd, text: lb[k].text },
          placeholders: pa,
        });
      }
      continue;
    }
    base.kind = x.triple ? 'docstring' : 'display_string';
    base.reaches_output = x.triple ? 'none' : 'stdout';
    base.placeholders = [];
    spans.push(base);
  }
}

// Capture check: a rename target must not shadow an EN identifier that was
// NOT itself renamed (e.g. sides -> n while n stays in use elsewhere).
if (allowRenames) {
  for (const [from, to] of renameMap) {
    if (allEnIds.has(to) && !renameMap.has(to)) {
      errors.push(`rename '${from}' -> '${to}' captures existing identifier '${to}' (still in use, not renamed)`);
    }
    // cells share one namespace: a renamed identifier must be renamed
    // EVERYWHERE — a leftover occurrence hides in unchanged cells
    if (allEsIds.has(from) && !reverseMap.has(from)) {
      errors.push(`incomplete rename: '${from}' -> '${to}' but '${from}' still appears in the translation`);
    }
  }
}

if (errors.length) {
  console.error('DERIVE FAILED — translation touched the executable surface:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

const manifest = {
  manifest_version: 1,
  produced_by: 'derived',
  generator: 'tools/span-derive.mjs',
  locale,
  source: { path: enPath, sha256: sha(enPath) },
  target: { path: xxPath, sha256: sha(xxPath) },
  spans, exclusions: [],
};
if (allowRenames) {
  manifest.stage = 'b';
  manifest.renames = [...renameMap.entries()]
    .map(([from, to]) => ({ from, to, occurrences: renameCounts.get(from) || 0 }))
    .sort((p, q) => p.from.localeCompare(q.from));
}
console.log(JSON.stringify(manifest, null, 2));
