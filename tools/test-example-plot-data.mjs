import assert from 'node:assert/strict';
import { plotData, categoryLabels } from './example-plot-data.mjs';
const en = { traces: [{ x: [1, 2], y: [3, 4], name: 'Counts', text: ['A', 'B'] }],
  layout: { title: 'Trial', yaxis: { title: 'Risk', range: [0, 5] }, height: 600,
    shapes: [{ name: 'true ARR = 0.040', x0: 0.04, x1: 0.04, showlegend: true }],
    annotations: [{ text: 'Note', x: 0, y: 1 }] } };
const de = structuredClone(en);
de.traces[0].name = 'Anzahlen'; de.traces[0].text = ['X', 'Y'];
de.layout.title = 'Studie'; de.layout.yaxis.title = 'Risiko';
de.layout.shapes[0].name = 'wahre ARR = 0.040'; de.layout.annotations[0].text = 'Hinweis';
assert.deepEqual(plotData(en), plotData(de));
for (const mutate of [
  p => { p.traces[0].y[0] = 99; },
  p => { p.layout.shapes[0].x0 = 0.05; },
  p => { p.layout.yaxis.range[1] = 6; },
  p => { p.layout.height = 700; },
  p => { p.layout.shapes[0].showlegend = false; },
  p => { p.layout.annotations[0].y = 2; },
]) {
  const changed = structuredClone(de); mutate(changed);
  assert.notDeepEqual(plotData(en), plotData(changed));
}
assert.equal(en.layout.shapes[0].name, 'true ARR = 0.040');
const objectTitle = { layout: { title: { text: 'Trial', x: 0.5, font: { size: 16 } },
  yaxis: { title: { text: 'Risk', standoff: 20 } } } };
const objectTranslated = structuredClone(objectTitle);
objectTranslated.layout.title.text = 'Studie'; objectTranslated.layout.yaxis.title.text = 'Risiko';
assert.deepEqual(plotData(objectTitle), plotData(objectTranslated));
for (const mutate of [
  p => { p.layout.title.x = 0.9; },
  p => { p.layout.title.font.size = 30; },
  p => { p.layout.yaxis.title.standoff = 40; },
]) {
  const changed = structuredClone(objectTranslated); mutate(changed);
  assert.notDeepEqual(plotData(objectTitle), plotData(changed));
}
const sourceCategories = { traces: [{ x: ['Baseline makeup', 'After recovery', 'Recovered condensate'], y: [12, 10, 2] }] };
const targetCategories = { traces: [{ x: ['Air penambah', 'Setelah pemulihan', 'Kondensat pulih'], y: [12, 10, 2] }] };
const span = (source, target, cell_index = 3, kind = 'display_string') =>
  ({ cell_index, kind, source_span: { text: source }, target_span: { text: target } });
const categoryManifest = { spans: [span('Baseline makeup', 'Air penambah'),
  span('After recovery', 'Setelah pemulihan'), span('Recovered condensate', 'Kondensat pulih')] };
const mapping = categoryLabels('cooling-plume-capture', categoryManifest);
assert.deepEqual([sourceCategories].map(plotData), [plotData(sourceCategories)]);
assert.deepEqual(plotData(sourceCategories), plotData(targetCategories, mapping));
assert.deepEqual(targetCategories.traces[0].x, ['Air penambah', 'Setelah pemulihan', 'Kondensat pulih']);
for (const mutate of [
  p => { p.traces[0].y[0] = 13; },
  p => { p.traces[0].x.reverse(); },
  p => { p.traces[0].x[0] = 'unknown'; },
  p => { p.traces[0].x.push('Air penambah'); },
]) {
  const changed = structuredClone(targetCategories); mutate(changed);
  assert.notDeepEqual(plotData(sourceCategories), plotData(changed, mapping));
}
assert.equal(categoryLabels('patients-to-evidence', categoryManifest).size, 0);
assert.equal(categoryLabels('cooling-plume-capture', { spans: [span('Baseline makeup', 'X', 1)] }).size, 0);
assert.equal(categoryLabels('cooling-plume-capture', { spans: [span('Baseline makeup', 'X', 3, 'comment')] }).size, 0);
assert.equal(categoryLabels('cooling-plume-capture', { spans: [span('Mild', 'X')] }).size, 0);
assert.throws(() => categoryLabels('cooling-plume-capture', { spans: [span('Baseline makeup', 'X'), span('After recovery', 'X')] }), /Ambiguous/);
console.log('[PASS] 24 plot checks: explicit presentation categories only; values/order/settings still exact; no mutation.');
