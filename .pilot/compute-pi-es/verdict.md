# Stage A pilot verdict — compute-pi → es (code-content translation)

**Verdict: PASS.** All gates green on 2026-08-14. The translated workbook is
runtime-verified and staged for promotion.

## What was verified, and by what

| Gate | Tool | Result |
|---|---|---|
| Structural identity (token streams, CODE byte-identical) | `span-derive` | PASS — 29 spans derived, 0 errors |
| Worker/derived cross-check (no self-certification) | set comparison on (cell, source, target) | EXACT — 29 = 29, zero asymmetric spans |
| Completeness (nothing left in English) | `span-scan --lint --strict` | CLEAN with 2 sanctioned keeps (`--allow ' < pi < '`, `--allow 'd'`) |
| Trap integrity (`symbols('n')`) | `span-scan` lint | intact |
| English determinism envelope | `output-oracle envelope` (2 en runs) | stable, no exclusions |
| Spanish determinism envelope | `output-oracle envelope` (2 es runs) | stable, no exclusions |
| Differential runtime oracle | `output-oracle judge` (en-run-1 vs es-run-1, derived manifest) | **ORACLE PASS** — outputs byte-identical under symmetric sentinel masking |
| Plot check (cell 1) | label inspection of `lastOutputHtml` | translated labels present, no English leftovers, no errors (the `errorbars` regex hit is an empty Plotly SVG layer, byte-identical in en) |

All cells (5 python + 2 markdown) executed cleanly on the bench
(headless Chromium, locale en-US, TZ UTC, Pyodide; broker `/mcp` drive:
`import_workbook_from_file` → `run_cells` → `export_workbook`).

## Evidence in this directory

- `span-manifest.derived.json` — authoritative manifest (mechanical diff)
- `span-manifest.worker.json` — agy's self-declared manifest (cross-check)
- `runs/{en,es}-run-{1,2}.srwb` — post-run canonical exports from the bench

## What the pilot caught (tool fixes shipped in this revision)

The dry-run fixtures all passed before the pilot; the real translation
exposed three latent tool bugs, each now fixed **with a regression fixture**:

1. **`span-derive` rejected translated table headers** — `{'step':>4}` →
   `{'paso':>4}` was flagged as a placeholder change. Quoted-literal
   placeholders with identical format specs are translatable content; derive
   now emits them as spans and records the `format_spec`.
2. **`span-scan --lint` searched raw code, not prose** — candidate `"step"`
   matched the `{step:>4}` placeholder identifier, `" terms"` matched
   `(x, terms)` in a signature. The lint now tokenizes the translated cell
   and searches only comment/string bodies (f-strings: literal runs plus
   quoted-literal placeholder contents). Added `--allow` for task-sanctioned
   keeps.
3. **The oracle masked raw manifest text, not rendered output** — a span
   stored as `\nThe methods…` (backslash-n) never matched the real newline
   in stdout, and equal-width headers with different text lengths render
   different padding. `judge` now masks the RENDERED span text (escapes
   decoded, field padding applied per `format_spec`).

## Reviewer note: cell names stay English — by design, not omission

`"name": "geometry"` (and `bounds`, `accuracy`, `symbolic_limit`,
`comparison`) look like untranslated strings but are **identifiers**: the
notebook VFS mounts each cell at `/nb/<name>` for reading and writing cell
properties (`/nb/geometry/.output`), and the MCP tools (`read_cell`,
`write_cell`, `execute_cell`) address cells by the same name. Translating
them would fork the addressing scheme per locale — any script, tutorial, or
agent task referencing a cell by name would break on translated editions.
They follow the same rule as function and variable names: stable across all
locales. `span-derive` enforces this (a changed cell name is a hard error).

## Supervision record

Worker: agy (Gemini) over the PTY broker; supervisor: Claude Sonnet subagent
reviewing every permission prompt (12 approvals — all confined to the two
allowed paths or scratch; 1 denial — `git status`, out of scope). Zero span
deviations from the approved task list. Known wrinkle: agy stalls silently
after a single permission denial and needs one nudge to resume reporting.
