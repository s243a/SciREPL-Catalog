# Translation task: compute-pi, es, Stage A — code content

**Scope:** one workbook, one locale, one stage. This is the pilot defined in
[docs/proposal-code-translation.md](../proposal-code-translation.md). Read
that document's "Stages" and "Verification economics" sections first — this
task file is the operative spec; the proposal is the why.

**Staging rule (new; overrides the round-one habit).** All output of this
task stays on the staging branch `pilot/stage-a-compute-pi-es`. The artifact
does NOT merge to `main`, does NOT enter `scirepl-catalog.json`, and does NOT
get a `revision` bump until the runtime gate (differential oracle against
the English run) passes on the test bench. Round one shipped straight to
main because static verification was complete at commit time; a Stage A
artifact is unproven until executed.

## Files

- **Source (read-only):** `workbooks/en/compute-pi-workbook.srwb`
- **Working copy (edit this):** `workbooks/es/compute-pi-workbook.srwb` —
  on the staging branch this file already exists with markdown translated
  (round one) and code cells byte-identical to English. You translate code
  content only.
- **Your span manifest (write):** `.pilot/compute-pi-es/span-manifest.worker.json` —
  schema in [span-manifest.schema.json](span-manifest.schema.json). This is
  a cross-check artifact; the authoritative manifest is derived mechanically
  by the gate from the file diff. If yours and the derived manifest
  disagree, the gate fails and the discrepancy is investigated — so declare
  exactly what you changed, no more and no less.

You may modify exactly two paths: the working copy and your manifest.
Nothing else. No git operations, no index edits; the controller commits.

## What translates (exhaustive list)

Cell indices are zero-based; names as stored in the file. Translate ONLY
these spans. All are in Python code cells.

Provenance note: this list was hand-drafted, then audited by a scanner
that dumped every comment and string literal per cell — the audit caught
omitted trailing fragments in cell 5 (fixed below). Treat the list as
complete *because it survived the scan*, and translate nothing outside it.
From gate v2 on, lists like this one are scanner-produced, not hand-read:
the gate's translatable-candidate linter warns on every prose-like literal
or comment not covered by any span, so completeness becomes mechanical.

### Cell 1 — "geometry"
- Comment: `# Visualize the starting hexagon inside a unit circle.`
- Trace-name strings (plot legend labels; kind `plot_label`):
  `"Unit circle"`, `"Inscribed hexagon"`
- Plot-title string (kind `plot_label`): `"Archimedes starts with a hexagon"`

### Cell 2 — "bounds"
- The `archimedes_rows` docstring (3 lines; kind `docstring`)
- f-string header literals (kind `display_string`): `step`, `sides`,
  `lower bound`, `upper bound`, `width` — width constraints below
- Final print literal: `"\nFinal enclosure: "` — translate the words; the
  remainder of the f-string (`{lower:.12f} < pi < {upper:.12f}`) contains
  no prose; `pi` stays `pi`.

### Cell 3 — "accuracy"
- The 2-line opening comment block
- f-string header literals: `d` (keep `d` — single-letter mathematical
  symbol), `first doubled n`, `bound width`
- The two closing print literals ("A narrower enclosure certifies …").

### Cell 4 — "symbolic_limit"
- `"Symbolic check of the familiar inscribed-area formula:"`
- `"limit as n approaches infinity ="` — note: the `n` inside this *prose*
  is the symbolic variable's name. Keep it `n` (Spanish does so naturally:
  «límite cuando n tiende a infinito =»). Same rule as the line below,
  here inside translatable text.
- **Do NOT translate `'n'` in `sp.symbols('n', …)`** — it is the symbolic
  variable's name, not prose. Translating it changes the rendered symbolic
  output and breaks the differential oracle outside any declared span.

### Cell 5 — "comparison"
- Comment: `# Alternating-series remainder for pi is at most 4/(2N+1).`
- `"Work needed for about 1e-10 absolute accuracy:"`
- f-string row labels **and the unit prose after their placeholders** —
  both translate:
  - `Leibniz guarantee:` … ` terms`
  - `Polygon bound width:` … ` sides (width ` … `)` — the parenthesis is
    literal: `(width` keeps its open paren, the closing `)` after the
    interior `{polygon_width:.2e}` placeholder belongs to the translatable
    text, and that interior placeholder is untouchable
  - `Machin formula in float:` … ` terms per arctangent`
  Keep the leading two-space indent; you MAY adjust the run of padding
  spaces between a label and its `{...}` placeholder to preserve column
  alignment, but every placeholder itself is untouchable.
