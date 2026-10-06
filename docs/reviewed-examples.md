# Reviewed example workbooks

These eight lessons were adapted from user-supplied SciREPL exports and the
reviewed built-in CSV starter. The originals are unchanged. Catalog copies contain only the workbook
title and named source cells: no saved AI prompts, conversations, outputs,
account data or device identifiers.

| Lesson | Kernels | What to learn |
| --- | --- | --- |
| From SELECT to Risk Measures | Python | Hazard ratios are not crude risk ratios; aggregate event counts do not establish a censoring-adjusted, fixed-time NNT. |
| From Patients to Evidence | Python | Seeded fictional trials, approximate confidence-interval coverage, clinical thresholds, ARR and NNT. |
| Simpson's Paradox | R, JavaScript | A synthetic reversal, independently checked within strata and after pooling; association is not causation. |
| Markov Groups | Python | Verified cube-face permutations, four-turn cycles, noncommuting moves and a lazy one-sticker Markov chain. |
| Cooling Plume Capture | Python, Prolog | An explicitly fictional heat/water model, conservation checks, generated Prolog facts and water–electricity trade-offs. |
| Breakfast Democracy | R, Python, Prolog | A historical preference poll, voting-rule comparisons, generated Prolog facts and majority cycles. |
| Oil Shocks: Demand Curves, Substitution and Scenarios | Python | Local elasticity versus the whole demand curve; illustrative regional substitution, supply-disruption comparisons and a separate textbook European-call variance example. |
| CSV Basics: Seedling Heights | Python | Create and read six fictional rows, compare group means, and move the separate CSV together with the workbook. |

## Using a lesson

Find its localized title in **Browse Packages…**, install/open the workbook,
then run the code cells from top to bottom. Named cells are deliberate
interfaces between stages. Cooling generates `classification`; Breakfast
generates `pairwise_model`. Run those cells again after their producer
cells have populated them. Markdown describes the run order and exercises.

Python uses the app's NumPy and `mplot` support where needed, without adding
Matplotlib or installing packages while typing. R uses base R. Breakfast
downloads one small, commit-pinned public PrefLib dataset on execution,
checks its hash and writes its intermediate files under `/shared/`.
The PrefLib dataset is not redistributed in this MIT repository; its source
and license are documented in the workbook. Runtime/data downloads may
require SciREPL's privacy acceptance and allowed-network policy.

The risk lessons are educational, not medical advice. Cooling is not an
engineering design, site assessment, water forecast or investment case.
Its water metric combines tower makeup with attributed electricity-water
consumption. Blowdown return flows are not modeled: the sum is an explicit
illustrative accounting metric, not a water-consumption footprint.
The cube transition matrix tracks **one sticker**, not the full cube state.
Each lesson contains its assumptions and limitations.

Oil's original monthly demand changes were external inputs, not responses to
price, and it did not model China separately. This edition replaces unsourced
dated prices and forecasts with an explicitly illustrative equilibrium model.
Its regional allocations and elasticities are not measured estimates. A higher
elasticity changes responsiveness around an anchor; a lower demand baseline
is a separate assumption. It does not attribute a historical price decline to
China, and does not double-count EV fuel displacement as a renewable-power
effect. The European-call example is separate from the oil scenarios.

