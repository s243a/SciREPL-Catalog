# Changelog

Notable changes to the SciREPL Catalog: content added, conventions adopted,
and work deliberately deferred.

## Unreleased

- Clarified fixed global axes, local face-view right/up directions, outward
  normals and the front-to-top paper tilt in all 13 Markov Groups editions.
  Added two self-contained, accessible inline SVGs, readable in light/dark
  themes and on narrow screens; no runtime is needed to see them on import.
- The earlier coordinate/cycle clarification kept all nine cell names/order
  and existing Python unchanged. Fresh
  Free-browser diagram checks are recorded separately from prior executable
  runtime evidence. For coordinates, Gemini refreshed 11 translations; German used an
  authorized controller/manual fallback after a truncated model response.
  Native-speaker review remains pending. Those item revisions became 2; no catalog
  version or release tag changes.
- Explained the clockwise U corner/edge position cycles, neighbouring face
  strips, zero-based versus printed one-based positions, and sticker paths
  versus whole cubies in all 13 editions. That update changed only the
  `cycles` Markdown; executable code and coordinate diagrams were unchanged.
- Added explicit front-referenced face-frame rotations, a compact face/index/
  position-number table, and the geometry and minimum-index ordering of the
  five move cycles in all 13 editions. Both completed Markdown prefixes and
  coordinate diagrams are retained byte-for-byte.
- Added 30 localized Python comments per edition to identify corner, edge and
  neighbouring-strip cycles. Only these authorized comment lines change Python;
  move data/order and every remaining code byte are unchanged. Comments reuse
  localized Markdown labels rather than adding model requests.
- For these new addenda, six editions passed fresh Gemini draft/review pairs;
  bn, de, ko, pt-BR, ru and zh used authorized controller/manual fallback after
  recorded protocol failures. The campaign used 19 requests with no retries or
  repairs. Native-speaker review remains pending. Item revisions rise to 3,
  without a catalog version or release-tag change; current Markdown rendering
  checks and historical executable runs retain separate source hashes.
- Reflowed the new German cycle-table headings after the actual narrow-screen
  check; the original campaign hashes remain recorded and no extra model
  request was made.
- Reworked Stage 4 in all 13 Markov Groups editions into three adjacent
  Markdown/Python pairs: count one-step alternatives, follow one chosen
  sticker, then sample a whole-cube trajectory. Four KaTeX equations connect
  matrix entries, a one-hot probability vector, first-column selection and
  ordered two-step products to the code. Astra's clarity review approved the
  revised explanation.
- Replaced the compact transition-matrix sum with an equivalent explicit
  counting loop, preserved existing localized comments/output labels, and
  added the two new code-cell names to the introduction's run order. Earlier
  geometry, diagrams, cycle data and all other content remain unchanged.
- The Stage 4 campaign used 24 requests (one draft/review pair per locale),
  with no retries or repairs. Eleven editions passed fresh Gemini reviews;
  Arabic used controller review and corrections after a truncated review
  response. Native-speaker review remains pending. These item revisions
  become 4; the catalogue version and release tags do not change. Fresh
  import/render checks and local NumPy equivalence evidence are separate
  from the retained historical nine-cell app-runtime receipts.
- Actual formula review caught inherited RTL direction reversing Arabic
  equations despite valid KaTeX syntax. Four trusted LTR containers now keep
  the unchanged math in its proper order while Arabic prose stays RTL. The
  original translation snapshot is preserved; this controller rendering
  refinement uses zero additional model requests.
- Clarified the probability update in all 13 editions: the general equation
  works for any starting distribution; selecting column j explicitly requires
  a one-hot distribution at j, and the code's j=0 is only an example. Concrete
  SOLVED[0]=1 and SOLVED[5]=6 examples distinguish position indices from labels.
  This small controller-authored correction makes no model requests, changes
  no Python, and retains the completed translation/rendering evidence as
  historical records. Fresh rendering and regression evidence is separate.
  Only the 13 Markov item revisions advance again, to 5, with updated hashes.
