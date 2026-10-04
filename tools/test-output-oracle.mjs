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

// Real R/sprintf pilot: a global regex .test leaked its lastIndex from a
// long format string into the next shorter one, leaving "in" unmasked.
const formatted = manifest([
  span(1, 'A long descriptive heading before the count: %d\\n', 'Un encabezado descriptivo largo antes del recuento: %d\\n'),
  span(1, 'RR in %s = %.4f\\n', 'RR en %s = %.4f\\n'),
]);
const enFormatted = run([null, 'A long descriptive heading before the count: 500\nRR in Mild = 1.2143\n']);
const esFormatted = run([null, 'Un encabezado descriptivo largo antes del recuento: 500\nRR en Mild = 1.2143\n']);
check('adjacent long/short format strings mask deterministically across calls',
  judge(enFormatted, esFormatted, formatted).pass && judge(enFormatted, esFormatted, formatted).pass);
check('format masking still rejects changed RR values',
  !judge(enFormatted, run([null, 'Un encabezado descriptivo largo antes del recuento: 500\nRR en Mild = 1.9999\n']), formatted).pass);

const reorderedR = manifest([
  span(1, '  A: success = %d, failure = %d  (p_A = %.4f, n = %d)\\n',
    '  A: সাফল্য = %d, ব্যর্থতা = %d  (p_A = %.4f, n = %d)\\n'),
  span(1, '  RR(A/B) in %s = %.4f\\n\\n', '  %s-এ RR(A/B) = %.4f\\n\\n'),
]);
const enReorderedR = run([null, '  A: success = 85, failure = 15  (p_A = 0.8500, n = 100)\n  RR(A/B) in Mild = 1.2143\n\n']);
const bnReorderedR = run([null, '  A: সাফল্য = 85, ব্যর্থতা = 15  (p_A = 0.8500, n = 100)\n  Mild-এ RR(A/B) = 1.2143\n\n']);
check('unchanged format runs protect shared fields from short translated label masks',
  judge(enReorderedR, bnReorderedR, reorderedR).pass);
for (const [from, to] of [['85', '86'], ['15', '14'], ['0.8500', '0.8600'], ['100', '101'], ['1.2143', '1.2144'], ['p_A', 'p_B']]) {
  const changed = structuredClone(bnReorderedR);
  changed.notebook.cells[1].output = changed.notebook.cells[1].output.replace(from, to);
  check('protected format runs still reject changed output ' + from,
    !judge(enReorderedR, changed, reorderedR).pass);
}

const startsWithValue = manifest([span(1, 'Validated %d complete rankings of %d foods.\\n',
  '%d vollständige Ranglisten mit %d Lebensmitteln validiert.\\n')]);
const enRankings = run([null, 'Validated 42 complete rankings of 15 foods.']);
const deRankings = run([null, '42 vollständige Ranglisten mit 15 Lebensmitteln validiert.']);
check('a translated printf template may start with its unchanged first value',
  judge(enRankings, deRankings, startsWithValue).pass);
check('a missing terminal newline is permitted only at the saved-stream boundary',
  judge(run([null, enRankings.notebook.cells[1].output + '\n']), deRankings, startsWithValue).pass);
for (const output of ['41 vollständige Ranglisten mit 15 Lebensmitteln validiert.',
  '42 vollständige Ranglisten mit 16 Lebensmitteln validiert.',
  '15 vollständige Ranglisten mit 42 Lebensmitteln validiert.',
  '42 vollständige Ranglisten mit 15 Lebensmitteln validiert. EXTRA']) {
  check('complete printf matching rejects changed/moved values or extra undeclared text',
    !judge(enRankings, run([null, output]), startsWithValue).pass);
}
const winners = manifest([span(1, '~w winner: ~w~n', 'Ganador de ~w: ~w~n')]);
const enWinners = run([null, 'plurality winner: Buttered toast\nborda winner: Cinnamon bun']);
const esWinners = run([null, 'Ganador de plurality: Buttered toast\nGanador de borda: Cinnamon bun']);
check('translated Prolog format prefix preserves each repeated rule and food value',
  judge(enWinners, esWinners, winners).pass);
for (const output of ['Ganador de plurality: Buttered toast\nGanador de borda: Coffee cake',
  'Ganador de plurality: Buttered toast\nGanador de random: Cinnamon bun',
  'Ganador de borda: Cinnamon bun\nGanador de plurality: Buttered toast']) {
  check('complete Prolog matching rejects changed data and reordered results',
    !judge(enWinners, run([null, output]), winners).pass);
}
const opaqueData = manifest([span(1, 'Data: %s\\n', 'Datos: %s\\n'),
  span(1, 'winner', 'ganador', 'none')]);
check('captured data cannot be accidentally masked as another translated label',
  !judge(run([null, 'Data: winner']), run([null, 'Datos: ganador']), opaqueData).pass);
check('the template cannot silently swallow a missing internal result newline',
  !judge(enWinners, run([null, esWinners.notebook.cells[1].output.replace('\n', '')]), winners).pass);

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

console.log('8h. Comment-substring must not shred longer display spans (lua/ru regression)');
const mS = manifest([
  span(1, 'Odd squares: ', 'Nechetnye kvadraty: '),
  span(1, 'square', 'kvadrat', 'none'),
]);
const jS = judge(run([null, 'Odd squares: 1 9 25']), run([null, 'Nechetnye kvadraty: 1 9 25']), mS);
check('substring comment span does not break longer span mask', jS.pass, jS.failures.join('|'));

const asymmetric = manifest([
  span(1, 'Risk difference (percentage points) = ', '风险差（百分点）= '),
  span(1, 'A very long explanatory comment describing the risk difference', '风险差', 'none'),
]);
const enRisk = run([null, 'Risk difference (percentage points) = -1.501']);
check('different source/target length ordering preserves paired label identities',
  judge(enRisk, run([null, '风险差（百分点）= -1.501']), asymmetric).pass);
check('asymmetric label masking still rejects changed numerical results',
  !judge(enRisk, run([null, '风险差（百分点）= -1.502']), asymmetric).pass);
check('an empty translated span does not inject sentinels between output characters',
  !judge(run([null, 'Heading: 5']), run([null, '5']), manifest([span(1, 'Heading: ', '')])).pass);

console.log('9. Sentinel collision resistance');
// translated word 'términos' coincidentally equals another legit span's text —
// symmetric sentinels keep them distinct because masking is per-span-index
const enC = run([null, 'terms and terms again']);
const xxC = run([null, 'términos and términos again']);
const mC = manifest([span(1, 'terms', 'términos')]);
check('repeated span text masks all occurrences symmetrically', judge(enC, xxC, mC).pass);

console.log(`\n${failed ? `FAIL: ${failed} failed, ${passed} passed` : `PASS: ${passed} passed`}`);
process.exit(failed ? 1 : 0);
