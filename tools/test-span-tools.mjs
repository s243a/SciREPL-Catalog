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

  console.log('4b. Derive: quoted-literal header placeholders are translatable');

  const hdr = JSON.parse(readFileSync(EN, 'utf8'));
  hdr.notebook.cells[2].code = hdr.notebook.cells[2].code
    .replace("{'step':>4}", "{'paso':>4}")
    .replace("{'lower bound':>16}", "{'cota inferior':>16}");
  const ph = path.join(tmp, 'hdr.srwb');
  writeFileSync(ph, JSON.stringify(hdr, null, 2));
  const dh = run(['tools/span-derive.mjs', EN, ph, 'es']);
  check('header literal translation accepted', dh.code === 0, dh.code ? dh.out.slice(0, 200) : '');
  if (dh.code === 0) {
    const mh = JSON.parse(dh.out);
    check('both header spans derived', mh.spans.length === 2, String(mh.spans.length));
    check('header span carries source/target literals',
      mh.spans.some(s => s.source_span.text === 'step' && s.target_span.text === 'paso') &&
      mh.spans.some(s => s.source_span.text === 'lower bound' && s.target_span.text === 'cota inferior'));
  }
  const hdrBad = JSON.parse(readFileSync(EN, 'utf8'));
  hdrBad.notebook.cells[2].code = hdrBad.notebook.cells[2].code.replace("{'step':>4}", "{'paso':>6}");
  const phb = path.join(tmp, 'hdr-bad.srwb');
  writeFileSync(phb, JSON.stringify(hdrBad, null, 2));
  check('header spec change still rejected', run(['tools/span-derive.mjs', EN, phb, 'es']).code === 1);

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

  console.log('5b. Stage B: apply-renames + derive --allow-renames');

  const gloss = (obj) => {
    const gp = path.join(tmp, `gloss-${Math.random().toString(36).slice(2, 8)}.json`);
    writeFileSync(gp, JSON.stringify(obj));
    return gp;
  };
  const apply = (glossObj, out) => {
    const o = path.join(tmp, out);
    const r = run(['tools/apply-renames.mjs', EN, gloss(glossObj), o]);
    return { ...r, out: o, log: r.out };
  };

  // clean full-ish glossary: variables + a cell name
  const good = apply({
    renames: { lower: 'cota_inf', upper: 'cota_sup', step: 'paso' },
    cell_names: { bounds: 'cotas', geometry: 'geometría' },
  }, 'stageb-good.srwb');
  check('apply-renames succeeds on clean glossary', good.code === 0, good.log.slice(0, 120));
  const db = run(['tools/span-derive.mjs', EN, good.out, 'es', '--allow-renames']);
  check('derive --allow-renames passes', db.code === 0, db.code ? db.out.slice(0, 200) : '');
  if (db.code === 0) {
    const mb = JSON.parse(db.out);
    check('manifest carries stage b + renames',
      mb.stage === 'b' && mb.renames.some(r => r.from === 'lower' && r.to === 'cota_inf'));
    check('cell_name spans derived', mb.spans.filter(s => s.kind === 'cell_name').length === 2);
    check('rename occurrences counted', mb.renames.every(r => r.occurrences > 0));
  }
  check('default mode still rejects the same file', run(['tools/span-derive.mjs', EN, good.out, 'es']).code === 1);

  // adversarial: one occurrence left unrenamed (inconsistency)
  const incons = JSON.parse(readFileSync(good.out, 'utf8'));
  incons.notebook.cells[2].code = incons.notebook.cells[2].code.replace('cota_inf,', 'lower,');
  const pi1 = path.join(tmp, 'stageb-incons.srwb');
  writeFileSync(pi1, JSON.stringify(incons, null, 2));
  const di = run(['tools/span-derive.mjs', EN, pi1, 'es', '--allow-renames']);
  check('a missed occurrence fails', di.code === 1 && /incomplete rename|inconsistent/.test(di.out), di.out.split('\n').find(l => /rename/.test(l)) || '');

  // adversarial: rename captures an existing identifier
  const cap = apply({ renames: { lower: 'upper' }, cell_names: {} }, 'stageb-capture.srwb');
  const dc = run(['tools/span-derive.mjs', EN, cap.out, 'es', '--allow-renames']);
  check('capturing rename fails', dc.code === 1 && /captures existing identifier/.test(dc.out));

  // glossary-level rejections (never touch the file)
  check('keyword target rejected by apply',
    run(['tools/apply-renames.mjs', EN, gloss({ renames: { lower: 'lambda' } }), path.join(tmp, 'x1.srwb')]).code === 1);
  check('invalid identifier target rejected by apply',
    run(['tools/apply-renames.mjs', EN, gloss({ renames: { lower: 'cota-inf' } }), path.join(tmp, 'x2.srwb')]).code === 1);
  check('colliding targets rejected by apply',
    run(['tools/apply-renames.mjs', EN, gloss({ renames: { lower: 'cota', upper: 'cota' } }), path.join(tmp, 'x3.srwb')]).code === 1);
  check('In[N]-shaped cell name rejected by apply',
    run(['tools/apply-renames.mjs', EN, gloss({ cell_names: { bounds: 'In[3]' } }), path.join(tmp, 'x4.srwb')]).code === 1);

  // adversarial: attribute renamed by hand (apply never does this)
  const attr = JSON.parse(readFileSync(EN, 'utf8'));
  attr.notebook.cells[1].code = attr.notebook.cells[1].code.replace('np.linspace', 'np.linespacio');
  const pa2 = path.join(tmp, 'stageb-attr.srwb');
  writeFileSync(pa2, JSON.stringify(attr, null, 2));
  const da = run(['tools/span-derive.mjs', EN, pa2, 'es', '--allow-renames']);
  check('attribute rename fails even with --allow-renames', da.code === 1 && /attribute/.test(da.out));

  // unicode identifiers accepted
  const uni = apply({ renames: { lower: 'cota_inferior_área' }, cell_names: {} }, 'stageb-uni.srwb');
  check('unicode rename target applies + derives', uni.code === 0 &&
    run(['tools/span-derive.mjs', EN, uni.out, 'es', '--allow-renames']).code === 0);

  console.log('5c. Stage B: kwarg immunity and def-parameter renames');

  const kwg = apply({ renames: { layout: 'disposición', doublings: 'duplicaciones' } }, 'stageb-kwarg.srwb');
  check('apply succeeds with kwarg-colliding glossary', kwg.code === 0);
  if (kwg.code === 0) {
    const txt = readFileSync(kwg.out, 'utf8');
    check('call kwarg name NOT renamed', txt.includes('layout=disposición') && !txt.includes('disposición=disposición'));
    check('def default parameter IS renamed', /def [^(]+\(duplicaciones=/.test(txt));
    check('derive passes the kwarg-safe result',
      run(['tools/span-derive.mjs', EN, kwg.out, 'es', '--allow-renames']).code === 0);
  }
  // hand-forged kwarg rename must fail derive
  const kwBad = JSON.parse(readFileSync(EN, 'utf8'));
  kwBad.notebook.cells[1].code = kwBad.notebook.cells[1].code.replace('layout=layout', 'disposición=layout');
  const pkw = path.join(tmp, 'stageb-kwbad.srwb');
  writeFileSync(pkw, JSON.stringify(kwBad, null, 2));
  const dkw = run(['tools/span-derive.mjs', EN, pkw, 'es', '--allow-renames']);
  check('renamed call kwarg fails derive', dkw.code === 1 && /keyword-argument name/.test(dkw.out), dkw.out.split('\n').find(l=>/keyword/.test(l))||'');

  console.log('5d. span-apply: candidates + mechanical application');

  const candOut = run(['tools/span-apply.mjs', 'candidates', EN]);
  check('candidates generation succeeds', candOut.code === 0);
  const cands = candOut.code === 0 ? JSON.parse(candOut.out).candidates : [];
  check('candidates cover comments, strings, headers',
    ['comment', 'display_string', 'docstring', 'header_literal']
      .every(k => cands.some(c => c.kind === k)), String(cands.length));
  check('trap not offered', !cands.some(c => c.kind === 'trap'));
  const hdr16 = cands.find(c => c.kind === 'header_literal' && c.text === 'lower bound');
  check('header candidate carries width', hdr16?.width === 16, String(hdr16?.width));

  const applyMap = (map, out) => {
    const mp = path.join(tmp, `map-${out}.json`);
    writeFileSync(mp, JSON.stringify(map));
    return run(['tools/span-apply.mjs', 'apply', EN, mp, path.join(tmp, out), '--en', EN]);
  };
  const cmt = cands.find(c => c.kind === 'comment' && /Visualize the starting/.test(c.text));
  const okA = applyMap({ [cmt.id]: 'Visualisiere das Sechseck.' }, 'sa-ok.srwb');
  check('apply succeeds and rewrites the comment', okA.code === 0 &&
    /Visualisiere das Sechseck\./.test(readFileSync(path.join(tmp, 'sa-ok.srwb'), 'utf8')));
  check('identity apply is byte-stable', (() => {
    const r = applyMap({}, 'sa-id.srwb');
    return r.code === 0 && JSON.stringify(JSON.parse(readFileSync(path.join(tmp, 'sa-id.srwb'), 'utf8')))
      === JSON.stringify(JSON.parse(readFileSync(EN, 'utf8')));
  })());
  check('width violation rejected',
    applyMap({ [hdr16.id]: 'viel zu langer Spaltentitel' }, 'sa-w.srwb').code === 1);
  check('unknown id rejected', applyMap({ '9:99:0': 'x' }, 'sa-u.srwb').code === 1);
  const ds = cands.find(c => c.kind === 'display_string' && c.tok === undefined && c.text.length > 3);
  check('quote char in translation rejected', (() => {
    const any = cands.find(c => c.kind === 'display_string');
    return applyMap({ [any.id]: 'kaputt " kaputt' }, 'sa-q.srwb').code === 1
        || applyMap({ [any.id]: "kaputt ' kaputt" }, 'sa-q2.srwb').code === 1;
  })());

  console.log('5e. NFC normalization of rename targets (bn regression)');
  // Bengali \u09dc is composition-EXCLUDED: its NFC form is decomposed.
  // The precomposed form must be accepted and normalized, not rejected.
  const bnGloss = apply({ renames: { hexagon: 'ষড়ভুজ'.normalize('NFD').replace('\u09a1\u09bc', '\u09dc') } }, 'stageb-bn.srwb');
  check('precomposed excluded char accepted', bnGloss.code === 0, bnGloss.log.slice(0, 150));
  if (bnGloss.code === 0) {
    const txt = readFileSync(bnGloss.out, 'utf8');
    check('stored form is NFC', txt.includes('ষড়ভুজ'.normalize('NFC')) );
    check('derive passes NFC-normalized result',
      run(['tools/span-derive.mjs', EN, bnGloss.out, 'bn', '--allow-renames']).code === 0);
  }

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
