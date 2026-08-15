#!/usr/bin/env node
/**
 * span-scan.mjs — generate the translatable-candidate list for a workbook,
 * or lint a translation's coverage against it.
 *
 *   node tools/span-scan.mjs workbooks/en/foo.srwb
 *       → prints the candidate spans (the generator: draft task-file input)
 *
 *   node tools/span-scan.mjs workbooks/en/foo.srwb --lint workbooks/es/foo.srwb
 *       → completeness lint: candidates whose text is UNCHANGED in the
 *         translation are reported as untranslated (warnings; exit 1 with
 *         --strict). This is the mechanical answer to the pilot's blocker:
 *         hand lists miss spans; the scanner does not get tired.
 *
 * Candidates are heuristic by design (see span-lib.mjs). Traps (e.g. the
 * argument of symbols()) are listed separately as no-translate flags.
 */

import { readFileSync } from 'node:fs';
import { cellsOf, scanCell } from './span-lib.mjs';

const args = process.argv.slice(2);
const srcPath = args.find(a => !a.startsWith('--'));
const lintIdx = args.indexOf('--lint');
const lintPath = lintIdx !== -1 ? args[lintIdx + 1] : null;
const strict = args.includes('--strict');
if (!srcPath) {
  console.error('usage: span-scan.mjs <en-workbook> [--lint <translated-workbook>] [--strict]');
  process.exit(2);
}

const src = JSON.parse(readFileSync(srcPath, 'utf8'));
const cells = cellsOf(src).filter(c => c.type !== 'markdown');

const candidates = [];
const traps = [];
for (const c of cells) {
  for (const s of scanCell(c.code)) {
    const entry = { cell_index: c.index, cell_name: c.name, ...s };
    if (s.kind === 'trap') traps.push(entry); else candidates.push(entry);
  }
}

if (!lintPath) {
  console.log(`# candidate spans for ${srcPath}`);
  for (const s of candidates) {
    const width = s.width != null ? `  width<=${s.width}` : '';
    const dest = `  [${s.reaches_output}]`;
    console.log(`cell ${s.cell_index} (${s.cell_name ?? '-'})  ${s.kind}${dest}${width}\n    ${JSON.stringify(s.text.slice(0, 100))}`);
  }
  if (traps.length) {
    console.log('\n# no-translate traps');
    for (const t of traps) console.log(`cell ${t.cell_index} (${t.cell_name ?? '-'})  ${t.trap}: ${JSON.stringify(t.text)}`);
  }
  console.log(`\n${candidates.length} candidate(s), ${traps.length} trap(s).`);
  process.exit(0);
}

// Lint mode: a candidate whose exact text still appears at the same spot in
// the translated cell is untranslated. Cheap containment check per cell —
// robust because Stage A keeps everything outside spans byte-identical.
const dst = JSON.parse(readFileSync(lintPath, 'utf8'));
const dstCells = cellsOf(dst).filter(c => c.type !== 'markdown');
const byIndex = new Map(dstCells.map(c => [c.index, c]));
let untranslated = 0;
for (const s of candidates) {
  const cell = byIndex.get(s.cell_index);
  if (!cell) { console.log(`MISSING CELL ${s.cell_index}`); untranslated++; continue; }
  if (cell.code.includes(s.text)) {
    console.log(`UNTRANSLATED  cell ${s.cell_index} (${s.cell_name ?? '-'}) ${s.kind}: ${JSON.stringify(s.text.slice(0, 80))}`);
    untranslated++;
  }
}
for (const t of traps) {
  const cell = byIndex.get(t.cell_index);
  const needle = t.quoted || t.text;
  if (cell && !cell.code.includes(needle)) {
    console.log(`TRAP VIOLATED  cell ${t.cell_index}: ${t.trap} ${JSON.stringify(t.text)} was changed`);
    untranslated++;
  }
}
console.log(untranslated
  ? `${untranslated} finding(s) — candidates left in English or traps changed.`
  : 'coverage clean: every candidate translated, every trap intact.');
process.exit(untranslated && strict ? 1 : 0);
