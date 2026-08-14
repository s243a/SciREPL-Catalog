#!/usr/bin/env node
/**
 * test-span-tools.mjs — fixture tests for span-scan and span-derive.
 *
 * Fixture #1 is the pilot's approved hand-list (docs/pilot/
 * stage-a-compute-pi-es-task.md): the generator must find every span that
 * list names — INCLUDING the three cell-5 trailing fragments the original
 * hand-authored list missed — and must flag the symbols('n') trap.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cellsOf, scanCell } from './span-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EN = path.join(ROOT, 'workbooks/en/compute-pi-workbook.srwb');

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ': ' + detail : ''}`);
  ok ? passed++ : failed++;
};

const wb = JSON.parse(readFileSync(EN, 'utf8'));
const cells = cellsOf(wb).filter(c => c.type !== 'markdown');
const all = [];
const traps = [];
for (const c of cells) for (const s of scanCell(c.code)) {
  (s.kind === 'trap' ? traps : all).push({ cell: c.index, ...s });
}

console.log('1. Generator reproduces the approved pilot span list');

const texts = all.map(s => s.text);
const mustFind = [
  // cell 1
  'Visualize the starting hexagon inside a unit circle.',
  'Unit circle', 'Inscribed hexagon', 'Archimedes starts with a hexagon',
  // cell 2 headers (width-constrained)
  'step', 'sides', 'lower bound', 'upper bound', 'width',
  // cell 3
  'first doubled n', 'bound width',
  // cell 4
  'Symbolic check of the familiar inscribed-area formula:',
  'limit as n approaches infinity =',
  // cell 5 — including the fragments the hand list originally missed
  'Work needed for about 1e-10 absolute accuracy:',
  ' terms', ' terms per arctangent',
];
for (const want of mustFind) {
  check(`finds ${JSON.stringify(want.slice(0, 40))}`,
    texts.some(t => t === want || t.includes(want)));
}
check('finds the sides/(width fragment', texts.some(t => /sides \(width/.test(t)));
check('finds the Final enclosure literal', texts.some(t => /Final enclosure/.test(t)));
check('finds the docstring', all.some(s => s.kind === 'docstring' && /polygon bounds/.test(s.text)));
check('finds both cell-3 comment lines', texts.filter(t => /How many sides|than 10\^-d/.test(t)).length === 2);
check('finds cell-5 closing literals', texts.filter(t => /convergence rates|geometric squeeze/.test(t)).length === 2);

console.log('2. Classification and constraints');

const plotLabels = all.filter(s => s.kind === 'plot_label').map(s => s.text);
check('plot labels routed as plot_label', ['Unit circle', 'Inscribed hexagon', 'Archimedes starts with a hexagon']
  .every(t => plotLabels.includes(t)), plotLabels.join(' | '));
check('API keys are NOT candidates', !texts.includes('lines+markers') && !texts.includes('scaleanchor') && !texts.includes('mode'));
const stepSpan = all.find(s => s.text === 'step');
check('width extracted for step header', stepSpan?.width === 4, String(stepSpan?.width));
const lower = all.find(s => s.text === 'lower bound');
check('width extracted for lower bound', lower?.width === 16, String(lower?.width));
check("symbols('n') flagged as trap, not candidate",
  traps.some(t => t.trap === 'symbol-name' && t.text === 'n') && !all.some(s => s.text === 'n' && s.kind !== 'trap'));

console.log('3. Derive: en vs en yields empty manifest');

const run = (args) => {
  try { return { code: 0, out: execFileSync('node', args, { encoding: 'utf8', cwd: ROOT }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }; }
};
const same = run(['tools/span-derive.mjs', 'workbooks/en/compute-pi-workbook.srwb', 'workbooks/en/compute-pi-workbook.srwb', 'es']);
check('en-vs-en exits 0', same.code === 0);
check('en-vs-en has zero spans', same.code === 0 && JSON.parse(same.out).spans.length === 0);

console.log('4. Derive: synthetic translation produces exactly the edited spans');

const tmp = mkdtempSync(path.join(tmpdir(), 'span-test-'));
try {
  const mod = JSON.parse(readFileSync(EN, 'utf8'));
  const c1 = mod.notebook.cells[1];
  c1.code = c1.code
    .replace('# Visualize the starting hexagon inside a unit circle.',
             '# Visualiza el hexágono inicial dentro de un círculo unitario.')
    .replace('"Unit circle"', '"Círculo unitario"');
  const c5 = mod.notebook.cells[5];
  c5.code = c5.code.replace(':,} terms"', ':,} términos"');
  const p = path.join(tmp, 'translated.srwb');
  writeFileSync(p, JSON.stringify(mod, null, 2));

  const d = run(['tools/span-derive.mjs', EN, p, 'es']);
  check('derive exits 0 on clean translation', d.code === 0, d.code ? d.out.slice(0, 200) : '');
  if (d.code === 0) {
    const m = JSON.parse(d.out);
    check('exactly 3 spans derived', m.spans.length === 3, String(m.spans.length));
    check('comment span derived with marker stripped',
      m.spans.some(s => s.kind === 'comment' && s.source_span.text.startsWith('Visualize')
        && s.target_span.text.startsWith('Visualiza')));
    check('plot label string derived',
      m.spans.some(s => s.source_span.text === 'Unit circle' && s.target_span.text === 'Círculo unitario'));
    check('f-string literal fragment derived with placeholders intact',
      m.spans.some(s => s.source_span.text === ' terms' && s.target_span.text === ' términos'
        && s.placeholders.length > 0));
  }

  console.log('5. Derive: executable-surface changes are hard errors');

  const bad1 = JSON.parse(readFileSync(EN, 'utf8'));
  bad1.notebook.cells[2].code = bad1.notebook.cells[2].code.replace('def archimedes_rows', 'def filas_arquimedes');
  const pb1 = path.join(tmp, 'bad-ident.srwb');
  writeFileSync(pb1, JSON.stringify(bad1, null, 2));
  check('identifier rename rejected', run(['tools/span-derive.mjs', EN, pb1, 'es']).code === 1);

  const bad2 = JSON.parse(readFileSync(EN, 'utf8'));
  bad2.notebook.cells[2].code = bad2.notebook.cells[2].code.replace('{lower:.12f}', '{inferior:.12f}');
  const pb2 = path.join(tmp, 'bad-ph.srwb');
  writeFileSync(pb2, JSON.stringify(bad2, null, 2));
  check('placeholder rename rejected', run(['tools/span-derive.mjs', EN, pb2, 'es']).code === 1);

  const bad3 = JSON.parse(readFileSync(EN, 'utf8'));
  bad3.notebook.cells[4].code = bad3.notebook.cells[4].code.replace("'n'", "'م'");
  const pb3 = path.join(tmp, 'bad-symbol.srwb');
  writeFileSync(pb3, JSON.stringify(bad3, null, 2));
  const symRes = run(['tools/span-derive.mjs', EN, pb3, 'es']);
  // derive sees a string-body change (legal shape) — the LINT catches the trap
  const lint = run(['tools/span-scan.mjs', EN, '--lint', pb3, '--strict']);
  check('trap violation caught by lint', lint.code === 1 && /TRAP VIOLATED/.test(lint.out), lint.out.split('\n').find(l => /TRAP/.test(l)) || '');

  console.log('6. Lint: completeness');

  const lintSame = run(['tools/span-scan.mjs', EN, '--lint', EN, '--strict']);
  check('en-vs-en lint reports everything untranslated (sanity)', lintSame.code === 1);
  const lintGood = run(['tools/span-scan.mjs', EN, '--lint', p]);
  check('partial translation flags remaining candidates', /UNTRANSLATED/.test(lintGood.out));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${failed ? `FAIL: ${failed} failed, ${passed} passed` : `PASS: ${passed} passed`}`);
process.exit(failed ? 1 : 0);