- Added one consolidated Stage 4 clarity pass in all 13 editions: the
  selected column now explicitly means destination probabilities for sticker
  label 1, and `move_counts[d, j]` names the counted entry. Row/column sums
  follow directly from permutation matrices; inverse-pair weighting separately
  explains symmetry. Per-move destinations and the whole-cube convergence
  conditions are explicit, with a question-5 hint distinguishing the chosen
  sticker's 24 corner positions from all 54 positions and from cube states.
  The seven localized controller paragraphs make no model requests; native
  review remains pending. Python and all four equations are unchanged, earlier
  receipts are retained as history, and fresh clarity checks certify the new
  bytes. Only the 13 Markov revisions rise to 6; no release/version change.

## 2026-10-04 — reviewed examples (staging)

- Completed the six-lesson rollout: 72 machine-translated editions across
  ar, bn, de, es, fr, hi, id, ja, ko, pt-BR, ru and zh, with localized searchable
  titles/descriptions. Native-speaker review remains pending for every edition;
  publication with that caveat is owner-authorized, not native approval.
- Applied the same chart-layout improvements to English and every translation:
  wrapped Simpson titles, more room for Breakfast's bottom axis, and wrapped
  dual-axis Patients labels. Only those three English artifact revisions rise
  to 2; new translated entries start at revision 1.
- Final receipts pin the promoted bytes, regenerated span/KEEP data, two actual
  browser executions, numerical comparisons and controller-rendered review.
  Earlier failed transports and review holds remain preserved locally.
- Added six reviewed English lessons: SELECT risk measures, trial evidence,
  Simpson's paradox, cube permutations/Markov walks, fictional plume
  cooling, and breakfast voting. Stripped saved AI/output/device metadata.
- Corrected the cube moves against an independent physical rotation
  oracle; clarified the one-sticker versus full-state Markov distinction.
- Distinguished hazard ratios from crude risks/NNT and marked the trial
  data fictional; added uncertainty, zero-SE and rerun-order checks.
- Corrected cooling heat/moisture accounting and invalid prose-as-code;
  added conservation and same-weather comparisons with explicit caveats.
  Distinguished its makeup-plus-electricity water metric from consumptive
  use rather than treating blowdown as automatically consumed water.
- Breakfast fetches a pinned, hashed historical PrefLib source rather than
  redistributing the separately licensed dataset.
- Added clean-profile browser checks, repeat-run/output comparison,
  plot-data invariants and compact source-hashed review receipts.
- Gemini supplied machine drafts and reviews; scoped AI/controller corrections
  resolved remaining source-fidelity issues. Incomplete/failed editions are
  not registered, and machine checks never stand in for native approval.
- Fixed format-2.0 index validation and a stateful placeholder-regex issue
  in the differential output oracle, with regressions. No app release,
  model/API settings, or catalog release tag changed.

## 2026-08-13

### Added

- **Spanish (es): 15 workbook editions**, translated from the English sources
  by the supervised agy/Gemini pipeline (per-action permission review, audit
  logs, and a mechanical verification gate on every file):
  - `compute-pi-workbook.srwb` (pilot)
  - `lua-tables-coroutines.srwb`, `lua-parsing-coroutines.srwb`
  - `typr-intro.srwb`
  - `prolog-generates-r.srwb`, `prolog-generates-lua.srwb`
  - `prolog-generates-clojurescript.srwb`, `prolog-generates-typr.srwb`
  - `r_ggplot2_showcase.ipynb`, `r_statistics.ipynb`,
    `r_tidyverse_wrangling.ipynb`
  - `01_family_tree_tutorial.ipynb`, `02_recursion_patterns.ipynb`,
    `03_call_graph_analysis.ipynb`, `life_expectancy_csv_demo.ipynb`
    (batch 3, translated on Gemini 3.7 Flash the week of its release;
    batches 1–2 used 3.6 Flash — no quality difference surfaced in
    review, and the same gates passed for both)

  **Spanish is complete: all 15 built-in workbooks have es editions.**

