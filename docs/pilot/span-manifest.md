# Span manifest — semantics and rationale

Companion to [span-manifest.schema.json](span-manifest.schema.json).
Proposed as the artifact that closes the span self-certification hole found
in review of the Stage A proposal: **spans are derived, never declared** —
but derivation and cross-check both need one wire format. This is it.

## Who emits what

| Manifest | Emitted by | Role |
| --- | --- | --- |
| `produced_by: "derived"` | The static gate (controller tooling), by diffing source and target code cells and classifying each differing region | **Authoritative.** The runtime oracle consumes this one. |
| `produced_by: "worker"` | The translating agent, written alongside its edit | **Cross-check only.** Compared span-for-span against the derived manifest. |

**Cross-check rule.** After canonical ordering (spans sorted by
`cell_index`, `source_span.start.line`, `source_span.start.col`), the two
manifests must be equal in every span field except metadata
(`produced_by`, `generator`, `created_at`). Both describe the same target
file, so even `target_span.text` must match — any disagreement means the
worker changed something it did not declare, or declared something it did
not change, and the gate fails. There is no "worker declared a superset"
pass state; that was the hole.

The `source.sha256` / `target.sha256` pair binds a manifest to exact
artifact bytes, so a stale manifest fails loudly instead of silently
gating the wrong files.

## Granularity rules

- **One span per maximal contiguous translatable text run.** In an
  f-string like `f"{'step':>4} {'sides':>9}"`, the segments `step` and
  `sides` are two spans; the literal space between them is unchanged code
  and appears in no span. Placeholders are never span content — they are
  recorded in the enclosing span's `placeholders` array so the gate can
  assert set-and-order equality.
- **Comments:** span text excludes `# ` (the marker and one space), so
  reformatting the marker is a code change outside all spans and fails
  the gate.
- **Strings:** span text excludes delimiters and prefixes (`f"…"`,
  `r'…'`). Changing quote style is a code change outside all spans.
- **Docstrings:** the full content is one span, kind `docstring`.
- **`kind: plot_label`** exists because plot labels route to the plot
  check (dimensions + non-blank fraction + thresholded pixel diff outside
  label regions), not to the text-output oracle. Misclassifying a
  `plot_label` as `display_string` would send figure bytes to the text
  differ; misclassifying the reverse would let a stdout string escape the
  text oracle. The derived extractor classifies by string destination
  (argument to a plotting call vs `print`), which is exactly the kind of
  mechanical judgment a differ can make for this catalog's plotting idiom
  (`mplot` trace dicts: `"name"` / `"title"` values are plot labels).

## How the oracle consumes it

1. **Text outputs** (`reaches_output: stdout` or `both`): mask — replace
   every occurrence of each span's `target_span.text` in the translated
   run's captured stdout with the corresponding `source_span.text`, then
   require byte-identity with the English run's stdout. Anything that
   survives masking is an undeclared difference and fails.
   Multi-line-interpolated strings are why masking keys on span *text*,
   not output line numbers.
2. **Plots** (`reaches_output: plot` or `both`): the figure for that cell
   is exempt from byte comparison and routed to the plot check; label text
   itself falls to spot-check, as the proposal's residue section says.
3. **`reaches_output: none`** spans (comments, docstrings) must produce
   *no* output difference; if the translated run's stdout differs in a
   region no stdout-span explains, the gate fails. The classification is
   itself runtime-checked: if any `none`-classified span's target text
   appears in captured stdout, the classification was wrong and the gate
   fails — the field is a checked claim, not a trusted one.
4. **`exclusions`** are subtracted before all of the above. They come from
   the determinism envelope (English run twice): any output region that
   disagrees between the two English runs must be either pinned in the
   workbook or recorded here with a reason. An exclusion is a deliberate,
   audited hole — the list is expected to be empty for compute-pi, and a
   non-empty list in any future workbook is a review item in its own
   right.

## Worked example (compute-pi, cell 1 "geometry", es)

Illustrative — positions counted per the schema (1-based, code-point
columns, exclusive end), against the English source cell:

```json
{
  "manifest_version": 1,
  "produced_by": "worker",
  "locale": "es",
  "source": { "path": "workbooks/en/compute-pi-workbook.srwb", "sha256": "<64 hex>" },
  "target": { "path": "workbooks/es/compute-pi-workbook.srwb", "sha256": "<64 hex>" },
  "spans": [
    {
      "cell_index": 1,
      "cell_name": "geometry",
      "kind": "comment",
      "source_span": {
        "start": { "line": 3, "col": 3 },
        "end":   { "line": 3, "col": 56 },
        "text": "Visualize the starting hexagon inside a unit circle."
      },
      "target_span": {
        "start": { "line": 3, "col": 3 },
        "end":   { "line": 3, "col": 62 },
        "text": "Visualiza el hexágono inicial dentro de un círculo unitario."
      },
      "reaches_output": "none",
      "placeholders": []
    },
    {
      "cell_index": 1,
      "cell_name": "geometry",
      "kind": "plot_label",
      "source_span": {
        "start": { "line": 8, "col": 68 },
        "end":   { "line": 8, "col": 80 },
        "text": "Unit circle"
      },
      "target_span": {
        "start": { "line": 8, "col": 68 },
        "end":   { "line": 8, "col": 85 },
        "text": "Círculo unitario"
      },
      "reaches_output": "plot",
      "placeholders": []
    }
  ],
  "exclusions": []
}
```

Note what the example demonstrates: a multi-code-point translation
(`Círculo`) is fine because columns count code points, not bytes; the
comment span excludes `# `; and the plot label never touches the text
oracle. A complete manifest for this workbook has roughly 27 spans across
cells 1–5 (exact count falls out of the derived extractor; the task file's
exhaustive list is its specification).

## Open questions — resolved in review (Fable, PR #2)

1. **Masking collisions — accepted with caveat; strengthening recorded.**
   At Stage A all non-span output must be byte-identical anyway, so a
   collision can only false-pass when a target span's text coincidentally
   appears in output that should have failed. Pilot scale: noted, move on.
   If it ever bites: *symmetric sentinel masking* — replace source-span
   texts in the English capture AND target-span texts in the translated
   capture with indexed sentinels (`⟦S3⟧`), then require identity. Same
   mechanics, collision-resistant.
2. **srwb vs ipynb positions — extractor README, not schema; join is
   keepends.** nbformat `source` lines keep their trailing `\n`, so the
   extractor joins with `''` (empty string) — joining with `\n` would
   double every newline. Pinned here rather than in the schema, as
   proposed; just with the right joint.
3. **`reaches_output` as a static claim — kept, because the oracle
   verifies it at runtime for free.** See the checked-claim rule added to
   "How the oracle consumes it", item 3: any `none`-classified span whose
   target text shows up in captured stdout fails the gate. The
   philosophical objection dissolves — the field was never trusted, only
   asserted.
