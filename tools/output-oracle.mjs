#!/usr/bin/env node
/**
 * output-oracle.mjs — the Stage A runtime differential oracle (pure logic).
 *
 * Inputs are POST-RUN canonical exports (the app's export_workbook output —
 * the shipped source workbooks carry no outputs; only the bench produces
 * them) plus the derived span manifest. Three operations:
 *
 *   envelope <en-run-1> <en-run-2>
 *       Determinism envelope: per-cell diff of two English runs. Emits the
 *       exclusions list (schema shape) for any unstable region; exit 1 if
 *       anything is unstable, because an unstable English baseline cannot
 *       gate a translation until pinned or excluded.
 *
 *   judge <en-run> <xx-run> <derived-manifest>
 *       The oracle proper, with symmetric sentinel masking (collision-
 *       resistant): every stdout-reaching span's source text is replaced by
 *       an indexed sentinel in the English outputs, its target text by the
 *       same sentinel in the translated outputs; the results must be
 *       byte-identical per cell. Checked-claim rule: a reaches_output:none
 *       span's target text appearing in any output fails. Exclusions are
 *       subtracted before comparison.
 *
 * Output extraction is isolated in an ADAPTER (extractTextOutputs) because
 * the canonical export's exact field names are confirmed on first bench
 * contact — the oracle logic is shape-independent.
 */

import { readFileSync } from 'node:fs';

/* ---------------------------- adapter ---------------------------------- */

/**
 * Return per-cell arrays of text output blocks from a canonical export.
 * Tolerates the plausible shapes; extend on first real bench export.
 * Plot/image outputs are EXCLUDED here — they route to the plot check.
 */
export function extractTextOutputs(nb) {
  const isSrwb = nb.format === 'srwb';
  const cells = isSrwb ? nb.notebook.cells : nb.cells;
  return cells.map((c) => {
    const blocks = [];
    const push = (v) => { if (typeof v === 'string' && v.length) blocks.push(v); };
    // srwb post-run shape (confirmed on the live bench 2026-08-15):
    // `lastOutput` is the text stream; `lastOutputHtml` is rendered output
    // (plots) and is plot-check territory, not the text oracle's.
    if (typeof c.lastOutput === 'string') push(c.lastOutput);
    // tolerated legacy/alternative shapes
    const out = c.output;
    if (typeof out === 'string') push(out);
    else if (out && typeof out === 'object') {
      push(out.text); push(out.stdout);
      if (out['text/plain']) push(out['text/plain']);
    }
    // nbformat outputs array
    if (Array.isArray(c.outputs)) {
      for (const o of c.outputs) {
        if (o.output_type === 'stream') push(Array.isArray(o.text) ? o.text.join('') : o.text);
        else if (o.output_type === 'execute_result' || o.output_type === 'display_data') {
          const d = o.data || {};
          if (d['text/plain']) push(Array.isArray(d['text/plain']) ? d['text/plain'].join('') : d['text/plain']);
          // image/* deliberately ignored: plot check territory
        } else if (o.output_type === 'error') {
          push(`ERROR:${o.ename}:${o.evalue}`);
        }
      }
    }
    return blocks;
  });
}

/* ------------------------- determinism envelope ------------------------- */

export function envelope(run1, run2) {
  const a = extractTextOutputs(run1), b = extractTextOutputs(run2);
  const exclusions = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const xa = (a[i] || []).join('\n'), xb = (b[i] || []).join('\n');
    if (xa !== xb) {
      exclusions.push({
        cell_index: i,
        reason: 'unstable across identical English runs — pin (seed/clock) or accept exclusion',
        sample_a: xa.slice(0, 160), sample_b: xb.slice(0, 160),
      });
    }
  }
  return { stable: exclusions.length === 0, exclusions };
}

/* ------------------------------ the oracle ------------------------------ */

/**
 * Rendered form of a span's text as it appears in program OUTPUT:
 * - Python escape sequences in the source literal (\n, \t, ...) are decoded,
 *   because the manifest stores the raw string body, not the printed bytes.
 * - A format_spec like '>16' pads the text to its field width (the reason
 *   equal-width headers with different text lengths still align).
 */
