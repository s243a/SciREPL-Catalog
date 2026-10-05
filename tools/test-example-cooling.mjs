#!/usr/bin/env node
/**
 * Checks the reviewed English artifacts. Executes only the prepared cooling
 * copy in Python/NumPy with stubbed SciREPL callbacks: shared writes go to
 * a temporary directory, plots are captured, and no workbook network runs.
 * This is not a security sandbox for arbitrary workbook code.
 * Run: node tools/test-example-cooling.mjs
 * Translation structural-token manifest: node tools/test-example-cooling.mjs --keep-json
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tokenizeLang } from './span-lib.mjs';

export const TRANSLATION_KEEP = {
  "version": 1,
  "rule": "Translate explanatory prose, comments and user-facing messages only. Preserve executable identifiers, API tokens, parsing patterns, data values, hashes and named-cell references byte-for-byte.",
  "cooling-plume-capture": {
    "cellNames": [
      "intro",
      "simulation",
      "classification",
      "dashboard",
      "dry_cooling",
      "analysis_plots",
      "conclusions"
    ],
    "exactLiterals": [
      ".code",
      "% FACTS-BEGIN",
      "% FACTS-END",
      "FACTS-BEGIN",
      "FACTS-END",
      "/shared/mine_cooling.csv",
      "/shared/mine_cooling_status.pl",
      "/shared/dry_cooling_hourly.csv",
      "/shared/water_energy_summary.csv",
      "hot_dry",
      "hot_humid",
      "wet baseline",
      "mine vapour recovery",
      "air-cooled chiller",
      "warm-water dry cooler"
    ],
    "specialRules": [
      "All KEYS/SUM/R/SCEN/WI_CASES dictionary keys and CSV column names are data/API tokens, even when also displayed as labels.",
      "All Prolog predicate names, atoms and generated case_result/5 source remain unchanged.",
      "Double-quoted format/writeln messages are display prose and must translate; their quote style is not a data-atom convention.",
      "Keep format placeholders (Python f-string fields/specifiers and Prolog ~w/~1f/~n) unchanged."
    ]
  },
  "breakfast-democracy": {
    "cellNames": [
      "intro",
      "fetch_breakfast_votes",
      "profiles_description",
      "pairwise_model",
      "learn_preferences",
      "prolog_description",
      "find_majority_cycle",
      "interpretation",
      "data_citation"
    ],
    "exactLiterals": [
      ".code",
      "/shared/breakfast_source.soc",
      "/shared/breakfast_ballots.csv",
      "/shared/breakfast_foods.csv",
      "id",
      "name",
      "rank_",
      ":- dynamic model/1.",
      "model([",
      "model([]).",
      "food(",
      "beats(",
      "taste_bloc(",
      "rule_winner(",
      "plurality",
      "borda",
      "condorcet",
      "https://raw.githubusercontent.com/PrefLib/PrefLib-Data/6e2e9dcef5ee624383e3e2031f741728dd64d032/datasets/00035%20-%20breakfast/00035-00000004.soc",
      "75c0e89696e16ac7e6bb2a946943f529",
      "7013ed36716e5a2b0c2d7813b0da9cd272cf1bfe90eb66d7d8311485a6a32db0"
    ],
    "specialRules": [
      "Keep all dataset food names/IDs, parsing regexes and vote facts unchanged; quoted Prolog atoms are never translated.",
      "Double-quoted format/writeln messages are display prose and must translate; retain all ~w/~d/~n placeholders.",
      "Keep the generated Prolog source template and the exact two-line split_string parser unchanged.",
      "Keep '\\\\n', '\\\\r', comma separators, quote/backslash escaping and all format placeholders unchanged."
    ]
  }
};

// These exact scanner candidate texts are structural or dataset tokens.
// Used by the mechanical helper, not an unrestricted worker-defined allowlist.
export const TRANSLATION_KEEP_CANDIDATE_TEXTS = {
  "cooling-plume-capture": [
    "hot_dry",
    "hot_humid",
    "tdb",
    "rh",
    "twb",
    "tcold",
    "thot",
    "plume_dp",
    "mine_t",
    "base_mu",
    "mu_after",
    "rec",
    "fan_pen",
    "pump",
    "hp",
    "extra",
    "hp_on",
    "cond_ok",
    "plume_t",
    "plume_w",
    "out_t",
    "out_w",
    "mine_in",
    "qc",
    "evap",
    "condensate",
    "coil_resid_kw",
    "case_result(",
    "/shared/mine_cooling.csv",
    "case",
    "hour",
    "/shared/mine_cooling_status.pl",
    "classification",
    ".code",
    "% FACTS-BEGIN",
    "% FACTS-BEGIN\\n",
    "% FACTS-END",
    "FACTS-BEGIN",
    "FACTS-END",
    "base_ml",
    "after_ml",
    "rec_ml",
    "type",
    "bar",
    "name",
    "marker",
    "color",
    "barmode",
    "group",
    "title",
    "text",
    "yaxis",
    "legend",
    "orientation",
    "solid",
    "dot",
    "scatter",
    "mode",
    "lines",
    "line",
    "dash",
    "width",
    "opacity",
    "xaxis",
    "margin",
    "annotations",
    "xref",
    "paper",
    "yref",
    "showarrow",
    "font",
    "size",
    "US grid 2023 ref (incl. hydro reservoirs)",
    "wet-cooled natural-gas CC",
    "wet-cooled coal",
    "wet-cooled nuclear",
    "utility solar PV",
    "wind (~0)",
    "custom local grid",
    "wet baseline",
    "mine vapour recovery",
    "air-cooled chiller",
    "warm-water dry cooler",
    "w_site",
    "cool",
    "d_fac",
    "fac_mwh",
    "ons_saved",
    "inc_up",
    "net_saved",
    "frac_up",
    "/shared/dry_cooling_hourly.csv",
    "it_kw",
    "wet_cool_kw",
    "mine_cool_kw",
    "chiller_kw",
    "chiller_cop",
    "drycooler_kw",
    "assist_frac",
    "assist_cop",
    "fan_only",
    "/shared/water_energy_summary.csv",
    "scenario",
    "#2ca02c",
    "#ff7f0e",
    "w_up",
    "#9467bd",
    "stack",
    "markers+text",
    "textposition",
    "top center",
    "markers",
    "symbol",
    "gray",
    "range",
    "shapes",
    "height",
    "xanchor",
    "yanchor",
    "left",
    "bottom",
    "top",
    "center",
    "pad",
    "<br>",
    "cliponaxis"
  ],
  "breakfast-democracy": [
    "https://raw.githubusercontent.com/PrefLib/PrefLib-Data/6e2e9dcef5ee624383e3e2031f741728dd64d032/datasets/00035%20-%20breakfast/00035-00000004.soc",
    "/shared/breakfast_source.soc",
    "75c0e89696e16ac7e6bb2a946943f529",
    "UTF-8",
    "^# ALTERNATIVE NAME",
    "^# ALTERNATIVE NAME ([0-9]+):.*",
    "^# ALTERNATIVE NAME [0-9]+: ",
    "^[0-9]+:[[:space:]]*",
    "list",
    "rank_",
    "/shared/breakfast_ballots.csv",
    "/shared/breakfast_foods.csv",
    "Toast pop-up",
    "Buttered toast",
    "English muffin",
    "Jelly donut",
    "Cinnamon toast",
    "Blueberry muffin",
    "Hard rolls",
    "Toast + marmalade",
    "Toast + jelly",
    "Toast + margarine",
    "Cinnamon bun",
    "Danish pastry",
    "Glazed donut",
    "Coffee cake",
    "Corn muffin",
    "rb",
    "7013ed36716e5a2b0c2d7813b0da9cd272cf1bfe90eb66d7d8311485a6a32db0",
    "id",
    "name",
    "food(",
    "beats(",
    "taste_bloc(",
    "rule_winner(plurality,",
    "rule_winner(borda,",
    "rule_winner(condorcet,",
    "pairwise_model",
    ".code",
    ":- dynamic model/1.\\nmodel([",
    ":- dynamic model/1."
  ]
};

if (process.argv.includes('--keep-candidates-json')) {
  console.log(JSON.stringify(TRANSLATION_KEEP_CANDIDATE_TEXTS, null, 2));
  process.exit(0);
}
if (process.argv.includes('--keep-json')) {
  console.log(JSON.stringify(TRANSLATION_KEEP, null, 2));
  process.exit(0);
}
const load = name => JSON.parse(readFileSync(new URL('../workbooks/en/' + name + '.srwb', import.meta.url), 'utf8'));
const cooling = process.argv.includes('--candidate-layout')
  ? JSON.parse(readFileSync(new URL('../reviews/translation-pilot2/source-rebases/final-layout-candidate/en/cooling-plume-capture.srwb', import.meta.url), 'utf8'))
  : load('cooling-plume-capture');
const breakfast = load('breakfast-democracy');
for (const [name, workbook] of [['cooling-plume-capture', cooling], ['breakfast-democracy', breakfast]]) {
  assert.equal(workbook.format, 'srwb');
  assert.equal(workbook.version, '1.0');
  assert.deepEqual(Object.keys(workbook), ['format', 'version', 'notebook']);
  assert.deepEqual(Object.keys(workbook.notebook), ['name', 'cells']);
  const named = workbook.notebook.cells.filter(c => c.name).map(c => c.name);
  assert.equal(new Set(named).size, named.length);
  assert.deepEqual(named, TRANSLATION_KEEP[name].cellNames);
  const state = JSON.stringify(workbook);
  assert.doesNotMatch(state, /"(?:lastOutput|lastOutputHtml|aiTranscript|aiConversations|aiPrompt|uuid|revision)"\s*:/);
  for (const cell of workbook.notebook.cells) {
    assert(['markdown', 'code'].includes(cell.type));
    if (cell.type === 'markdown') assert.equal(cell.language, 'markdown');
    if (cell.type === 'code') assert(['python', 'prolog', 'r'].includes(cell.language));
  }
}
assert.equal(cooling.notebook.cells[0].type, 'markdown');
assert.equal(cooling.notebook.cells.at(-1).type, 'markdown');
assert.doesNotMatch(cooling.notebook.cells.at(-1).code, /dominates on both axes|best net result/);
// Tower makeup includes blowdown; adding it to attributed grid consumption
// defines a mixed accounting metric, not a verified consumption footprint.
const coolingProse = cooling.notebook.cells.filter(c => c.type === 'markdown').map(c => c.code).join('\n');
assert.match(coolingProse, /site tower makeup \(evaporation, drift and blowdown\)/);
assert.match(coolingProse, /Blowdown return flows are not modeled/);
assert.match(coolingProse, /not a consistent water-consumption footprint/);
assert.match(coolingProse, /`WUEsrc` is site tower makeup plus attributed electricity-generation consumption per IT kWh/);
assert.match(coolingProse, /`net_saved` result is the decrease in that defined mixed accounting metric—not verified savings in total consumptive use/);
assert.doesNotMatch(coolingProse, /this workbook intends consumption/);
const coolingComparison = cooling.notebook.cells.find(c => c.name === 'dry_cooling').code;
const coolingAnalysisPlots = cooling.notebook.cells.find(c => c.name === 'analysis_plots').code;
assert(coolingComparison.includes('NET MAKEUP-PLUS-ELECTRICITY WATER-METRIC REDUCTION VS WET BASELINE'));
assert(coolingAnalysisPlots.includes('Annualized site makeup plus attributed electricity water (ML/yr; grid {GRID_WI} L/kWh)'));
assert(coolingAnalysisPlots.includes('Water-accounting reduction (ML/yr)'));
assert(coolingAnalysisPlots.includes('Makeup saving offset (%)'));
assert.doesNotMatch(coolingAnalysisPlots, /Annual operational water consumption|Net source water saved/);
const breakfastCode = breakfast.notebook.cells.map(c => c.code).join('\n');
for (const literal of [TRANSLATION_KEEP['breakfast-democracy'].exactLiterals.at(-3),
                      TRANSLATION_KEEP['breakfast-democracy'].exactLiterals.at(-2),
                      TRANSLATION_KEEP['breakfast-democracy'].exactLiterals.at(-1)]) {
  assert(breakfastCode.includes(literal));
}
assert.equal(breakfast.notebook.cells[3].code, ':- dynamic model/1.\nmodel([]).');
assert(breakfastCode.includes('hashlib.sha256(source_bytes).hexdigest()'));
// SWI-Prolog permits strings as format/writeln message arguments. Only those
// messages changed quote style; named-cell atoms and generated facts are data.
const prologMessages = {
  'cooling-plume-capture': [
    '~w: ~w | water saving ~1f% | extra energy ~1f%~n',
    'Run the simulation cell before this classification cell.',
  ],
  'breakfast-democracy': [
    'Run fetch_breakfast_votes and learn_preferences before this cell.',
    'No strict three-food majority cycle was found.',
    'ROCK-PAPER-SCISSORS, SERVED FOR BREAKFAST~n~n',
    '~w beats ~w by ~d votes~n',
    '~w beats ~w by ~d votes~n',
    '~w beats ~w by ~d votes~n~n',
    '~w winner: ~w~n',
  ],
};
for (const [id, workbook] of [['cooling-plume-capture', cooling], ['breakfast-democracy', breakfast]]) {
  const prologCells = workbook.notebook.cells.filter(c => c.language === 'prolog');
  const messages = prologCells.flatMap(c => [...c.code.matchAll(/\b(?:writeln|format)\(\s*"((?:\\.|[^"\\])*)"/g)].map(m => m[1]));
  assert.deepEqual(messages, prologMessages[id], 'Every Prolog display message must remain a translatable double-quoted string');
  for (const cell of prologCells) assert.doesNotMatch(cell.code, /\b(?:writeln|format)\(\s*'/);
  const scan = spawnSync(process.execPath, [fileURLToPath(new URL('./span-apply.mjs', import.meta.url)),
    'candidates', fileURLToPath(new URL('../workbooks/en/' + id + '.srwb', import.meta.url))], { encoding: 'utf8' });
  assert.equal(scan.status, 0, scan.stderr);
  const candidates = JSON.parse(scan.stdout).candidates;
  for (const message of messages) {
    assert(candidates.some(c => c.kind === 'display_string' && c.text === message), 'Display message missing from translation candidates: ' + message);
    assert(!TRANSLATION_KEEP_CANDIDATE_TEXTS[id].includes(message), 'Display prose must not be protected as a structural token');
  }
}
const breakfastProlog = breakfast.notebook.cells.find(c => c.name === 'find_majority_cycle').code;
const prologCodeOnly = tokenizeLang(breakfastProlog, 'prolog').filter(t => t.kind === 'code').map(t => t.text).join('');
assert(prologCodeOnly.includes("user:nb_read('pairwise_model', '.code', _ModelSource)"));
assert(breakfastProlog.includes('split_string(_ModelSource, "\\n", "\\r", [":- dynamic model/1.", _ModelText])'));
const coolingProlog = cooling.notebook.cells.find(c => c.name === 'classification').code;
for (const marker of ['FACTS-BEGIN', 'FACTS-END']) {
  assert(coolingProlog.includes('% ' + marker));
  assert(TRANSLATION_KEEP_CANDIDATE_TEXTS['cooling-plume-capture'].includes(marker), 'Scanner strips the comment prefix; marker bodies must be explicitly protected');
}
for (const atom of ['no_condensation', 'thermal_limit', 'marginal', 'promising_toy_result', 'report(hot_dry)', 'report(hot_humid)']) {
  assert(tokenizeLang(coolingProlog, 'prolog').some(t => t.kind === 'code' && t.text.includes(atom)));
}
for (const atom of ['food(', 'beats(', 'taste_bloc(', 'rule_winner(plurality,', 'rule_winner(borda,', 'rule_winner(condorcet,']) {
  assert(breakfast.notebook.cells.find(c => c.name === 'learn_preferences').code.includes(atom));
}
const pythonRunner = "\nimport ast, builtins, contextlib, io, json, math, os, pathlib, re, sys, tempfile\nimport numpy as np\n\nworkbook = json.load(sys.stdin)\ncells = {cell[\"name\"]: cell for cell in workbook[\"notebook\"][\"cells\"]}\nfor cell in workbook[\"notebook\"][\"cells\"]:\n    if cell[\"type\"] == \"code\" and cell[\"language\"] == \"python\":\n        ast.parse(cell[\"code\"], filename=cell[\"name\"])\ncharts, notes = [], []\nwith tempfile.TemporaryDirectory(prefix=\"scirepl-example-cooling-\") as directory:\n    def shared_open(filename, mode=\"r\", *args, **kwargs):\n        if not isinstance(filename, str) or not filename.startswith(\"/shared/\"):\n            raise AssertionError(\"Test cell tried to open an unexpected path\")\n        target = pathlib.Path(directory, filename[len(\"/shared/\"):]).resolve()\n        if not target.is_relative_to(pathlib.Path(directory).resolve()):\n            raise AssertionError(\"Shared path escaped the test directory\")\n        target.parent.mkdir(parents=True, exist_ok=True)\n        return builtins.open(target, mode, *args, **kwargs)\n\n    def nb_read(name, prop):\n        assert prop == \".code\" and name in cells\n        return cells[name][\"code\"]\n\n    def nb_write(name, prop, value):\n        assert prop == \".code\" and name == \"classification\"\n        cells[name][\"code\"] = value\n\n    def mplot(traces, **kwargs):\n        charts.append((traces, kwargs))\n\n    scope = {\"open\": shared_open, \"nb_read\": nb_read, \"nb_write\": nb_write, \"mplot\": mplot}\n    capture = io.StringIO()\n    with contextlib.redirect_stdout(capture):\n        for name in [\"simulation\", \"dashboard\", \"dry_cooling\", \"analysis_plots\"]:\n            exec(compile(cells[name][\"code\"], name, \"exec\"), scope)\n    assert len(charts) == 5\n    for traces, _ in charts:\n        for trace in traces:\n            assert np.isfinite(np.asarray(trace[\"y\"], dtype=float)).all()\n\n    for name, d in scope[\"cases\"].items():\n        assert all(np.isfinite(values).all() for values in d.values())\n        assert (d[\"qc\"] >= -1e-8).all()\n        assert (d[\"rec\"] >= -1e-8).all()\n        assert (d[\"rec\"] <= d[\"evap\"] + 1e-8).all()\n        assert (d[\"rec\"] <= d[\"condensate\"] + 1e-8).all()\n        assert (d[\"out_w\"] <= d[\"plume_w\"] + 1e-10).all()\n        assert (d[\"out_t\"] <= d[\"plume_t\"] + 1e-8).all()\n        assert (d[\"out_t\"] >= d[\"mine_in\"] + scope[\"COIL_APP\"] - 1e-8).all()\n        assert np.max(np.abs(d[\"coil_resid_kw\"])) < 1e-7\n        # Independently recompute total heat including the condensed-liquid stream.\n        q_air = scope[\"AIR_PER_MW\"] * scope[\"it_kw\"] / 1000.0\n        independently_removed = (\n            q_air * (scope[\"h_air\"](d[\"plume_t\"], d[\"plume_w\"]) -\n                     scope[\"h_air\"](d[\"out_t\"], d[\"out_w\"]))\n            - d[\"condensate\"] * scope[\"CP_W\"] * d[\"out_t\"]\n        )\n        assert np.allclose(d[\"qc\"], independently_removed, rtol=0, atol=1e-7)\n        expected_delta = ((d[\"qc\"] - scope[\"U_LOSS\"] * (d[\"mine_in\"] - scope[\"T_ROCK\"]))\n                          * scope[\"DT\"] / (scope[\"V_MINE\"] * 1000.0 * scope[\"CP_W\"]))\n        assert np.allclose(d[\"mine_t\"] - d[\"mine_in\"], expected_delta, rtol=0, atol=1e-10)\n        assert np.allclose(d[\"mine_in\"][1:], d[\"mine_t\"][:-1], rtol=0, atol=1e-10)\n        plume_energy = q_air * (\n            scope[\"h_air\"](d[\"plume_t\"], d[\"plume_w\"]) -\n            scope[\"h_air\"](d[\"tdb\"], scope[\"w_of\"](d[\"tdb\"], d[\"rh\"]))\n        )\n        assert np.allclose(plume_energy, scope[\"it_kw\"] + d[\"hp\"], rtol=0, atol=1e-6)\n        s = scope[\"SUM\"][name]\n        assert 0 <= s[\"save\"] <= 100\n        assert math.isclose(s[\"base_ml\"] - s[\"after_ml\"], s[\"rec_ml\"], abs_tol=1e-10)\n        expected_fact = (f\"case_result({name}, {s['save']:.1f}, {s['extra']:.1f}, \"\n                         f\"{s['maxt']:.1f}, {s['condh']}).\")\n        assert expected_fact in cells[\"classification\"][\"code\"]\n\n    # Edge probes: no cold sink, dry air, and zero heat-transfer budget.\n    condenser = scope[\"plume_condenser\"]\n    q, temp, humidity, rec, residual = condenser(25.0, scope[\"w_of\"](25.0, 50.0), 30.0, 500.0)\n    assert q == rec == residual == 0.0 and temp == 25.0\n    q, temp, humidity, rec, residual = condenser(35.0, scope[\"w_of\"](35.0, 5.0), 12.0, 500.0)\n    assert q > 0 and rec == 0\n    old_ua = scope[\"COIL_UA\"]\n    scope[\"COIL_UA\"] = 0.0\n    q, _, _, rec, _ = condenser(35.0, scope[\"w_of\"](35.0, 98.0), 12.0, 500.0)\n    assert abs(q) < 1e-7 and rec == 0\n    scope[\"COIL_UA\"] = old_ua\n\n    baseline = scope[\"R\"][\"wet baseline\"]\n    for name, result in scope[\"R\"].items():\n        assert math.isclose(\n            result[\"wue_src\"],\n            (result[\"w_site\"] + result[\"w_up\"]) * 1e6 / (scope[\"E_IT\"] * scope[\"ANN\"]),\n            abs_tol=1e-10,\n        )\n        if name != \"wet baseline\":\n            assert math.isclose(result[\"net_saved\"], result[\"ons_saved\"] - result[\"inc_up\"], abs_tol=1e-10)\n    notes.append(\"five finite charts; plume/coil/reservoir balances; mass bounds; no-sink/dry/zero-UA probes; source-water units\")\n    print(capture.getvalue().strip())\n    print(\"PASS: \" + \"; \".join(notes))\n";
const coherentLayout = cooling.notebook.cells.find(c => c.name === 'dashboard').code.includes('def _cooling_plot_layout(layout):');
const layoutAssertions = coherentLayout ? [
  'for _, kwargs in charts:',
  '    layout = kwargs["layout"]',
  '    assert layout["height"] == 600',
  '    assert layout["margin"] == {"t": 200, "b": 180, "l": 90, "r": 90}',
  '    assert layout["title"]["y"] == 0.99 and layout["title"]["yanchor"] == "top"',
  '    assert layout["title"]["pad"] == {"t": 30}',
  '    assert layout["legend"] == {"orientation": "v", "x": 0, "y": 1.12, "xanchor": "left", "yanchor": "bottom"}',
  '    assert all(len(line) <= 45 for line in layout["title"]["text"].split("<br>"))',
  'assert charts[1][1]["layout"]["annotations"][0]["y"] == -0.28',
  'assert all(t.get("cliponaxis") is False for t in charts[3][0] if t["mode"] == "markers+text")',
] : [
  'layout = charts[1][1]["layout"]',
  'assert layout["height"] == 480',
  'assert layout["margin"] == {"t": 140, "b": 110}',
  'assert layout["legend"] == {"orientation": "v", "x": 0, "y": 1.02, "xanchor": "left", "yanchor": "bottom"}',
  'assert layout["annotations"][0]["y"] == -0.32 and layout["annotations"][0]["yanchor"] == "top"',
];
const checkedPythonRunner = pythonRunner.replace('assert len(charts) == 5', ['assert len(charts) == 5', ...layoutAssertions].join('\n    '));
const result = spawnSync(process.env.SCIREPL_EXAMPLE_PYTHON || 'python3', ['-E', '-c', checkedPythonRunner], {
  input: JSON.stringify(cooling),
  encoding: 'utf8',
  timeout: 30_000,
  maxBuffer: 2_000_000,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
assert.equal(result.status, 0, 'Corrected cooling model invariant checks failed');
console.log('PASS: sanitized workbook shapes and reproducible Breakfast source pin');