- **Japanese (ja): all 15 workbook editions**, one supervised session on
  Gemini 3.7 Flash (30 approvals, 0 denials; ~40 minutes — whole-locale
  sessions amortize far better than the es-era batches). Terminology from
  the app's own ja UI glossary; «推移閉包», «強連結成分», «末尾再帰» et al.
  flagged by the worker as judgment calls for native review.

- **Arabic (ar): all 15 workbook editions** — one supervised session, ~10
  minutes and only 7 approvals: the worker reused its established
  batch-script pattern from the Japanese session, combining build+verify
  per prompt. RTL note for reviewers: judge the files directly, not
  terminal captures (bidirectional rendering garbles PTY output).
  «الانغلاق المتعدي», «المكونات شديدة الترابط» and the recursion terms are
  flagged for native review; native testers are lined up for this locale.

- **Korean (ko): all 15 workbook editions** — ~8 minutes, 7 approvals,
  third locale in the same continued worker session with no context
  degradation. «이행 폐포», «강결합 컴포넌트», recursion terms flagged for
  native review; native testers lined up.

- **Brazilian Portuguese (pt-BR): all 15 workbook editions** — ~9 min, 7
  approvals, fourth locale in the continued session, no degradation.
  This locale is also the filter's subtag test case (`pt` primary
  matching `pt-BR` content). Verified distinct from the Spanish editions
  (Latin-locale lazy-copy guard).

- **German (de): all 15 workbook editions** — ~9 min, 7 approvals, fifth
  locale in the continued session. «transitive Hülle», «Endrekursion»,
  «starke Zusammenhangskomponenten» flagged for native review.

- **French (fr): all 15 workbook editions** — ~7 min, 6 approvals, sixth
  locale in the continued session, fastest yet. «fermeture transitive»,
  «récursion terminale», «composantes fortement connexes» flagged for
  native review.
- The 15 English source workbooks under `workbooks/en/` (translation inputs,
  not index items — the app already ships them built in).
- `tools/build-index.mjs` — sha256/size integrity for every index item, with
  revision discipline enforced against git HEAD in both directions.
- `tools/verify-translation.mjs` — the translation gate: non-markdown cells
  must be deep-equal to the English source (srwb and nbformat), every
  markdown cell must actually be translated, structure and metadata
  untouched.

### Conventions adopted

- **Only markdown translates.** Code cells, outputs, execution counts, and
  metadata stay byte-identical to the source. This is what exempts translated
  editions from runtime re-testing: their executable surface is provably
  unchanged.
- **Cell names stay in English** (see README). Names are referenced from
  code (`nb_read("cell_name", …)`); 30 of the 49 named cells across the
  current workbooks are code-referenced and cannot change without breaking
  execution.
- Translated editions are separate index items (`compute-pi-es`), not
  variants; `sha256` is mandatory for every published item.
- Terminology continuity across sessions comes from the repository itself:
  new translation rounds read the existing editions first («cuaderno de
  trabajo», «clausura transitiva», «corrutinas», «análisis sintáctico», …).

### Deferred, deliberately

- **Cell-name localisation (second pass).** 19 of 49 named cells are not
  referenced from code and could be translated for readability. Doing it
  properly needs: translating every prose mention of each renamed cell in
  the same file; two new gate rules (code-referenced names unchanged; no
  untranslated mentions of renamed cells); a `revision` bump per touched
  item; and — because it changes the executable surface's identifiers —
  a runtime re-test of each affected workbook per locale. Parked as
  lower-priority; the mixed-language naming it produces inside a single
  workbook (frozen references next to translated free names) may argue for
  never doing it at all.
- **Further locales.** Spanish is the pilot; the pipeline (batching,
  supervision policy, gates) is designed to repeat per language.
- **In-app availability.** These items become installable when SciREPL's
  catalog Sources feature ships (phases 3+ of its catalog-browse design);
  until then this repository is reachable content, not yet a wired source.
