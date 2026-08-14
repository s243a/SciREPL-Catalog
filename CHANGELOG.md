# Changelog

Notable changes to the SciREPL Catalog: content added, conventions adopted,
and work deliberately deferred.

## 2026-08-13

### Added

- **Spanish (es): 11 workbook editions**, translated from the English sources
  by the supervised agy/Gemini pipeline (per-action permission review, audit
  logs, and a mechanical verification gate on every file):
  - `compute-pi-workbook.srwb` (pilot)
  - `lua-tables-coroutines.srwb`, `lua-parsing-coroutines.srwb`
  - `typr-intro.srwb`
  - `prolog-generates-r.srwb`, `prolog-generates-lua.srwb`
  - `prolog-generates-clojurescript.srwb`, `prolog-generates-typr.srwb`
  - `r_ggplot2_showcase.ipynb`, `r_statistics.ipynb`,
    `r_tidyverse_wrangling.ipynb`
  - Remaining four (the three UnifyWeaver tutorials and
    `life_expectancy_csv_demo.ipynb`) are in progress.
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
