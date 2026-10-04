#!/usr/bin/env node
/**
 * Static regression checks for the two risk-measure teaching workbooks.
 * Reads SRWB data and compiles Python syntax without executing notebook cells.
 * Independent arithmetic checks do not replace SciREPL/Pyodide plot tests.
 * Exports PATIENTS_PLOT_INVARIANTS for the controller's browser data-only check.
 * Run: node tools/test-example-risk.mjs
 * Requires Python 3 for syntax checks (PYTHON can select its executable).
 * No downloads, package installs, filesystem writes, or AI calls.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run only in the reviewed browser Pyodide kernel after the four Patients
// cells. The controller supplies _risk_plot_payloads as the two captured
// mplot payloads: [{traces: [...], layout: {...}}, ...]. This asserts data,
// not pixel/font quality, and makes no downloads or filesystem writes.
export const PATIENTS_PLOT_INVARIANTS = String.raw`
assert len(_risk_plot_payloads) == 2
_risk_histogram, _risk_baseline = _risk_plot_payloads

# Independently reproduce the original simulation formulas and RNG calls.
_risk_check_rng = np.random.default_rng(7)
_risk_original_arrs = []
for _risk_i in range(N_SIMS):
    _risk_c = _risk_check_rng.binomial(N, P_C) / N
    _risk_t = _risk_check_rng.binomial(N, P_T) / N
    _risk_original_arrs.append(_risk_c - _risk_t)
_risk_expected_counts, _risk_expected_edges = np.histogram(
    np.array(_risk_original_arrs), bins=40
)
assert np.array_equal(arrs, np.array(_risk_original_arrs))
assert np.array_equal(hist_counts, _risk_expected_counts)
assert np.array_equal(hist_edges, _risk_expected_edges)
assert len(_risk_histogram["traces"]) == 1
_risk_bar = _risk_histogram["traces"][0]
assert _risk_bar["type"] == "bar"
assert np.array_equal(np.asarray(_risk_bar["y"]), _risk_expected_counts)
assert np.array_equal(np.asarray(_risk_bar["x"]),
                      (_risk_expected_edges[:-1] + _risk_expected_edges[1:]) / 2)
assert np.array_equal(np.asarray(_risk_bar["width"]), np.diff(_risk_expected_edges))
_risk_hist_shapes = _risk_histogram["layout"]["shapes"]
assert len(_risk_hist_shapes) == 3
assert _risk_hist_shapes[0]["x0"] == _risk_hist_shapes[0]["x1"] == P_C - P_T
assert _risk_hist_shapes[1]["x0"] == _risk_hist_shapes[1]["x1"] == 0
assert (_risk_hist_shapes[2]["x0"], _risk_hist_shapes[2]["x1"]) == ci

# Compare both y-axis trace arrays with the original constant-RR formulas.
_risk_expected_baselines = np.array([0.02, 0.05, 0.12, 0.20, 0.30])
_risk_expected_arrs = _risk_expected_baselines * (1 - P_T / P_C)
_risk_expected_nnts = 1 / _risk_expected_arrs
assert len(_risk_baseline["traces"]) == 2
_risk_arr_trace, _risk_nnt_trace = _risk_baseline["traces"]
assert np.array_equal(np.asarray(_risk_arr_trace["x"]), _risk_expected_baselines)
assert np.array_equal(np.asarray(_risk_nnt_trace["x"]), _risk_expected_baselines)
assert np.array_equal(np.asarray(_risk_arr_trace["y"]), _risk_expected_arrs)
assert np.array_equal(np.asarray(_risk_nnt_trace["y"]), _risk_expected_nnts)
assert _risk_arr_trace.get("yaxis", "y") == "y"
assert _risk_nnt_trace["yaxis"] == "y2"
assert _risk_baseline["layout"]["yaxis2"]["overlaying"] == "y"
assert _risk_baseline["layout"]["yaxis2"]["side"] == "right"
_risk_mcid_shape = _risk_baseline["layout"]["shapes"][0]
assert _risk_mcid_shape["y0"] == _risk_mcid_shape["y1"] == MCID
print("PASS: exact original histogram counts/edges and both y-axis trace arrays")
`;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workbooks = ['select-risk-measures', 'patients-to-evidence'].map(file => ({
  file,
  workbook: JSON.parse(readFileSync(path.join(ROOT, 'workbooks/en', file + '.srwb'), 'utf8')),
}));
let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log('[PASS] ' + name);
}
function byName(workbook, name) {
  const cell = workbook.notebook.cells.find(c => c.name === name);
  assert.ok(cell, 'missing cell: ' + name);
  return cell.code;
}
for (const { file, workbook } of workbooks) {
  check(file + ': canonical structure without export/private metadata', () => {
    assert.deepEqual(Object.keys(workbook).sort(), ['format', 'notebook', 'version']);
    assert.equal(workbook.format, 'srwb');
    assert.equal(workbook.version, '1.0');
    assert.deepEqual(Object.keys(workbook.notebook).sort(), ['cells', 'name']);
    const names = new Set();
    for (const cell of workbook.notebook.cells) {
      assert.deepEqual(Object.keys(cell).sort(), ['code', 'language', 'name', 'type']);
      assert.ok(['code', 'markdown'].includes(cell.type));
      assert.equal(cell.language, cell.type === 'markdown' ? 'markdown' : 'python');
      assert.equal(typeof cell.code, 'string');
      assert.ok(cell.code.length > 0);
      assert.match(cell.name, /^[a-z][a-z0-9-]*$/);
      assert.ok(!names.has(cell.name), 'duplicate cell name: ' + cell.name);
      names.add(cell.name);
    }
    const title = byName(workbook, 'title-goals');
    assert.match(title, /synthetic/i);
    assert.match(title, /not medical advice/i);
    assert.match(title, /run order/i);
  });
}
const select = workbooks[0].workbook;
const patients = workbooks[1].workbook;
check('cell inventories are preserved', () => {
  assert.equal(select.notebook.cells.length, 8);
  assert.equal(select.notebook.cells.filter(c => c.type === 'code').length, 3);
  assert.equal(patients.notebook.cells.length, 13);
  assert.equal(patients.notebook.cells.filter(c => c.type === 'code').length, 4);
});
check('SELECT discloses variable follow-up, crude NNT, and primary sources', () => {
  const prose = select.notebook.cells.filter(c => c.type === 'markdown').map(c => c.code).join('\n');
  assert.match(prose, /39\.8 months/);
  assert.match(prose, /not censoring-adjusted/i);
  assert.match(prose, /not a published or fixed-horizon/i);
  assert.match(prose, /https:\/\/www\.nejm\.org\/doi\/abs\/10\.1056\/NEJMoa2307563/);
  assert.doesNotMatch(prose, /coincidence of rounding/);
});
check('SELECT uses a local seed to shuffle fictional rows', () => {
  const code = byName(select, 'synthetic-data');
  assert.match(code, /rng = random\.Random\(42\)/);
  assert.doesNotMatch(code, /random\.seed\(/);
  assert.equal((code.match(/rng\.shuffle\(/g) || []).length, 3);
});
check('Patients uses app-provided mplot without extra package installation', () => {
  const title = byName(patients, 'title-goals');
  assert.match(title, /mplot.*app-provided/);
  assert.match(title, /no Matplotlib or `micropip` package installation/);
  assert.match(title, /no workbook-initiated downloads or uploads/);
  const code = patients.notebook.cells.filter(c => c.type === 'code').map(c => c.code).join('\n');
  assert.doesNotMatch(code, /matplotlib|micropip|plt\.|await /);
  assert.equal((code.match(/mplot\(/g) || []).length, 2);
});
check('Patients Plotly charts preserve original histogram and axis formulas', () => {
  const coverage = byName(patients, 'coverage-simulation');
  assert.match(coverage, /hist_counts, hist_edges = np\.histogram\(arrs, bins=40\)/);
  assert.match(coverage, /hist_centers = \(hist_edges\[:-1\] \+ hist_edges\[1:\]\) \/ 2/);
  assert.match(coverage, /"y": hist_counts/);
  assert.match(coverage, /"width": hist_widths\.tolist\(\)/);
  assert.match(coverage, /r = np\.random\.default_rng\(7\)/);
  assert.match(coverage, /c = r\.binomial\(N, P_C\) \/ N/);
  assert.match(coverage, /t = r\.binomial\(N, P_T\) \/ N/);
  const baseline = byName(patients, 'baseline-risk-plot');
  assert.match(baseline, /rr_known = P_T \/ P_C/);
  assert.match(baseline, /arrs_b = baselines \* \(1 - rr_known\)/);
  assert.match(baseline, /nnts_b = 1 \/ arrs_b/);
  assert.match(baseline, /"x": baselines, "y": arrs_b/);
  assert.match(baseline, /"x": baselines, "y": nnts_b.*"yaxis": "y2"/);
  assert.match(baseline, /"overlaying": "y", "side": "right"/);
  assert.match(baseline, /"legend": \{"orientation": "v", "x": 0\.98, "y": 0\.98/);
  assert.match(baseline, /"xanchor": "right", "yanchor": "top"/);
  assert.match(baseline, /"margin": \{"t": 45, "r": 90, "b": 85, "l": 65\}/);
  assert.doesNotMatch(baseline, /"legend": \{"orientation": "h"/);
});
check('Patients has approximate coverage wording and ordered exercise reruns', () => {
  assert.match(byName(patients, 'sampling-variation-explanation'), /approximate Wald procedure/);
  const simulation = byName(patients, 'coverage-simulation');
  assert.doesNotMatch(simulation, /frequentist guarantee/);
  assert.match(simulation, /Estimated coverage/);
  assert.match(simulation, /"name": f"true ARR = \{TRUE_ARR:\.3f\}"/);
  assert.match(byName(patients, 'reader-exercise'), /Rerun \x60one-trial-simulation\x60 first/);
  assert.match(byName(patients, 'limitations'), /12-month hospitalization outcome/);
  assert.doesNotMatch(byName(patients, 'limitations'), /assumes constant absolute benefit/);
});
check('Patients interpretation branches on CI flags and guards zero SE', () => {
  const code = byName(patients, 'compatibility-analysis');
  assert.match(code, /if not np\.isfinite\(se\) or se <= 0:/);
  assert.match(code, /if includes_zero:/);
  assert.match(code, /if above_mcid:/);
  assert.match(code, /elif hi < MCID:/);
  assert.match(code, /erfc\(abs\(z_stat\) \/ sqrt\(2\)\)/);
  assert.match(code, /\{p_two:\.3g\}/);
  assert.doesNotMatch(code, /p_two:\.4f|the data are NOT very compatible with zero/);
});
check('Patients separates unrounded NNT, rounded NNT, and NNH', () => {
  const code = byName(patients, 'one-trial-simulation');
  assert.match(code, /NNT for benefit \(unrounded\)/);
  assert.match(code, /ceil\(nnt\)/);
  assert.match(code, /elif arr < 0:/);
  assert.match(code, /nnh = 1 \/ \(-arr\)/);
  assert.match(code, /if np\.isfinite\(nnt\):/);
  assert.doesNotMatch(code, /\{[^\n]*'no finite NNT/);
  assert.match(byName(patients, 'coverage-simulation'), /if lo <= TRUE_ARR <= hi:/);
  assert.doesNotMatch(byName(patients, 'coverage-simulation'), /\{'DOES' if/);
});
check('published SELECT count arithmetic gives RR≈0.8115 and crude NNT=67', () => {
  const code = byName(select, 'synthetic-data');
  const n = code.match(/n_sema, n_placebo = (\d+), (\d+)/);
  const e = code.match(/e_sema, e_placebo = (\d+), (\d+)/);
  assert.ok(n && e);
  const n1 = Number(n[1]), n0 = Number(n[2]), e1 = Number(e[1]), e0 = Number(e[2]);
  assert.deepEqual([n1, n0, e1, e0], [8803, 8801, 569, 701]);
  const arr = e0 / n0 - e1 / n1;
  const rr = (e1 / n1) / (e0 / n0);
  const se = Math.sqrt(1 / e1 - 1 / n1 + 1 / e0 - 1 / n0);
  assert.ok(Math.abs(rr - 0.8115) < 0.00005);
  assert.ok(Math.abs(arr * 100 - 1.501) < 0.001);
  assert.equal(Math.ceil(1 / arr), 67);
  assert.ok(Math.abs(Math.exp(Math.log(rr) - 1.96 * se) - 0.7295) < 0.00005);
  assert.ok(Math.abs(Math.exp(Math.log(rr) + 1.96 * se) - 0.9028) < 0.00005);
});
check('fictional generating probabilities imply ARR=0.04, RR=2/3, NNT=25', () => {
  const arr = 0.12 - 0.08;
  assert.ok(Math.abs(arr - 0.04) < 1e-12);
  assert.ok(Math.abs(0.08 / 0.12 - 2 / 3) < 1e-12);
  assert.ok(Math.abs(1 / arr - 25) < 1e-12);
});
const pythonCheck = [
  'import ast, json, sys',
  'workbooks = json.load(sys.stdin)',
  'allowed = {"random", "math", "numpy"}',
  'for wb in workbooks:',
  '    for cell in wb["cells"]:',
  '        filename = wb["file"] + "/" + cell["name"]',
  '        tree = ast.parse(cell["code"], filename=filename)',
  '        compile(tree, filename, "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT, dont_inherit=True)',
  '        for node in ast.walk(tree):',
  '            if isinstance(node, ast.Import):',
  '                assert all(a.name in allowed for a in node.names), filename',
  '            elif isinstance(node, ast.ImportFrom):',
  '                assert node.module in allowed, filename',
  '            elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):',
  '                assert node.func.id not in {"exec", "eval", "__import__", "open", "input"}, filename',
  'print("Python syntax compiled without executing cells; imports match the reviewed allowlist.")',
].join('\n');
check('all Python cells compile without execution and use reviewed imports', () => {
  const payload = workbooks.map(({ file, workbook }) => ({
    file, cells: workbook.notebook.cells.filter(c => c.type === 'code'),
  }));
  payload.push({ file: 'browser-data-invariants', cells: [{
    name: 'patients-plot-data', code: PATIENTS_PLOT_INVARIANTS,
  }] });
  const output = execFileSync(process.env.PYTHON || 'python3', ['-I', '-B', '-c', pythonCheck], {
    input: JSON.stringify(payload), encoding: 'utf8', cwd: ROOT, timeout: 10000,
  });
  assert.match(output, /without executing cells/);
});
console.log('\n' + checks + ' static checks passed. Browser/Pyodide execution and plot checks remain separate.');
