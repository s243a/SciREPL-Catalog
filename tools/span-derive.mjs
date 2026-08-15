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
import { cellsOf, tokenize, segmentFString } from './span-lib.mjs';

const [, , enPath, xxPath, locale] = process.argv;
if (!enPath || !xxPath || !locale) {
  console.error('usage: span-derive.mjs <en-workbook> <translated-workbook> <locale>');
  process.exit(2);
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const en = JSON.parse(readFileSync(enPath, 'utf8'));
const xx = JSON.parse(readFileSync(xxPath, 'utf8'));
const enCells = cellsOf(en);
const xxCells = cellsOf(xx);

const errors = [];
const spans = [];

if (enCells.length !== xxCells.length) {
  errors.push(`cell count differs: ${enCells.length} vs ${xxCells.length}`);
}

for (let i = 0; i < Math.min(enCells.length, xxCells.length); i++) {
  const a = enCells[i], b = xxCells[i];
  if (a.type !== b.type) { errors.push(`cell ${i}: type ${a.type} vs ${b.type}`); continue; }
  if (a.name !== b.name) { errors.push(`cell ${i}: name ${a.name} vs ${b.name} (cell names stay English)`); }
  if (a.type === 'markdown') continue;  // Stage A: markdown handled in round one; not this manifest's business
  if (a.code === b.code) continue;

  const ta = tokenize(a.code), tb = tokenize(b.code);
  if (ta.length !== tb.length) {
    errors.push(`cell ${i}: token stream length differs (${ta.length} vs ${tb.length}) — structural code change`);
    continue;
  }
  for (let t = 0; t < ta.length; t++) {
    const x = ta[t], y = tb[t];
    if (x.kind !== y.kind) { errors.push(`cell ${i} tok ${t}: kind ${x.kind} vs ${y.kind}`); continue; }
    if (x.kind === 'code') {
      if (x.text !== y.text) errors.push(`cell ${i} tok ${t}: CODE changed: ${JSON.stringify(x.text.slice(0, 60))} -> ${JSON.stringify(y.text.slice(0, 60))}`);
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
      if (JSON.stringify(pa) !== JSON.stringify(pb)) {
        errors.push(`cell ${i} tok ${t}: placeholder set/order changed: [${pa}] vs [${pb}]`);
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
console.log(JSON.stringify(manifest, null, 2));
