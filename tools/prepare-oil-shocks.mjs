#!/usr/bin/env node
// Deterministic, reviewed English adaptation. The original export is read only
// to validate its hash, never executed or copied with saved output/metadata.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ORIGINAL_SHA256 = '69541aba9650a357eb109f1a1087130d9357f2d0262ad5e03c278e35ba695b4d';
export const OIL_LESSON = 'oil-shocks-demand';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const markdown = (name, code) => ({ code: code.trim().replaceAll('\\`', '`') + '\n', type: 'markdown', language: 'markdown', name });
const python = (name, code) => ({ code: code.trim() + '\n', type: 'code', language: 'python', name });

export function createOilWorkbook() {
  return { format: 'srwb', version: '1.0', notebook: {
    name: 'Oil Shocks: Demand Curves, Substitution and Scenarios',
    cells: [
      markdown('title-goals', String.raw`
# Oil Shocks: Demand Curves, Substitution and Scenarios

This is an offline, illustrative economics lesson, not an oil-price forecast or investment advice. Every model quantity, regional allocation, elasticity and supply parameter below is assumed for teaching; none is a measured estimate for China or the rest of the world.

Learn to distinguish a local price elasticity from a whole demand curve, a price response from a demand shift, and a market scenario from causal evidence. The final section preserves the original workbook's separate European-call variance demonstration; it does not price an oil derivative.

Run order: execute Python cells from top to bottom. NumPy and \`mplot\` are app-provided; no Matplotlib or \`micropip\` package installation is needed. There are no workbook-initiated downloads, uploads or file writes.
`),
      markdown('original-model-diagnostic', String.raw`
## What the original oil model did

The supplied export's oil explanation and code were cells 5 and 6 (one-based; both unnamed). It imposed monthly \`demand_growth\`, restored supply and strategic-reserve releases, then updated price with a shock-response coefficient, a pull toward an assumed anchor and an additive risk term. Demand did not respond to the resulting price. There was no China-specific, EV, transit, bicycle or renewable-power variable.

The array named \`elasticities\` divided an inflation-adjusted dollar price jump by a percentage-point supply disruption. Its median \`beta\` had units of dollars per barrel per percentage point, not dimensionless demand elasticity. CPI adjustment does not separate price changes caused by supply, demand, inventories or expectations. A few historical price movements cannot establish those causes or identify a demand curve.

This edition removes the three MCP smoke-test cells, saved outputs and export metadata. It replaces the unsourced dated price series and four-month projection with explicit equilibrium sensitivity exercises. The original file is unchanged.
`),
      markdown('elasticity-context', String.raw`
## A local slope does not determine the whole curve

Price elasticity is $\varepsilon(P) = \frac{dQ}{dP}\frac{P}{Q}$: a dimensionless percentage response. Use the positive magnitude \`η = -ε\` for downward-sloping demand.

Both curves below pass through \`P0 = 70\`, \`Q0 = 100\` and have \`ε(P0) = -0.20\`:

$$
Q_{CE}(P)=Q_0(P/P_0)^{-\eta},\qquad
Q_L(P)=Q_0[1-\eta(P/P_0-1)].
$$

Constant elasticity is a curve-shape assumption: ε stays fixed everywhere. The linear curve has the same tangent at the anchor, but its elasticity changes away from that point. Its positive-quantity domain is \`0 < P < P0*(1 + 1/eta)\`; it must not be extrapolated beyond that boundary. Neither functional form is identified by one local elasticity observation.
`),
      python('curve-comparison', String.raw`
import numpy as np
import textwrap

def oil_wrap(text, width=42):
    return "<br>".join(textwrap.wrap(str(text), width=width,
                                   break_long_words=False, break_on_hyphens=False))

P0, Q0, ETA = 70.0, 100.0, 0.20
prices = np.linspace(0.4 * P0, 3.0 * P0, 160)

def constant_demand(p):
    return Q0 * (np.asarray(p) / P0) ** (-ETA)

def linear_demand(p):
    return Q0 * (1.0 - ETA * (np.asarray(p) / P0 - 1.0))

q_constant = constant_demand(prices)
q_linear = linear_demand(prices)
assert np.all(prices > 0) and np.all(q_linear > 0)
assert constant_demand(P0) == linear_demand(P0) == Q0

mplot([
    {"x": prices, "y": q_constant, "mode": "lines",
     "name": oil_wrap("Constant elasticity")},
    {"x": prices, "y": q_linear, "mode": "lines", "line": {"dash": "dash"},
     "name": oil_wrap("Linear demand: same local elasticity")},
    {"x": [P0], "y": [Q0], "mode": "markers", "marker": {"size": 10},
     "name": oil_wrap("Shared anchor")},
], title=oil_wrap("One anchor and local elasticity, different whole curves"),
   xlabel=oil_wrap("Illustrative price (USD per barrel)"),
   ylabel=oil_wrap("Illustrative quantity (million barrels per day)", 27),
   layout={"height": 540, "margin": {"t": 105, "b": 110, "l": 110, "r": 35},
           "xaxis": {"automargin": True}, "yaxis": {"automargin": True},
           "legend": {"orientation": "h", "y": -0.24, "font": {"size": 10}}})
print(f"Shared local elasticity at the anchor: {-ETA:.2f}")
print(f"At three times the anchor price: constant {constant_demand(3*P0):.2f}, linear {linear_demand(3*P0):.2f}.")
`),
      markdown('regional-model-context', String.raw`
## Regional demand: price flexibility versus a baseline shift

For two illustrative regions, use \`Q_i(P) = A_i*(P/P0)**(-eta_i)\`. At \`P0\`, \`A_i\` is baseline demand. The arbitrary allocation is \`A_China = 15\` and \`A_rest = 85\` million barrels per day; these are not estimates or measured shares. The magnitudes \`eta_China = 0.20\` or \`0.50\` and \`eta_rest = 0.20\` are sensitivity assumptions, not evidence that China is more price-elastic.

Higher assumed elasticity represents a stronger response along a fixed curve. An EV fleet, efficiency improvement or durable modal shift can instead lower \`A_China\` at every price, even when elasticity stays unchanged. Price-driven switching can also affect short-run responsiveness; estimating that requires data and a specified time horizon. Transit and bicycle access are possible mechanisms, not measured controls here.

Supply is \`S(P) = Q0*(P/P0)**GAMMA - disruption + reserve\`, with assumed \`GAMMA = 0.10\`. Disruption and reserve are contemporaneous flows in million barrels per day, not stock volumes. Find the price where total regional demand equals available supply using bracketed bisection. There is no time forecast, risk-premium dynamics or inventory constraint in this toy equilibrium.
`),
      python('regional-model', String.raw`
# All numerical settings are illustrative sensitivity assumptions.
A_CHINA, A_REST = 15.0, 85.0
ETA_REST, GAMMA = 0.20, 0.10

def regional_demand(p, a_china, eta_china):
    return (a_china * (p / P0) ** (-eta_china)
            + A_REST * (p / P0) ** (-ETA_REST))

def available_supply(p, disruption, reserve, gamma=GAMMA):
    return Q0 * (p / P0) ** gamma - disruption + reserve

def equilibrium(disruption, reserve=0.0, a_china=A_CHINA,
                eta_china=ETA_REST, gamma=GAMMA):
    values = [disruption, reserve, a_china, eta_china, gamma]
    if not all(np.isfinite(v) for v in values):
        raise ValueError("Scenario inputs must be finite.")
    if (disruption < 0 or reserve < 0 or a_china <= 0
            or eta_china <= 0 or gamma < 0):
        raise ValueError("Scenario inputs are outside the model domain.")
    def excess(p):
        return regional_demand(p, a_china, eta_china) - available_supply(p, disruption, reserve, gamma)
    # A finite declared bracket: edits that escape it fail rather than extrapolate.
    lo, hi = 0.2 * P0, 5.0 * P0
    if excess(lo) < 0 or excess(hi) > 0:
        raise ValueError("No equilibrium in the declared positive-price bracket.")
    for _ in range(90):
        mid = (lo + hi) / 2.0
        if excess(mid) > 0:
            lo = mid
        else:
            hi = mid
    p = (lo + hi) / 2.0
    q = regional_demand(p, a_china, eta_china)
    if not (np.isfinite(p) and np.isfinite(q) and p > 0 and q > 0):
        raise ValueError("Equilibrium must have finite positive price and quantity.")
    return p, q, excess(p)

SCENARIOS = [
    {"key": "equal_eta", "label": "Same regional elasticity", "a_china": A_CHINA, "eta_china": 0.20, "reserve": 0.0},
    {"key": "flexible_china", "label": "Higher assumed China elasticity", "a_china": A_CHINA, "eta_china": 0.50, "reserve": 0.0},
    {"key": "baseline_shift", "label": "China baseline demand reduced", "a_china": 14.0, "eta_china": 0.20, "reserve": 0.0},
    {"key": "reserve_flow", "label": "Reserve release added to supply", "a_china": A_CHINA, "eta_china": 0.20, "reserve": 1.0},
]
print("Regional allocations and elasticities are assumed, not empirical estimates.")
print("China baseline reduction and reserve flow are separate, one-at-a-time scenarios.")
`),
      python('scenario-comparison', String.raw`
disruptions = np.linspace(0.0, 6.0, 31)
scenario_results, scenario_traces = {}, []
for scenario in SCENARIOS:
    results = [equilibrium(float(d), scenario["reserve"], scenario["a_china"], scenario["eta_china"])
               for d in disruptions]
    scenario_results[scenario["key"]] = results
    scenario_traces.append({"x": disruptions, "y": [result[0] for result in results],
                            "mode": "lines", "name": oil_wrap(scenario["label"], 27)})

mplot(scenario_traces,
      title=oil_wrap("Illustrative equilibrium sensitivity, not a price forecast"),
      xlabel=oil_wrap("Assumed supply disruption (million barrels per day)"),
      ylabel=oil_wrap("Equilibrium price (USD per barrel)", 27),
      layout={"height": 590, "margin": {"t": 105, "b": 155, "l": 100, "r": 35},
              "xaxis": {"automargin": True}, "yaxis": {"automargin": True},
              "legend": {"orientation": "h", "y": -0.28, "font": {"size": 10}}})

print("Equilibria under a 4 million-barrel/day disruption:")
for scenario in SCENARIOS:
    p, q, residual = equilibrium(4.0, scenario["reserve"], scenario["a_china"], scenario["eta_china"])
    print(scenario["label"] + f": price {p:.2f}, quantity {q:.2f}, excess-demand residual {residual:.2e}.")
`),
      markdown('scenario-interpretation', String.raw`
## Read these as conditional comparisons

At a price above \`P0\`, raising China's assumed elasticity lowers its demand and dampens the disruption's price increase in this model. Below \`P0\`, the same more-elastic curve predicts greater demand, not less. Changing elasticity rotates responsiveness around the anchor; it is not a uniform demand reduction.

Reducing China's baseline from \`15\` to \`14\` shifts its curve down. A \`1\` million-barrel/day reserve release instead shifts available supply up. Each can lower equilibrium price, but their quantities and prices need not be identical because demand and production respond at the new price. The chart changes one assumption at a time; it does not attribute an observed historical fall to China, reserves or peace expectations.

Renewable electricity and transport substitution are not interchangeable quantities. EVs and electric transit can replace oil-powered travel regardless of how electricity is generated; renewables change that electricity's supply and emissions, and can replace direct oil-fired generation where it exists. Do not subtract the same avoided oil twice as both an EV effect and a renewable-power effect. Petrochemical feedstocks, aviation, freight and other uses need separate treatment in an empirical model.
`),
      markdown('option-context', String.raw`
## Separate demonstration: a European call and variance

The original export's cell 4 (one-based) was a Black–Scholes European-call example. We retain its fixed \`S = 100\`, \`K = 100\`, \`r = 0.05\`, \`T = 1\` and variance grid. This textbook exercise assumes a lognormal underlying with constant volatility, frictionless continuous hedging, no dividends and the model's risk-free rate. It is not calibrated to crude oil, does not incorporate the regional model and is not an oil-derivative forecast.

The x-axis is variance \`sigma**2\`, not volatility \`sigma\`. With the other inputs fixed, more uncertainty raises this call's model value. This does not establish that an actual derivative is mispriced or suitable to trade.
`),
      python('option-variance', String.raw`
from math import erf, sqrt, log, exp

S, K, r, T = 100.0, 100.0, 0.05, 1.0
variance = np.linspace(0.0001, 0.25, 150)
volatility = np.sqrt(variance)

def norm_cdf(x):
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))

def black_scholes_call(sigma):
    d1 = (log(S / K) + (r + 0.5 * sigma**2) * T) / (sigma * sqrt(T))
    d2 = d1 - sigma * sqrt(T)
    return S * norm_cdf(d1) - K * exp(-r * T) * norm_cdf(d2)

call_price = np.array([black_scholes_call(float(sigma)) for sigma in volatility])
mplot([{"x": variance, "y": call_price, "mode": "lines",
        "name": oil_wrap("Black-Scholes European call")}],
      title=oil_wrap("Textbook European call value versus variance"),
      xlabel=oil_wrap("Variance (sigma squared)"), ylabel=oil_wrap("Call model value"),
      layout={"height": 500, "margin": {"t": 95, "b": 95, "l": 85, "r": 35},
              "xaxis": {"automargin": True}, "yaxis": {"automargin": True},
              "legend": {"orientation": "h", "y": -0.22, "font": {"size": 10}}})
print(f"As variance rises from {variance[0]:.4f} to {variance[-1]:.2f}, the call value rises from {call_price[0]:.2f} to {call_price[-1]:.2f}.")
`),
      markdown('reader-exercise', String.raw`
## Reader exercises

1. In \`curve-comparison\`, halve \`ETA\`. Check that both curves still share the same anchor and local elasticity. How do their distant predictions differ?
2. In \`regional-model\`, reduce \`a_china\` without changing \`eta_china\`, then change only \`eta_china\`. Explain why those interventions are different.
3. Compare \`equilibrium(0.0)\` with \`P0, Q0\`. Add a disruption, then the same reserve flow. Why should the baseline equilibrium return?
4. Set the supply elasticity \`gamma\` to zero in calls to \`equilibrium\`. When both regional demand elasticities equal \`eta\`, check the independent solution \`P = P0*((a_china + A_REST)/(Q0 - disruption + reserve))**(1/eta)\`, provided available supply is positive and the price is in the declared bracket.
5. What regional fuel-use, vehicle-stock, travel, income, retail-price and supply data would help distinguish elasticity from substitution? Why do EV sales alone not tell you the fuel savings of the existing fleet?
`),
      markdown('sources-limitations', String.raw`
## Evidence, boundaries and provenance

The IEA's [June 2026 Oil Market Report](https://www.iea.org/reports/oil-market-report-june-2026), published 17 June 2026, described faltering oil demand and expectations of a US–Iran peace deal together with the price decline. That dated account is context, not proof of how much each mechanism contributed, and is not a current outlook. We do not reuse its prices as model calibration.

The [Global EV Outlook 2026](https://www.iea.org/reports/global-ev-outlook-2026/outlook-for-electric-mobility-chap-9-11) estimated that China's EV fleet displaced around \`1\` million barrels/day in \`2025\`. Displacement compares EV travel with equivalent combustion/hybrid travel; it is not a measured year-on-year decline of that amount. The [Global Energy Review 2026](https://www.iea.org/reports/global-energy-review-2026/oil) described nearly unchanged Chinese gasoline/diesel demand in \`2025\`, alongside growing petrochemical feedstock use. Less transport fuel need does not automatically mean falling total oil demand.

This static, two-region model omits product bottlenecks, taxes, lags, income, uncertainty, endogenous technology adoption, producer strategy, reserve capacity and stock depletion. It solves assumed curves, not a causal or empirical estimation problem. A reserve flow cannot continue indefinitely without a stock budget. Prices and results are illustrative and not financial advice.

Prompt-free provenance: adapted from the source cells of the user-supplied \`Oil_Sholes.srwb\` export. Original export SHA-256: \`69541aba9650a357eb109f1a1087130d9357f2d0262ad5e03c278e35ba695b4d\`. No saved AI conversation, prompt, account data or output is redistributed.
`),
    ],
  } };
}

export const oilWorkbookBytes = () => JSON.stringify(createOilWorkbook(), null, 2) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert(args.every((arg, i) => arg === '--check' || arg === '--source' || args[i - 1] === '--source'),
    'Usage: node tools/prepare-oil-shocks.mjs [--check] [--source original.srwb]');
  const sourceIndex = args.indexOf('--source');
  if (sourceIndex >= 0) {
    assert(args[sourceIndex + 1] && !args[sourceIndex + 1].startsWith('--'), 'Missing source path');
    const sourceHash = createHash('sha256').update(readFileSync(args[sourceIndex + 1])).digest('hex');
    assert.equal(sourceHash, ORIGINAL_SHA256, 'Original export differs from the reviewed source');
  }
  const output = path.join(ROOT, 'workbooks/en', OIL_LESSON + '.srwb');
  const bytes = oilWorkbookBytes();
  if (args.includes('--check')) {
    assert.equal(readFileSync(output, 'utf8'), bytes, 'Regenerate the English workbook from this producer');
    console.log('PASS: deterministic oil English workbook and source provenance');
  } else {
    writeFileSync(output, bytes);
    console.log('Prepared workbooks/en/' + OIL_LESSON + '.srwb (12 named cells; no saved metadata)');
  }
}