The CSV writer overwrites `/shared/data/seedling-heights.csv`. Back up an
existing file before running it. View or edit the file through **Menu → Files &
Storage**, then rerun the reading and comparison cells to refresh their output.
The starter is also built into Free 1.4.0; this catalog adds searchable translated
editions usable by Free and Pro. The [CSV walkthrough](https://s243a.github.io/SciREPL/help/files-export/tutorial/)
explains file editing and exporting a package that includes the separate CSV.

A possible later oil workbook could compare monotone curve interpolation with
softmax-weighted demand regimes. Price-dependent routing needs a monotonicity
check; blending nonnegative elasticity magnitudes and integrating from an
anchor is one way to preserve downward-sloping demand. Regime weights alone
are not market equilibria or a model of limit cycles. That extension is not
implemented in these lessons.

Another possible extension is reliability-dependent energy demand: customers
choose a grid-service tier, a UPS/battery, a backup generator or a hybrid.
Battery recharge shifts grid demand and adds losses; generator operation
creates demand for its particular fuel. Model critical load, outage duration,
storage state and fuel availability rather than treating a reliability
percentage as a complete outage description. Storage also has time-shifting
value without a physical shortage. A real-options analogy is useful, but
Black–Scholes is not a valuation model for intermittent generation by itself.
The [REopt resilience inputs](https://www.nlr.gov/reopt/curriculum/videos/reopt-lite-tutorial-module-4-text)
provide a relevant reference for a later, separately reviewed workbook.

That extension should separate demand for services (travel, heating, critical
electric loads) from the technologies and fuels that supply them. EV charging
can displace petrol while increasing electricity demand; the resulting fuel
demand depends on generation and charging time. A gas-fired generator is not
an oil-consuming generator. Model sector-specific technology shares,
efficiencies and fuel constraints, with electricity generation accounted for
upstream once rather than counted again as direct vehicle fuel. The
[IEA EV outlook](https://www.iea.org/reports/global-ev-outlook-2026/outlook-for-electric-mobility-chap-9-11)
distinguishes oil displacement from electricity consumption. A shortage in one
fuel must not automatically be treated as a shortage in every energy carrier.

## Translation and review

The target natural-language set is SciREPL's 13 interface locales: English,
Arabic, Bengali, German, Spanish, French, Hindi, Indonesian, Japanese,
Korean, Brazilian Portuguese, Russian and Simplified Chinese. Translation
is staged separately from English review: only an edition with all its
gates complete may be registered in the catalog. A draft file on a working
branch is not a claim that the edition is ready.

Gemini produces a draft and a fresh review in an empty, tool-free sandbox.
The controller applies only the proposed prose. Identifiers, cell names,
data keys, dataset values, hashes, URLs and executable code tokens remain
unchanged, including in Arabic. Display text/comments may translate.
Known untranslated headings or prose hold an edition out of the index.
All eight lessons now have editions in all 13 locales. The 96 non-English
editions are **machine-translated; native-speaker review pending**. The owner
authorized publication with this caveat; that authorization is not language
approval. AI/controller review and scoped corrections are recorded honestly,
including cases where the final correction was not freshly Gemini-reviewed.

Compact receipts under `reviews/examples/` pin the exact English and
translated artifact hashes, code-span manifest, content audit and two
browser-run receipts. Raw model prompts and transport logs stay local;
the public receipts contain no prompts or private conversation.
Preparation-time provenance under `reviews/sources/` is historical, not a
live approval status; the browser/translation receipts are the current gates.

The browser bench imports into disposable profiles, runs cells in order
and exports again. It allows only the app, public runtime downloads and
the exact pinned PrefLib source, never an AI provider. Independent repeat
runs must be deterministic. Text outputs must match the English baseline
outside declared translated spans; plot data and configuration are checked
separately from presentation labels. Rendered charts also need checking for
glyphs, clipping and bidirectional layout. These gates certify structure
and the checked numerical behavior, **not translation quality**.
The capture host needs fonts for each locale. Korean charts were re-run with
a locally available Hangul font after the initial host rendered missing-glyph
boxes; no font files are redistributed with the workbooks.

## Reproduce checks

Use Node 22 and Python 3 with NumPy 2.2.6. The offline checks never execute
an arbitrary catalog workbook; the cooling test executes only the reviewed
English copy with stubbed SciREPL callbacks and redirects its `/shared/`
writes to a temporary directory. This is not a security sandbox for
unreviewed code.

```sh
node tools/test-example-risk.mjs
node tools/test-example-markov.mjs
node tools/test-example-cooling.mjs
node tools/test-example-oil.mjs
node tools/test-csv-basics-workbook.mjs
node tools/test-span-tools.mjs
node tools/test-output-oracle.mjs
node tools/test-example-plot-data.mjs
node tools/translate-example-prose.mjs --self-test
node tools/test-example-editions.mjs
node tools/register-example-workbooks.mjs --check
node tools/build-index.mjs --check
```

To reproduce browser runs, serve a reviewed SciREPL build and set
`SCIREPL_TEST_PACKAGE` to its package.json with Playwright installed,
`SCIREPL_TEST_ORIGIN` to that server and `SCIREPL_TEST_EVIDENCE` to a scratch
directory. Then run `tools/test-example-browser.mjs` with explicit reviewed
workbook paths. This does not attach to a user's browser or phone.

Adding catalog entries does not publish a new stable Pages release. The
release/tag workflow in [distribution.md](distribution.md) remains separate.
