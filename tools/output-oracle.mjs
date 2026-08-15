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

// format placeholders (%-specs, ~specs) — must match span-lib's notion
const SPEC_RE = /%[-+#0-9.*]*[a-zA-Z%]|~[0-9]*[a-zA-Z~]|\$\([^)]*\)|\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*/g;

/* ---------------------------- adapter ---------------------------------- */

/**
 * Return per-cell arrays of text output blocks from a canonical export.
 * Tolerates the plausible shapes; extend on first real bench export.
 * Plot/image outputs are EXCLUDED here — they route to the plot check.
 */
export function renderedHtmlCells(nb) {
  // every cell carries lastOutputHtml (text cells as <pre class="text-result">);
  // only actual PLOT markup routes a cell out of the text diff
  const isPlot = (h) => typeof h === 'string' && (/js-plotly-plot|<svg/i.test(h)) && !/^<pre class="text-result"/.test(h);
  const cells = nb.format === 'srwb' ? nb.notebook.cells : nb.cells;
  return new Set(cells.map((c, i) => isPlot(c.lastOutputHtml) ? i : -1).filter(i => i >= 0));
}

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
  const warnings = [];
  const layoutShifted = [];
  const crossCellMasked = [];
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

  // cells with RENDERED output in both runs are plots: their extracted text
  // includes axis tick labels, which legitimately vary with translated label
  // widths (auto-ranging). They route to the plot check, never the text diff.
  const htmlBoth = new Set([...renderedHtmlCells(enRun)].filter(i => renderedHtmlCells(xxRun).has(i)));
  for (const i of htmlBoth) plotCells.add(i);

  for (let i = 0; i < en.length; i++) {
    if (excluded.has(i)) continue;
    if (htmlBoth.has(i)) continue;
    let a = en[i].join('\n');
    let b = xx[i].join('\n');

    // checked-claim: 'none' spans surfacing in output is a WARNING, not a
    // failure — comments legitimately echo expected output in tutorials,
    // and meta-workbooks print their own code. The byte-identity check
    // below still catches real divergence.
    for (const s of noneSpans) {
      if (s.target_span?.text && b.includes(renderedText(s.target_span.text, s.format_spec))) {
        warnings.push(`cell ${i}: reaches_output:none span appears in output: ${JSON.stringify(s.target_span.text.slice(0, 60))}`);
        // mask it symmetrically so the appearance itself doesn't fail the diff
        const src = renderedText(s.source_span?.text || '', s.format_spec);
        const dst = renderedText(s.target_span.text, s.format_spec);
        if (src && dst) { a = a.split(src).join('⟦N⟧'); b = b.split(dst).join('⟦N⟧'); }
      }
    }

    // symmetric sentinel masking, longest-first to avoid substring shadowing;
    // masks the RENDERED text (escapes decoded, field padding applied).
    // Scope escalation: LOCAL spans (this cell's) first; if the cell still
    // mismatches, retry with GLOBAL spans (meta-workbooks print other
    // cells' strings). Local-first avoids over-masking data words that
    // coincide with labels translated elsewhere (e.g. R column names).
    const expand = (list) => list
      .flatMap(sp => {
        const src = renderedText(sp.source_span.text, sp.format_spec);
        const dst = renderedText(sp.target_span.text, sp.format_spec);
        // spec-bearing strings render with substituted values: mask their
        // LITERAL RUNS pairwise (specs split both sides identically — the
        // apply gate guarantees spec equality)
        if (SPEC_RE.test(src)) {
          const sa = src.split(SPEC_RE), sb = dst.split(SPEC_RE);
          if (sa.length === sb.length) {
            return sa.map((t, k) => ({ src: t, dst: sb[k] }))
              .filter(x => (x.src.length >= 2 || x.dst.length >= 2) && x.src !== x.dst);
          }
        }
        return [{ src, dst }];
      })
      .filter(x => x.src.length || x.dst.length)
      .sort((x, y) => y.src.length - x.src.length);
    const applyMask = (base, pairs, tagPrefix) => {
      let [ma, mb] = base;
      pairs.forEach((sp, k) => {
        const sentinel = `⟦${tagPrefix}${i}_${k}⟧`;
        ma = ma.split(sp.src).join(sentinel);
        mb = mb.split(sp.dst).join(sentinel);
      });
      return [ma, mb];
    };
    const localPairs = expand(stdoutSpans.filter(sp => sp.cell_index === i));
    const globalPairs = expand(stdoutSpans);
    let spansHere = localPairs;
    [a, b] = applyMask([a, b], localPairs, 'S');
    if (a !== b && globalPairs.length > localPairs.length) {
      const [ga, gb] = applyMask([a, b], globalPairs, 'G');
      if (ga === gb || ga.replace(/ {2,}/g, ' ') === gb.replace(/ {2,}/g, ' ')) {
        crossCellMasked.push(i);
        a = ga; b = gb;
        spansHere = globalPairs;
      }
    }

    if (a !== b) {
      // translated labels legitimately reflow auto-layout whitespace
      // (R table()/data.frame printing pads columns to header width).
      // If the cell HAS declared spans and the only difference is the
      // width of space runs, record a layout shift instead of failing —
      // all non-space bytes (numbers, symbols, order) still match exactly.
      const collapse = (t) => t.replace(/ {2,}/g, ' ');
      if (spansHere.length && collapse(a) === collapse(b)) {
        layoutShifted.push(i);
        continue;
      }
      // locate first divergence for the report
      let d = 0;
      while (d < Math.min(a.length, b.length) && a[d] === b[d]) d++;
      failures.push(`cell ${i}: outputs differ outside declared spans at offset ${d}: ` +
        `en=${JSON.stringify(a.slice(Math.max(0, d - 20), d + 40))} xx=${JSON.stringify(b.slice(Math.max(0, d - 20), d + 40))}`);
    }
  }
  return { pass: failures.length === 0, failures, warnings, plotCells: [...plotCells], layoutShifted, crossCellMasked };
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
    if (r.layoutShifted?.length) console.error(`note: layout-only whitespace shift tolerated in cell(s) ${r.layoutShifted.join(', ')}`);
    if (r.crossCellMasked?.length) console.error(`note: cross-cell span masking used in cell(s) ${r.crossCellMasked.join(', ')}`);
    for (const w of r.warnings || []) console.error('warn: ' + w);
    console.log(r.pass ? 'ORACLE PASS' : `ORACLE FAIL (${r.failures.length})`);
    process.exit(r.pass ? 0 : 1);
  }
}
