# Locale policy

Decisions that shape what "fully translated" means per language. Everything
here was decided by the repo owner and verified on the live bench; per-item
deviations are recorded in the relevant `.pilot/` verdicts.

## What always translates, what never does

Translates (all locales): markdown, comments, docstrings, display strings,
formatted-output literal runs, plot labels, table headers (within field
widths).

Never translates (any locale): format specifiers (`%.2f`, `~w`, bash
`$(...)`/`${}`/`$var`), API/dict keys and mode strings, dataset column
names, parsing-demo input corpora (lesson mechanics), Prolog quoted atoms,
Python keywords, attributes and call keyword-arguments, cell names outside
Stage B, and anything on a task's KEEP list. Words identical across
languages ("Manual", "id", " < pi < ") are *sanctioned keeps*, declared by
the worker or adjudicated by the controller, and recorded per run.

## Identifiers and cell names, per script

Verified on the bench (probes + shipped corpus):

| Script family | Locales | Identifiers | Cell names |
| --- | --- | --- | --- |
| Latin | es, de, fr, pt-BR, id | native, accented (Python/R accept them) | native |
| Cyrillic | ru | native | native |
| CJK | ja, zh, ko | native (Python + R verified incl. CJK) | native |
| Indic (LTR) | hi, bn | native (Devanagari/Bengali are LTR — no bidi issue) | native |
| **Arabic (RTL)** | ar | **English** | **English** |

Identifier renames are additionally constrained per kernel: Python-only in
the current tooling (α-rename gate); Lua identifiers are ASCII-only by the
Fengari runtime; Prolog variables must begin uppercase (accented-Latin
verified; CJK parses as an atom). Only compute-pi carries identifier/cell-
name translation so far (Stage B); the rest of the corpus is Stage A
(prose only), so these constraints bind future Stage B expansion.

## The Arabic decision (owner, 2026-08-15)

For `ar`, identifiers **and cell names stay English**; all prose (markdown,
comments, strings, labels) is Arabic. Two independent reasons:

1. **Bidirectional rendering.** RTL tokens interleaved with LTR operators
   and digits display in an order that diverges from logical order (the
   Trojan-Source class of confusion). Comments and string literals don't
   suffer this — a homogeneous RTL run inside delimiters reads correctly —
   but identifiers are always embedded in LTR code.
2. **Arabic developer custom.** Arabic-script programming languages never
   gained adoption; Arabic developers read code with English identifiers
   and Arabic prose. Cell names are additionally addressing identifiers
   (`/nb/<name>` in the app's [notebook VFS](https://github.com/s243a/SciREPL/blob/main/www/js/notebook_vfs.js), MCP `read_cell`),
   i.e., part of the structural layer.

**Deferred, not dropped**: Arabic glosses for the English names. The agreed
future home is a per-cell `notes` metadata field in the srwb format (shown
in-app on demand) — zero code real estate, no bidi exposure, one new span
kind in the pipeline. Until that app feature ships, ar workbooks carry no
glosses; a markdown-glossary interim was considered and rejected by the
owner.

## Unicode normalization

Rename targets and cell names are normalized to **NFC by the tools**, never
rejected for their input form — because "already NFC" is not a well-defined
demand across scripts: Bengali ড় (U+09DC) is composition-EXCLUDED, so its
NFC form is the decomposed sequence, and a worker's precomposed input was
correct Bengali. Python normalizes identifiers itself, so consistent
normalization is semantically transparent. Exact-match name addressing
(`/nb/<name>`) is the reason normalization must be consistent corpus-wide.
