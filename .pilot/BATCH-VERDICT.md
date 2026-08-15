# Locale batch verdict — compute-pi fully translated in all 12 locales

**All green, 2026-08-15.** Every locale ran the mechanical pipeline:
draft (agy) → review (agy) → span-apply → apply-renames → derive
--allow-renames → lint --strict (worker-declared keeps) → bench ×2 →
determinism envelope → differential oracle vs the en baseline → plot check.
Nothing committed until every gate passed. Evidence per locale under
`.pilot/compute-pi-<locale>/`.

| Locale | Identifiers | Cell names | Notes |
|---|---|---|---|
| es | Spanish (accented) | Spanish | Stage A+B pilots (PR #2, #3) |
| de | German (umlauts) | German | first one-shot pipeline run |
| fr, pt-BR, id | native Latin | native | clean first pass |
| ja, zh, ko, hi, bn | native script | native script | Python accepts all (bench-verified) |
| ru | Cyrillic | Cyrillic | ran with sense-context prompts |
| ar | **English** (owner policy: bidi) | **English** | prose/strings/labels Arabic; glosses deferred to the future per-cell notes feature |

## What the batch caught (all fixture-locked)

1. **bn — Unicode composition exclusion**: Bengali ড় (U+09DC) is
   composition-excluded, so its NFC form is DECOMPOSED; the "must already be
   NFC" rule rejected correct Bengali. Tools now normalize to NFC instead
   (semantically transparent — Python normalizes identifiers itself).
2. **ko — plot auto-ranging**: the text oracle diffed plot-cell tick text;
   Korean label widths shifted Plotly's auto-range (−2..2 → −3..3). Plot
   cells (detected by rendered plot markup, not mere lastOutputHtml, which
   ALL cells carry) now route to the plot check only.
3. **Repair-loop hardening**: a failed/empty worker response counts as a
   failed round instead of crashing the locale; prompts forbid tool use
   (headless agy auto-denies and returns nothing).
4. **Word-sense context**: candidates now carry their enclosing source line,
   so fragment translation sees the code it lives in.

## Process (owner decisions incorporated)

Two-pass worker (draft + review) per locale, plus gate-failure repair rounds
fed back to the worker with exact error text. Identifier policy per script;
ar keeps English identifiers/cell names (RTL/bidi; Arabic developer custom).