export function renderedText(text, formatSpec) {
  let t = text.replace(/\\(n|t|r|\\|'|")/g, (_, c) =>
    c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c);
  const m = /^([<>^])(\d+)$/.exec(formatSpec || '');
  if (m) {
    const w = Number(m[2]);
    const pad = Math.max(0, w - [...t].length);
    if (m[1] === '>') t = ' '.repeat(pad) + t;
    else if (m[1] === '<') t = t + ' '.repeat(pad);
    else t = ' '.repeat(Math.floor(pad / 2)) + t + ' '.repeat(Math.ceil(pad / 2));
  }
  return t;
}

export function judge(enRun, xxRun, manifest) {
  const failures = [];
  const en = extractTextOutputs(enRun);
  const xx = extractTextOutputs(xxRun);
  if (en.length !== xx.length) {
    failures.push(`cell count differs in outputs: ${en.length} vs ${xx.length}`);
    return { pass: false, failures };
  }
  const excluded = new Set((manifest.exclusions || []).map(e => e.cell_index));

  // spans that legitimately reach stdout, indexed for sentinels
  const stdoutSpans = (manifest.spans || []).filter(s =>
    s.reaches_output === 'stdout' || s.reaches_output === 'both');
  // checked-claim applies to content spans (comments/docstrings) only:
  // cell_name spans are METADATA whose translation may legitimately
  // coincide with translated prose in the same cell's output
  const noneSpans = (manifest.spans || []).filter(s =>
    s.reaches_output === 'none' && s.kind !== 'cell_name');
  const plotCells = new Set((manifest.spans || [])
    .filter(s => s.reaches_output === 'plot' || s.reaches_output === 'both')
    .map(s => s.cell_index));

  for (let i = 0; i < en.length; i++) {
    if (excluded.has(i)) continue;
    let a = en[i].join('\n');
    let b = xx[i].join('\n');

    // checked-claim rule: 'none' spans must not surface in outputs
    for (const s of noneSpans) {
      if (s.cell_index === i && s.target_span?.text && b.includes(renderedText(s.target_span.text, s.format_spec))) {
        failures.push(`cell ${i}: reaches_output:none span surfaced in output — misclassified: ${JSON.stringify(s.target_span.text.slice(0, 60))}`);
      }
    }

    // symmetric sentinel masking, longest-first to avoid substring shadowing;
    // masks the RENDERED text (escapes decoded, field padding applied)
    const spansHere = stdoutSpans
      .filter(s => s.cell_index === i)
      .map(s => ({
        src: renderedText(s.source_span.text, s.format_spec),
        dst: renderedText(s.target_span.text, s.format_spec),
      }))
      .sort((x, y) => y.src.length - x.src.length);
    spansHere.forEach((s, k) => {
      const sentinel = `⟦S${i}_${k}⟧`;
      a = a.split(s.src).join(sentinel);
      b = b.split(s.dst).join(sentinel);
    });

    if (a !== b) {
      // locate first divergence for the report
      let d = 0;
      while (d < Math.min(a.length, b.length) && a[d] === b[d]) d++;
      failures.push(`cell ${i}: outputs differ outside declared spans at offset ${d}: ` +
        `en=${JSON.stringify(a.slice(Math.max(0, d - 20), d + 40))} xx=${JSON.stringify(b.slice(Math.max(0, d - 20), d + 40))}`);
    }
  }
  return { pass: failures.length === 0, failures, plotCells: [...plotCells] };
}

/* --------------------------------- CLI ---------------------------------- */

const [, , mode, ...paths] = process.argv;
if (mode === 'envelope' || mode === 'judge') {
  const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
  if (mode === 'envelope') {
    const r = envelope(load(paths[0]), load(paths[1]));
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.stable ? 0 : 1);
  } else {
    const r = judge(load(paths[0]), load(paths[1]), load(paths[2]));
    for (const f of r.failures) console.error('FAIL ' + f);
    if (r.plotCells.length) console.error(`note: plot check required for cell(s) ${r.plotCells.join(', ')} (separate tool)`);
    console.log(r.pass ? 'ORACLE PASS' : `ORACLE FAIL (${r.failures.length})`);
    process.exit(r.pass ? 0 : 1);
  }
}
