# Stage B pilot verdict — compute-pi → es (full translation: identifiers + cell names)

**Verdict: PASS.** All gates green on 2026-08-14. The workbook is now fully
Spanish: markdown (round one), comments/strings (Stage A), and — new in this
stage — 25 identifiers and all 5 cell names.

## Division of labor (the Stage B economics)

- **Worker (agy/Gemini, one-shot `/agent` call)**: proposed the glossary —
  the only linguistic judgment in the stage. Prompt and raw response in this
  directory (`glossary-prompt.txt`, `glossary.worker.json`).
- **Controller tooling (deterministic)**: `apply-renames.mjs` applied the
  glossary mechanically. No agent edited code bytes.
- **Gates**: `span-derive --allow-renames` (α-rename verification) +
  the runtime differential oracle.

## Gates

| Gate | Result |
|---|---|
| Glossary sanity (valid NFC identifiers, no keyword/collision) | PASS (apply-time) |
| α-rename verification: consistent bijection, 25 renames / 96 occurrences | PASS |
| Attribute + call-kwarg + keyword immunity | PASS (2 kwarg sites correctly untouched) |
| Cell-name validity (unique, NFC, app rules) | PASS — 5 names |
| Stage A span integrity (34 spans incl. 5 cell_name) | PASS |
| Completeness lint | CLEAN (same 2 sanctioned keeps) |
| es determinism envelope (2 runs) | stable, no exclusions |
| **Differential runtime oracle vs en baseline** | **PASS** |
| Plot check (cell 1) | Spanish labels, no English leftovers |

## What the runtime gate caught (both now fixture-locked)

1. **Call-kwarg collision**: `layout` is both a local variable and a keyword
   argument of the app's `mplot()` API. Naive application produced
   `mplot(disposición=…)` → `TypeError` on the bench. Fix: kwarg-position
   immunity (paren-context tracking threaded across string-split code
   tokens). Result: `mplot([círculo, hexágono], layout=disposición)`.
2. **Def-default parameters**: first immunity pass over-approximated,
   leaving `def archimedes_rows(doublings=18)` unrenamed while body uses
   were renamed → `NameError`. Fix: def-signature parens are distinguished
   from call parens; parameters rename, call kwargs don't.

Plus one oracle refinement: cell_name spans are metadata and exempt from the
checked-claim rule (the name `precisión` legitimately coincides with the
word "precisión" in translated output prose).

## Per-kernel identifier policy (probed on the bench)

- Python: full unicode identifiers (this pilot) ✓
- R (webR): full unicode incl. CJK ✓ (probed)
- Prolog: accented-Latin variables (`Área`) ✓ (probed); CJK parses as atom
- Lua (Fengari): identifiers ASCII-only → diacritic-stripped Spanish
- bash: ASCII-only names
- TypR: output-capture quirk on the bench; probe deferred to first TypR
  workbook in the queue

Cell names are unicode-safe in EVERY kernel (verified: bash `ls`/`cat`/
`mkdir` on `/nb/`, Lua `io.open` + `nb.read` with accented and CJK+RTL
names) because kernels touch them as strings, never as identifiers.

## Evidence

- `glossary.worker.json` — agy's proposed glossary (25 renames, 5 cell names)
- `glossary-prompt.txt` — the exact prompt (candidate list from the
  mechanical inventory; KEEP list; round-one vocabulary)
- `span-manifest.derived.json` — stage-b manifest (34 spans, 25 renames)
- `runs/esb-run-{1,2}.srwb` — post-run canonical exports
- en baseline runs: `.pilot/compute-pi-es/runs/en-run-{1,2}.srwb`
