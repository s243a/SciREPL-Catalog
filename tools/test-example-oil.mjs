#!/usr/bin/env node
/**
 * Offline checks of the deterministic, reviewed English oil teaching copy.
 * Executes that copy only, with mplot captured; never runs the original export.
 * No downloads, package installation, AI calls or workbook filesystem writes.
 * This is not a security sandbox for arbitrary notebook source.
 * Run with Node 22 and Python 3/NumPy (PYTHON selects the executable).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createOilWorkbook, oilWorkbookBytes, ORIGINAL_SHA256, OIL_LESSON } from './prepare-oil-shocks.mjs';

// Structural/data literals, not display labels. Keep these when translating.
export const OIL_TRANSLATION_KEEP = [
  'equal_eta', 'flexible_china', 'baseline_shift', 'reserve_flow',
  'key', 'label', 'a_china', 'eta_china', 'reserve',
  'x', 'y', 'mode', 'lines', 'markers', 'name', 'line', 'dash', 'marker',
  'size', 'height', 'margin', 't', 'b', 'l', 'r', 'xaxis', 'yaxis',
  'automargin', 'legend', 'orientation', 'h', 'font', '<br>',
];

// Reusable data/numerical gate after running the reviewed workbook in a
// browser Pyodide kernel. The caller supplies captured mplot payloads in
// _oil_plot_payloads. This proves data, not raster glyph/layout quality.
export const OIL_NUMERICAL_INVARIANTS = String.raw`
assert len(_oil_plot_payloads) == 3
_oil_curves, _oil_scenarios, _oil_option = _oil_plot_payloads

# Anchors and dimensionless percentage elasticities, independently differenced.
assert P0 == 70.0 and Q0 == 100.0 and ETA == 0.20
assert A_CHINA == 15.0 and A_REST == 85.0
assert ETA_REST == 0.20 and GAMMA == 0.10
assert constant_demand(P0) == linear_demand(P0) == Q0
_oil_h = 1e-5
def _oil_local_elasticity(fn, p):
    return (fn(p*(1+_oil_h))-fn(p*(1-_oil_h)))/(2*_oil_h*fn(p))
assert abs(_oil_local_elasticity(constant_demand, P0) + ETA) < 1e-8
assert abs(_oil_local_elasticity(linear_demand, P0) + ETA) < 1e-8
assert abs(_oil_local_elasticity(constant_demand, 2*P0) + ETA) < 1e-8
assert abs(_oil_local_elasticity(linear_demand, 2*P0) + 0.50) < 1e-8
assert abs(constant_demand(3*P0) - linear_demand(3*P0)) > 10.0
assert linear_demand(P0*(1+1/ETA)) == 0
assert np.all(np.isfinite(q_constant)) and np.all(q_constant > 0)
assert np.all(np.isfinite(q_linear)) and np.all(q_linear > 0)
assert np.all(np.diff(q_constant) < 0) and np.all(np.diff(q_linear) < 0)
assert len(_oil_curves["traces"]) == 3
assert np.array_equal(np.asarray(_oil_curves["traces"][0]["x"]), prices)
assert np.array_equal(np.asarray(_oil_curves["traces"][0]["y"]), Q0*(prices/P0)**(-ETA))
assert np.array_equal(np.asarray(_oil_curves["traces"][1]["y"]), Q0*(1-ETA*(prices/P0-1)))
assert _oil_curves["traces"][2]["x"] == [P0]
assert _oil_curves["traces"][2]["y"] == [Q0]

# Fixed curves: demand decreases, available supply increases, root is unique.
assert abs(equilibrium(0.0)[0]-P0) < 1e-10
assert abs(equilibrium(0.0)[1]-Q0) < 1e-10
assert abs(equilibrium(4.0, 4.0)[0]-P0) < 1e-10
for _oil_scenario in SCENARIOS:
    _oil_qgrid = regional_demand(prices, _oil_scenario["a_china"], _oil_scenario["eta_china"])
    _oil_sgrid = available_supply(prices, 4.0, _oil_scenario["reserve"])
    assert np.all(np.isfinite(_oil_qgrid)) and np.all(_oil_qgrid > 0)
    assert np.all(np.isfinite(_oil_sgrid)) and np.all(_oil_sgrid > 0)
    assert np.all(np.diff(_oil_qgrid) < 0) and np.all(np.diff(_oil_sgrid) > 0)
    _oil_roots = scenario_results[_oil_scenario["key"]]
    assert all(np.isfinite(v) for _oil_root in _oil_roots for v in _oil_root)
    assert all(p > 0 and q > 0 and abs(resid) < 1e-10 for p,q,resid in _oil_roots)
    assert np.all(np.diff([root[0] for root in _oil_roots]) > 0)
    for _oil_d, (_oil_p, _oil_q, _oil_resid) in zip(disruptions, _oil_roots):
        # Independently reconstruct both sides, not just trust returned residual.
        _oil_expected_q = (_oil_scenario["a_china"]*(_oil_p/P0)**(-_oil_scenario["eta_china"])
                           +85.0*(_oil_p/P0)**(-0.20))
        _oil_expected_s = 100.0*(_oil_p/P0)**0.10-_oil_d+_oil_scenario["reserve"]
        assert abs(_oil_q-_oil_expected_q) < 1e-10
        assert abs(_oil_expected_q-_oil_expected_s) < 1e-10

# One-at-a-time comparative statics, including the elasticity pivot caveat.
_oil_equal = np.array([r[0] for r in scenario_results["equal_eta"]])
_oil_flexible = np.array([r[0] for r in scenario_results["flexible_china"]])
_oil_shift = np.array([r[0] for r in scenario_results["baseline_shift"]])
_oil_reserve = np.array([r[0] for r in scenario_results["reserve_flow"]])
assert abs(_oil_equal[0]-_oil_flexible[0]) < 1e-10
assert np.all(_oil_flexible[1:] < _oil_equal[1:])
assert np.all(_oil_shift < _oil_equal) and np.all(_oil_reserve < _oil_equal)
assert regional_demand(0.8*P0,15.0,0.50) > regional_demand(0.8*P0,15.0,0.20)
assert regional_demand(1.2*P0,15.0,0.50) < regional_demand(1.2*P0,15.0,0.20)
assert equilibrium(4.0,1.0)[0] < equilibrium(4.0)[0]
assert equilibrium(4.0,a_china=14.0)[0] < equilibrium(4.0)[0]

# Independent closed forms with equal demand elasticities.
for _oil_a in (14.0, 15.0, 16.0):
    _oil_expected_p = 70.0*((_oil_a+85.0)/100.0)**(1/(0.20+0.10))
    assert abs(equilibrium(0.0,a_china=_oil_a)[0]-_oil_expected_p) < 1e-9
    for _oil_d,_oil_r in ((0.0,0.0),(4.0,0.0),(4.0,1.0),(4.0,4.0)):
        _oil_available = 100.0-_oil_d+_oil_r
        _oil_expected_p = 70.0*((_oil_a+85.0)/_oil_available)**(1/0.20)
        _oil_p,_oil_q,_oil_resid = equilibrium(_oil_d,_oil_r,a_china=_oil_a,gamma=0.0)
        assert abs(_oil_p-_oil_expected_p) < 1e-9
        assert abs(_oil_q-_oil_available) < 1e-10

for _oil_invalid in ((-1.0,0.0,15.0,0.20,0.10),(0.0,-1.0,15.0,0.20,0.10),
                     (0.0,0.0,0.0,0.20,0.10),(0.0,0.0,15.0,0.0,0.10),
                     (0.0,0.0,15.0,0.20,-0.10),(1000.0,0.0,15.0,0.20,0.10),
                     (float("nan"),0.0,15.0,0.20,0.10)):
    try:
        equilibrium(*_oil_invalid)
    except ValueError:
        pass
    else:
        raise AssertionError("Invalid/unbracketed scenario accepted")

assert len(_oil_scenarios["traces"]) == 4
for _oil_trace,_oil_scenario in zip(_oil_scenarios["traces"],SCENARIOS):
    assert np.array_equal(np.asarray(_oil_trace["x"]),np.linspace(0.0,6.0,31))
    assert np.array_equal(np.asarray(_oil_trace["y"]),
                          np.array([r[0] for r in scenario_results[_oil_scenario["key"]]]))

# Preserve the original Black-Scholes inputs, full variance grid and prices.
assert (S,K,r,T) == (100.0,100.0,0.05,1.0)
assert np.array_equal(variance,np.linspace(0.0001,0.25,150))
assert np.array_equal(volatility,np.sqrt(variance))
assert np.all(np.isfinite(call_price)) and np.all(np.diff(call_price) > 0)
assert np.all(call_price >= max(0,S-K*np.exp(-r*T))) and np.all(call_price <= S)
assert abs(black_scholes_call(0.20)-10.450583572185565) < 1e-10
assert abs(black_scholes_call(0.50)-21.79260421286685) < 1e-10
assert len(_oil_option["traces"]) == 1
assert np.array_equal(np.asarray(_oil_option["traces"][0]["x"]),variance)
assert np.array_equal(np.asarray(_oil_option["traces"][0]["y"]),call_price)
print("PASS: demand anchors/elasticities, equilibrium roots/closed forms, comparative statics and original call variance data")
`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const artifact = readFileSync(path.join(ROOT, 'workbooks/en', OIL_LESSON + '.srwb'), 'utf8');
  assert.equal(artifact, oilWorkbookBytes(), 'Prepared English copy differs from the reviewed producer');
  const book = JSON.parse(artifact);
  assert.deepEqual(book, createOilWorkbook());
  assert.deepEqual(Object.keys(book).sort(), ['format','notebook','version']);
  assert.deepEqual(Object.keys(book.notebook).sort(), ['cells','name']);
  assert.equal(book.notebook.cells.length,12);
  const names = new Set();
  for (const cell of book.notebook.cells) {
    assert.deepEqual(Object.keys(cell).sort(), ['code','language','name','type']);
    assert.match(cell.name,/^[a-z][a-z0-9-]*$/);
    assert(!names.has(cell.name)); names.add(cell.name);
    assert.equal(cell.language, cell.type === 'markdown' ? 'markdown' : 'python');
    assert(!cell.code.includes('\uFFFD'));
  }
  const code = book.notebook.cells.filter(c=>c.type === 'code');
  const prose = book.notebook.cells.filter(c=>c.type === 'markdown').map(c=>c.code).join('\n');
  assert.equal(code.length,4);
  assert.match(prose,/not an oil-price forecast/);
  assert.match(prose,/not a measured year-on-year decline/);
  assert.match(prose,/not estimates or measured shares/);
  assert.match(prose,/same avoided oil twice/);
  assert.match(prose,/positive-quantity domain/);
  assert.match(prose,/dollars per barrel per percentage point/);
  assert.match(prose,/peace deal/);
  assert(prose.includes(ORIGINAL_SHA256));
  assert.doesNotMatch(artifact,/lastOutput|exported_at|"id"\s*:|"description"\s*:|\/home\/|\/mnt\//);
  const joinedCode = code.map(c=>c.code).join('\n');
  assert.equal((joinedCode.match(/mplot\(/g)||[]).length,3);
  assert.doesNotMatch(joinedCode,/matplotlib|micropip|import js|renderPlot|requests|fetch\(|nb_write|open\(/);
  console.log('PASS: deterministic prompt-free source, named cells, explicit assumptions and app-native plotting');

  const script = String.raw`
import ast, json, sys
cells = json.load(sys.stdin)
allowed = {"numpy", "math", "textwrap"}
for cell in cells:
    tree = ast.parse(cell["code"],filename=cell["name"])
    compile(tree,cell["name"],"exec")
    for node in ast.walk(tree):
        if isinstance(node,ast.Import):
            assert all(a.name in allowed for a in node.names)
        elif isinstance(node,ast.ImportFrom):
            assert node.module in allowed
        elif isinstance(node,ast.Call) and isinstance(node.func,ast.Name):
            assert node.func.id not in {"open","exec","eval","__import__","input","compile"}
_oil_plot_payloads = []
def mplot(traces, title=None, xlabel=None, ylabel=None, layout=None):
    resolved = dict(layout or {})
    if title is not None: resolved["title"] = title
    if xlabel is not None: resolved.setdefault("xaxis",{})["title"] = xlabel
    if ylabel is not None: resolved.setdefault("yaxis",{})["title"] = ylabel
    _oil_plot_payloads.append({"traces":traces,"layout":resolved})
for cell in cells:
    exec(compile(cell["code"],cell["name"],"exec"),globals())
` + OIL_NUMERICAL_INVARIANTS;
  const result = spawnSync(process.env.PYTHON || 'python3', ['-c',script], {
    cwd:ROOT,input:JSON.stringify(code),encoding:'utf8',maxBuffer:4*1024*1024,
  });
  assert.equal(result.status,0,String(result.error||'')+result.stderr+result.stdout);
  console.log(result.stdout.trim());
  console.log('Oil focused offline checks passed. Browser execution and rendered chart review remain separate gates.');
}
