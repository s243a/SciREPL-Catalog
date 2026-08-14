#!/usr/bin/env node
/**
 * verify-translation.mjs — assert a translated workbook only changed what a
 * translation may change.
 *
 *   node tools/verify-translation.mjs workbooks/en/foo.srwb workbooks/es/foo.srwb
 *
 * Passes when, relative to the source:
 *   - cell count, order, and cell types are identical;
 *   - every NON-markdown cell is deep-equal in its entirety (code, outputs,
 *     metadata, execution counts — everything);
 *   - every markdown cell's text differs and is non-empty (it was translated);
 *   - .srwb: format/version equal, notebook.name differs, cell key sets equal;
 *   - .ipynb: nbformat/nbformat_minor and top-level metadata deep-equal.
 *
 * Exit 0 = clean. Exit 1 = violations, listed. This is the mechanical half of
 * translation review; reading the target language is the human half.
 */

import { readFileSync } from 'node:fs';

const [, , srcPath, dstPath] = process.argv;
if (!srcPath || !dstPath) {
  console.error('usage: verify-translation.mjs <source> <translated>');
  process.exit(2);
}

const src = JSON.parse(readFileSync(srcPath, 'utf8'));
const dst = JSON.parse(readFileSync(dstPath, 'utf8'));

let failures = 0;
const chk = (name, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ': ' + detail : ''}`);
  if (!ok) failures++;
};
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keySet = (o) => JSON.stringify(Object.keys(o).sort());

const isSrwb = src.format === 'srwb';
const cellsOf = (j) => (isSrwb ? j.notebook.cells : j.cells) || [];
const typeOf = (c) => (isSrwb ? c.type : c.cell_type);
const textOf = (c) => {
  const s = isSrwb ? c.code : c.source;
  return Array.isArray(s) ? s.join('') : String(s ?? '');
};

if (isSrwb) {
  chk('format/version preserved', src.format === dst.format && src.version === dst.version);
  chk('notebook name translated',
    typeof dst.notebook?.name === 'string' && dst.notebook.name.length > 0
    && dst.notebook.name !== src.notebook.name,
    JSON.stringify(dst.notebook?.name));
} else {
  chk('nbformat preserved', src.nbformat === dst.nbformat && src.nbformat_minor === dst.nbformat_minor);
  chk('top-level metadata untouched', deepEq(src.metadata, dst.metadata));
}

const sc = cellsOf(src);
const dc = cellsOf(dst);
chk('cell count identical', sc.length === dc.length, `${sc.length} vs ${dc.length}`);

const n = Math.min(sc.length, dc.length);
const codeDiff = [];
const mdUntranslated = [];
const keyDrift = [];
for (let i = 0; i < n; i++) {
  const s = sc[i];
  const d = dc[i];
  if (typeOf(s) !== typeOf(d)) { chk(`cell ${i} type preserved`, false, `${typeOf(s)} vs ${typeOf(d)}`); continue; }
  if (keySet(s) !== keySet(d)) keyDrift.push(i);
  if (typeOf(s) === 'markdown') {
    const t = textOf(d);
    if (!t || t === textOf(s)) mdUntranslated.push(i);
  } else if (!deepEq(s, d)) {
    codeDiff.push(i);
  }
}
chk('all non-markdown cells deep-equal', codeDiff.length === 0,
  codeDiff.length ? 'differ: ' + codeDiff.join(',') : `${n - mdUntranslated.length - codeDiff.length} checked`);
chk('all markdown cells translated', mdUntranslated.length === 0,
  mdUntranslated.length ? 'untranslated: ' + mdUntranslated.join(',') : '');
chk('cell key sets identical', keyDrift.length === 0,
  keyDrift.length ? 'drift: ' + keyDrift.join(',') : '');

console.log(failures ? `FAIL: ${failures} violation(s)` : 'PASS');
process.exit(failures ? 1 : 0);
