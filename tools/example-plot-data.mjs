// Strip only known presentation labels; all coordinates and chart settings
// remain part of the exact comparison. Code-span gates validate the labels.
export function plotData(value) {
  const out = structuredClone(value);
  const stripLabel = (owner, key) => {
    const label = owner[key];
    if (label && typeof label === 'object' && !Array.isArray(label)) delete label.text;
    else delete owner[key];
  };
  for (const key of ['title', 'xlabel', 'ylabel']) stripLabel(out, key);
  for (const trace of out.traces || []) { delete trace.name; delete trace.text; }
  const layout = out.layout || {};
  stripLabel(layout, 'title');
  for (const key of Object.keys(layout).filter(key => /^[xy]axis\d*$/.test(key))) stripLabel(layout[key], 'title');
  for (const annotation of layout.annotations || []) delete annotation.text;
  for (const shape of layout.shapes || []) delete shape.name;
  return out;
}
