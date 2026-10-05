// Strip only known presentation labels; all coordinates and chart settings
// remain part of the exact comparison. Code-span gates validate the labels.
// These three Cooling x-axis strings are presentation categories, not mode
// IDs or dataset keys. Map only exact controller-approved translated spans
// back to their English identity; order and every numeric coordinate remain.
const COOLING_CATEGORY_LABELS = new Set(['Baseline makeup', 'After recovery', 'Recovered condensate']);
export function categoryLabels(lesson, manifest) {
  const labels = new Map();
  if (lesson !== 'cooling-plume-capture') return labels;
  for (const span of manifest.spans || []) {
    const source = span.source_span?.text, target = span.target_span?.text;
    if (span.cell_index !== 3 || span.kind !== 'display_string' || !COOLING_CATEGORY_LABELS.has(source)) continue;
    if (typeof target !== 'string' || !target.length) throw new Error('Missing categorical presentation label');
    if (labels.has(target) && labels.get(target) !== source) throw new Error('Ambiguous translated category identity');
    labels.set(target, source);
  }
  return labels;
}
export function plotData(value, categories = new Map()) {
  // Preserve ordinary Array.map(plotData) callers (its second argument is
  // the numeric index, not an authorization map).
  const categoryMap = categories instanceof Map ? categories : new Map();
  const out = structuredClone(value);
  const stripLabel = (owner, key) => {
    const label = owner[key];
    if (label && typeof label === 'object' && !Array.isArray(label)) delete label.text;
    else delete owner[key];
  };
  for (const key of ['title', 'xlabel', 'ylabel']) stripLabel(out, key);
  for (const trace of out.traces || []) {
    delete trace.name; delete trace.text;
    for (const axis of ['x', 'y']) if (Array.isArray(trace[axis]))
      trace[axis] = trace[axis].map(value => typeof value === 'string' && categoryMap.has(value) ? categoryMap.get(value) : value);
  }
  const layout = out.layout || {};
  stripLabel(layout, 'title');
  for (const key of Object.keys(layout).filter(key => /^[xy]axis\d*$/.test(key))) stripLabel(layout[key], 'title');
  for (const annotation of layout.annotations || []) delete annotation.text;
  for (const shape of layout.shapes || []) delete shape.name;
  return out;
}