- The two closing print literals ("The methods have very different …").

### Cell 6 — markdown. Do not touch.
All markdown cells were translated in round one and are out of scope.

## Hard constraints (gate-enforced)

1. **Everything outside the listed spans stays byte-identical:**
   identifiers, keywords, numbers, operators, imports, dict keys and API
   values (`"x"`, `"y"`, `"mode"`, `"lines"`, `"lines+markers"`, `"name"`,
   `"title"`, `"scaleanchor"`), the symbol name `'n'`, and every piece of
   format-spec mini-language (`>4`, `>9,`, `>16`, `.12f`, `.2e`, …).
2. **Placeholder integrity:** every `{...}` placeholder in a translated
   string survives with identical name, format spec, and order.
3. **Width fit:** translated f-string header words must fit their field
   widths or the table visually breaks. Upper bounds (field width):
   `step` ≤ 4, `sides` ≤ 9, `lower bound` ≤ 16, `upper bound` ≤ 16,
   `width` ≤ 12, `d` ≤ 3, `first doubled n` ≤ 18, `bound width` ≤ 14.
   If no natural translation fits, prefer a shorter established word;
   never widen the format spec.
4. **Accents are fine:** comments and strings may carry Spanish accented
   Latin (á, í, ñ, …) — Python 3 accepts UTF-8 content in both. This
   affects nothing else; identifiers stay English (Stage C is deferred).
5. **Format fidelity:** the file stays UTF-8 JSON, same key order, same
   indentation. Only the listed string/comment contents change. The gate
   checks cell count/order/types/names, container metadata, and key sets.
6. **No execution:** you do not run the workbook. Runtime verification is
   the bench's job. Your self-check (below) is static only.

## Glossary (established in the round-one es markdown — reuse it)

Code comments and strings must use the same terminology the reader already
saw in the prose:

| English | es (established) |
| --- | --- |
| Compute Pi | Cálculo de Pi |
| unit circle | círculo unitario |
| inscribed hexagon | hexágono inscrito |
| lower bound / upper bound | cota inferior / cota superior |
| enclosure width | ancho (del intervalo acotado) |
| sides / doubling | lados / duplicar |
| Archimedean bounds | cotas arquimedianas |
| symbolic limit | límite simbólico |
| floating-point | punto flotante |

Width-checked suggestions for the table headers (final choice is yours
within the constraints): `step` → `paso` (4), `sides` → `lados` (5),
`lower bound` → `cota inferior` (13), `upper bound` → `cota superior` (13),
`width` → `ancho` (5), `first doubled n` → `primer n duplicada` (18),
`bound width` → `ancho de cota` (13).

**Quoted outputs in prose:** checked — this workbook's markdown does not
quote any output strings, so no prose sync is needed. (The checklist item
survives for less fortunate workbooks.)

## Self-check (before you report done)

Write and run a throwaway Python script in your scratch area (policy
rule 3) that:

1. Parses the en file and your edited es file as JSON.
2. Asserts: identical cell count, order, types, and cell names; markdown
   cells unchanged from the pre-edit es file; `notebook.name` unchanged.
3. Asserts code cells differ from English ONLY within your declared spans —
   the cheap way: apply your manifest in reverse (replace each target span
   text with its source span text) and require the result to equal the
   English code cell byte-for-byte.
4. Asserts placeholder sets are equal in every translated f-string
   (extract `\{[^}]*\}` from both versions, compare as ordered lists).

Report the script's verdict lines, not its full output. Your self-check is
the inner loop; it is never authoritative.

## What happens after you finish (controller + bench, not you)

Derived-manifest extraction → static gate v2 (your manifest cross-checked
against the derived one) → bench run: English twice for the determinism
envelope, then the translated run under the same pinned locale/timezone →
differential oracle (outputs identical outside declared spans) → plot
check on cell 1 (dimensions, non-blank fraction, pixel diff outside label
regions) → if green: revision bump, index, merge to main.

**Pilot assumption A1 (recorded, not yours to fix):** the app's Pyodide
environment must provide `numpy` and `sympy`. Round one never executed
anything, so this workbook has not been run since it shipped as a built-in.
The first bench run verifies this assumption; if it fails, that indicts
the bench environment, not your translation.

**Why this workbook is the pilot:** the computation is fully
deterministic — Archimedean bounds, no RNG, no clock, no I/O — so the
determinism envelope (English run twice) should pass trivially. Any
envelope failure here indicts the harness, not the workbook, which is
exactly what a pilot is for.
