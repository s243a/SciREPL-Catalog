# Verdict — compute-pi → de (full translation, one-shot pipeline)

**PASS**, 2026-08-14. First locale through the fully mechanical pipeline:
ONE worker call (agy one-shot: 29 span translations + 13 explicit keeps +
25 renames + 5 cell names as strict JSON) → span-apply → apply-renames →
static gates (derive --allow-renames: 34 spans, 24 renames / 94
occurrences; lint clean with declared keeps) → bench ×2 (envelope stable)
→ differential oracle PASS vs the en baseline → plot check (Einheitskreis /
Einbeschriebenes Sechseck, no English leftovers).

No supervised session, no agent file edits. agy's keeps were exactly the
Plotly API keys the candidate enumerator over-offers plus ' < pi < ' and
'd' — worker-declared keeps feed the lint --allow list directly.

Pipeline validation: span-apply reconstructs the runtime-verified es
Stage A translation byte-identically from its 29-entry map.
