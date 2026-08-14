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
check('reaches_output:none span surfacing in output fails',
  !j5.pass && /misclassified/.test(j5.failures[0]));

console.log('7. Exclusions and plot routing');
const en3 = run([null, 'ts=100', 'stable']);
const xx6 = run([null, 'ts=999', 'stable']);
const m3 = manifest([], [{ cell_index: 1, reason: 'unstable timestamp' }]);
check('excluded cell differences are tolerated', judge(en3, xx6, m3).pass);
const m4 = manifest([span(1, 'Unit circle', 'Círculo unitario', 'plot')]);
const j7 = judge(run([null, 'same']), run([null, 'same']), m4);
check('plot spans reported for the plot check, not text-diffed',
  j7.pass && j7.plotCells.includes(1), JSON.stringify(j7.plotCells));

console.log('8. Sentinel collision resistance');
// translated word 'términos' coincidentally equals another legit span's text —
// symmetric sentinels keep them distinct because masking is per-span-index
const enC = run([null, 'terms and terms again']);
const xxC = run([null, 'términos and términos again']);
const mC = manifest([span(1, 'terms', 'términos')]);
check('repeated span text masks all occurrences symmetrically', judge(enC, xxC, mC).pass);

console.log(`\n${failed ? `FAIL: ${failed} failed, ${passed} passed` : `PASS: ${passed} passed`}`);
process.exit(failed ? 1 : 0);
