#!/usr/bin/env node
/**
 * test-output-oracle.mjs — synthetic-fixture tests for the runtime oracle's
 * pure logic. Real post-run exports replace these shapes at first bench
 * contact; the logic under test is shape-independent.
 */

import { envelope, judge, extractTextOutputs } from './output-oracle.mjs';

let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ': ' + detail : ''}`);
  ok ? passed++ : failed++;
};

// A minimal post-run srwb-flavored export
const run = (outputs) => ({
  format: 'srwb', notebook: {
    cells: outputs.map((o, i) => ({ type: i === 0 ? 'markdown' : 'python', code: 'x', output: o })),
  },
});
const span = (cell, src, dst, reaches = 'stdout') => ({
  cell_index: cell, kind: 'display_string', reaches_output: reaches,
  source_span: { text: src }, target_span: { text: dst }, placeholders: [],
});
const manifest = (spans, exclusions = []) => ({ manifest_version: 1, spans, exclusions });

console.log('1. Adapter tolerates both shapes');
check('srwb string output extracted', extractTextOutputs(run([null, 'hello']))[1][0] === 'hello');
check('nbformat stream output extracted',
  extractTextOutputs({ cells: [{ cell_type: 'code', outputs: [{ output_type: 'stream', text: ['a', 'b'] }] }] })[0][0] === 'ab');
check('images ignored by the text adapter',
  extractTextOutputs({ cells: [{ cell_type: 'code', outputs: [{ output_type: 'display_data', data: { 'image/png': 'AAAA' } }] }] })[0].length === 0);

console.log('2. Determinism envelope');
const e1 = envelope(run([null, 'pi=3.14159']), run([null, 'pi=3.14159']));
check('stable runs pass', e1.stable && e1.exclusions.length === 0);
const e2 = envelope(run([null, 'time=12:01']), run([null, 'time=12:02']));
check('unstable runs produce exclusions', !e2.stable && e2.exclusions[0].cell_index === 1);

console.log('3. Oracle: clean translation passes');
const en1 = run([null, 'Final enclosure: 3.14 < pi < 3.15', 'Work needed for accuracy:\n  Leibniz guarantee: 5 terms']);
const xx1 = run([null, 'Cerco final: 3.14 < pi < 3.15', 'Trabajo necesario para la precisión:\n  Garantía de Leibniz: 5 términos']);
const m1 = manifest([
  span(1, 'Final enclosure: ', 'Cerco final: '),
  span(2, 'Work needed for accuracy:', 'Trabajo necesario para la precisión:'),
  span(2, '  Leibniz guarantee: ', '  Garantía de Leibniz: '),
  span(2, ' terms', ' términos'),
]);
const j1 = judge(en1, xx1, m1);
check('declared-span translation passes', j1.pass, j1.failures.join(' | '));

console.log('4. Oracle: undeclared difference fails');
const xx2 = run([null, 'Cerco final: 3.14 < pi < 3.16', 'Trabajo necesario para la precisión:\n  Garantía de Leibniz: 5 términos']);
const j2 = judge(en1, xx2, m1);
check('a changed NUMBER fails (computation broke)', !j2.pass && /outside declared spans/.test(j2.failures[0]));

const xx3 = run([null, 'Cerco final: 3.14 < pi < 3.15', 'Trabajo necesario para la precisión:\n  Garantía de Leibniz: 5 resultados']);
const j3 = judge(en1, xx3, m1);
check('an undeclared word change fails', !j3.pass);

console.log('5. Oracle: missed translation fails');
const xx4 = run([null, 'Cerco final: 3.14 < pi < 3.15', 'Trabajo necesario para la precisión:\n  Garantía de Leibniz: 5 terms']);
const j4 = judge(en1, xx4, m1);
check('a span left in English fails (sentinel mismatch)', !j4.pass);

console.log('6. Checked-claim rule');
const m2 = manifest([...m1.spans, span(2, 'a comment', 'un comentario', 'none')]);
const xx5 = run([null, 'Cerco final: 3.14 < pi < 3.15', 'un comentario\nTrabajo necesario para la precisión:\n  Garantía de Leibniz: 5 términos']);
const j5 = judge(en1, xx5, m2);
check('reaches_output:none span surfacing in output warns (demoted 2026-08-15)',
  j5.warnings.length >= 1 && /appears in output/.test(j5.warnings[0]));

console.log('7. Exclusions and plot routing');
const en3 = run([null, 'ts=100', 'stable']);
const xx6 = run([null, 'ts=999', 'stable']);
const m3 = manifest([], [{ cell_index: 1, reason: 'unstable timestamp' }]);
check('excluded cell differences are tolerated', judge(en3, xx6, m3).pass);
const m4 = manifest([span(1, 'Unit circle', 'Círculo unitario', 'plot')]);
const j7 = judge(run([null, 'same']), run([null, 'same']), m4);
check('plot spans reported for the plot check, not text-diffed',
  j7.pass && j7.plotCells.includes(1), JSON.stringify(j7.plotCells));

console.log('8. Rendered-text masking (pilot regression: escapes and field padding)');
// \n stored raw in the manifest must match the real newline in output
const enE = run([null, 'x\nThe methods differ.']);
const xxE = run([null, 'x\nLos métodos difieren.']);
const mE = manifest([span(1, '\\nThe methods differ.', '\\nLos métodos difieren.')]);
check('escaped \\n span masks rendered newline', judge(enE, xxE, mE).pass,
  judge(enE, xxE, mE).failures.join(' | '));
// same width, different text length → different padding; padded-field masking
const enP = run([null, '     lower bound|   1']);
const xxP = run([null, '   cota inferior|   1']);
const mP = manifest([{ ...span(1, 'lower bound', 'cota inferior'), format_spec: '>16' }]);
check('width-16 header masks with padding', judge(enP, xxP, mP).pass,
  judge(enP, xxP, mP).failures.join(' | '));
const xxP2 = run([null, '   cota inferior|   2']);
check('padded masking still catches a changed number', !judge(enP, xxP2, mP).pass);

console.log('8b. cell_name spans exempt from checked-claim');
const mCN = manifest([
  { cell_index: 1, kind: 'cell_name', reaches_output: 'none',
    source_span: { text: 'accuracy' }, target_span: { text: 'precisión' }, placeholders: [] },
  span(1, 'accuracy of', 'precisión de'),
]);
const jCN = judge(run([null, 'the accuracy of pi']), run([null, 'the precisión de pi']), mCN);
check('cell name coinciding with output prose passes', jCN.pass, jCN.failures.join(' | '));

console.log('8c. Plot cells excluded from the text diff (ko regression)');
// a cell with rendered html in BOTH runs may show different tick text
// (auto-range shifts with label width) — routed to plot check instead
const plotRun = (ticks) => ({ format: 'srwb', notebook: { cells: [
  { type: 'python', code: 'x', lastOutput: ticks, lastOutputHtml: '<svg>...</svg>' },
  { type: 'python', code: 'y', lastOutput: 'stable' },
] } });
const jP = judge(plotRun('−2−1012'), plotRun('−3−2−10123'), manifest([]));
check('differing plot tick text passes (routed to plot check)', jP.pass, jP.failures.join(' | '));
check('plot cell reported for plot check', jP.plotCells.includes(0), JSON.stringify(jP.plotCells));
const jP2 = judge(plotRun('−2−1012'),
  { format: 'srwb', notebook: { cells: [
    { type: 'python', code: 'x', lastOutput: '−2−1012', lastOutputHtml: '<svg>...</svg>' },
    { type: 'python', code: 'y', lastOutput: 'CHANGED' },
  ] } }, manifest([]));
check('non-plot cell still text-diffed strictly', !jP2.pass);

console.log('8d. Layout-shift tolerance (R table auto-width)');
const mL = manifest([span(1, 'gear', 'marchas')]);
const jL = judge(run([null, 'gear\n  4    3   8\n  6    4   3']),
                 run([null, 'marchas\n  4     3   8\n  6     4   3']), mL);
check('span-bearing cell tolerates space-run reflow', jL.pass && jL.layoutShifted.includes(1), jL.failures.join('|'));
const jL2 = judge(run([null, 'gear\n  4    3   8']), run([null, 'marchas\n  4     3   9']), mL);
check('value change still fails through reflow', !jL2.pass);
const jL3 = judge(run([null, 'x\n  4    3']), run([null, 'x\n  4     3']), manifest([]));
check('span-less cell does NOT get reflow tolerance', !jL3.pass);

console.log('8e. Format-spec literal-run masking (prolog/lua/R formatted output)');
const mF = manifest([span(1, 'Count: ~w~n', 'Conteo: ~w~n')]);
const jF = judge(run([null, 'Count: 5\n']), run([null, 'Conteo: 5\n']), mF);
check('~w-formatted output masks by literal runs', jF.pass, jF.failures.join('|'));
const jF2 = judge(run([null, 'Count: 5\n']), run([null, 'Conteo: 7\n']), mF);
check('value change through format string still fails', !jF2.pass);

console.log('8f. Checked-claim demoted to warning');
const mW = manifest([span(1, 'expected: yes', 'esperado: sí', 'none'), span(1, 'Result: ', 'Resultado: ')]);
const jW = judge(run([null, 'Result: expected: yes']), run([null, 'Resultado: esperado: sí']), mW);
check('comment echoed in output warns but passes', jW.pass && jW.warnings.length === 1, jW.failures.join('|'));

console.log('8g. Cross-cell surfacing (meta-workbooks print other cells)');
const mX = manifest([span(2, 'Total: ', 'Total generales: ')]);
const jX = judge(run([null, 'Total: 5', 'x']), run([null, 'Total generales: 5', 'x']), mX);
check('span from cell 2 masks when surfacing in cell 1', jX.pass, jX.failures.join('|'));

console.log('9. Sentinel collision resistance');
// translated word 'términos' coincidentally equals another legit span's text —
// symmetric sentinels keep them distinct because masking is per-span-index
const enC = run([null, 'terms and terms again']);
const xxC = run([null, 'términos and términos again']);
const mC = manifest([span(1, 'terms', 'términos')]);
check('repeated span text masks all occurrences symmetrically', judge(enC, xxC, mC).pass);

console.log(`\n${failed ? `FAIL: ${failed} failed, ${passed} passed` : `PASS: ${passed} passed`}`);
process.exit(failed ? 1 : 0);
