# How the translated editions are produced

Every non-English workbook in this catalog was produced by a supervised
multi-agent pipeline and verified mechanically before commit. This page
documents that first-pass process — what each agent does, what the gates
prove, and what the campaign cost — so future locale rounds (and future
maintainers) can repeat or improve it.

The quality caveat up front: this pipeline proves **structure**, not prose.
Every edition is machine-translated and awaits native-speaker review; the
[CHANGELOG](../CHANGELOG.md) tracks per-locale review status and the
terminology judgment calls each run flagged.

> **Which process is current?** Pass 2 ([below](#pass-2-code-level-translation-the-current-process))
> — two sequential phases: mechanical translation (Mode A), then contextual
> polish (Mode B). Pass 1 (markdown, PTY-supervised) is documented first for
> historical context and remains the reference for the supervision
> machinery, but new locale rounds follow Pass 2 (after the round-one
> markdown translation exists — Pass 2's gates assume code cells are
> byte-identical to the English source, which round one establishes).

## The division of labor

| Role | Who | Pays with | Responsibility |
| --- | --- | --- | --- |
| Worker | Antigravity CLI (`agy`, Gemini Flash) | Gemini quota | Generates the translations, file by file, inside one repository |
| Supervisor | Claude subagent (Sonnet-class; Opus for the first pilot) | Claude tokens | Reviews every permission prompt the worker raises, one at a time; keeps an audit log |
| Controller | Claude (main session) | Claude tokens | Writes the task files, verifies every produced file, maintains the index, commits |
| Human | Repo owner | Attention | Privilege decisions (enabling agent mode, trusting the workspace) and final quality judgment |

The worker runs under the SciREPL-MCP (Model Context Protocol) broker's
supervised terminal surface — one named agent CLI on a PTY
(pseudo-terminal), no shell, every consequential action gated by
an interactive permission prompt that the supervisor answers individually.
The pattern, its drivers, and its security posture are documented in
SciREPL-MCP:

- [Controlling a remote coding agent, with supervision](https://github.com/s243a/SciREPL-MCP/blob/main/docs/remote-agent-control.md)
  — the architecture, the review policy, and the post-compromise security
  framing
- [Supervised runs: resources, scaling, and the cost of review](https://github.com/s243a/SciREPL-MCP/blob/main/docs/supervision-resources-and-scaling.md)
  — the measurements behind the numbers quoted below
- [The supervisor skill template](https://github.com/s243a/SciREPL-MCP/blob/main/packages/broker/templates/remote-agent-supervisor-skill.md.template)
  — the controller-side rules, installable into a Claude Code skill directory

## The per-locale loop

1. **Task file.** The controller generates `.translation-task-<locale>.md`
   in the repo root: the 15 files, per-format rules (`.srwb`, the SciREPL
   WorkBook format, vs `.ipynb`), the
   hard constraints (only markdown translates; code cells byte-identical;
   cell names stay English — see the [README](../README.md) conventions),
   and the locale's terminology. Glossary terms are pulled from the SciREPL
   app's own UI catalogue for that locale, so workbook prose matches the
   interface the reader sees. Task files are deliberately self-contained:
   the repository, not any conversation, is the durable memory.
2. **Supervised session.** A supervisor subagent attaches to the worker's
   PTY, sends one line ("read the task file and carry it out"), and then
   reviews each permission prompt: never "always allow", never a partially
   hidden command, helper scripts read in full from disk before approval,
   writes only inside `workbooks/<locale>/`. Typical session: the worker
   writes four batch scripts covering 3–5 files each, runs each with its
   own verifier, then a full-corpus check — about 7 approvals total, all
   logged with verdicts and reasons.
3. **Controller verification.** After the supervisor reports, the
   controller runs [`tools/verify-translation.mjs`](../tools/verify-translation.mjs)
   over every en/locale file pair. The gate asserts the translation changed
   only what a translation may change: identical cell count/order/types,
   every non-markdown cell deep-equal to the source (code, outputs,
   execution counts, metadata — the executable surface), every markdown
   cell actually translated, container metadata untouched. Supplementary
   checks per locale: script presence (Hangul, Devanagari, Cyrillic, …)
   and, for Latin-script locales, distinctness from every sibling locale.
4. **Index and ship.** The controller adds one index entry per file with a
   localized name and description, runs
   [`tools/build-index.mjs`](../tools/build-index.mjs) to pin sha256/size
   for every artifact, updates the changelog, and commits. The worker never
   touches `scirepl-catalog.json` or git — single-writer index, controller-
   only commits.

Because the gate proves the executable surface is byte-identical, translated
editions require **no runtime re-testing** — the decisive economy of the
whole design.

## Why subagents: the token economics

The supervision loop is many small reads of a redrawing terminal — cheap
decisions, expensive context. Running it in the controller's own context
would spend top-tier tokens on screen redraws. Instead, each session's loop
runs in a disposable Claude Code subagent that reports back once, so the
controller's context pays for the *outcome* (a report plus an audit trail),
not the process. Verification and commits stay with the controller;
privilege changes stay with the human.

Measured over this campaign (12 locales, 180 items, ~120 individually
reviewed permission prompts, zero denials needed):

- Supervisor sessions cost ~68k–178k tokens each, trending to **~6k tokens
  per reviewed permission** at whole-locale scale.
- Controller marginal cost per locale was below one supervisor session —
  verification is script-driven, not read-through, and task files are
  generated.
- Worker-side cost: the full 11-locale run consumed roughly 1–2% of a
  weekly Gemini quota.
- Wall-clock per 15-file locale fell from ~39 minutes (first, fresh worker
  session) to ~6 minutes (eleventh, continued session) — worker session
  reuse was the largest single speedup, with the task-file design making
  restarts cheap when needed.

These figures are one campaign on one machine and one task type; they
saturate rather than extrapolate. See the
[scaling document](https://github.com/s243a/SciREPL-MCP/blob/main/docs/supervision-resources-and-scaling.md)
for the full tables and the caveats that keep them honest.

## Repeating the process for a new locale

1. Generate the task file (copy an existing one's structure; swap the
   glossary for the app's catalogue terms in the target locale).
2. Start the broker per the
   [supervision tutorial](https://github.com/s243a/SciREPL-MCP/blob/main/docs/remote-agent-control.md)
   (`BROKER_TERM_CMDS` naming one agent, workspace = this repo).
3. Run a supervisor per the skill template; keep its audit log.
4. Gate every file with `verify-translation.mjs`; add script-presence and
   distinctness checks appropriate to the locale.
5. Index with `build-index.mjs`, changelog, commit — controller only.
6. Recruit a native speaker; record their findings as `revision` bumps.

---

# Pass 2: code-level translation (the current process)

The section above documents the first pass (markdown, PTY-supervised
file editing — markdown is safe to translate with full-file context
because it has no execution surface). Pass 2 — which produced the v0.3.0
corpus — translates code-level prose (comments, strings, formatted
output, plot labels; for compute-pi also identifiers and cell names) and
runs in **two sequential phases**:

- **Phase 1 — Mechanical translation (Mode A)**: the propose/apply/verify
  pipeline below, in which no agent edits workbook bytes.
- **Phase 2 — Contextual polish (Mode B)**: a sandboxed full-context
  quality pass that runs **only after Phase 1's gates are green**.

**Why this order:** the mechanical phase intentionally limits the worker
to fragments plus context lines — its job is not quality, it is *safety*.
By restricting the worker to pre-identified prose spans and validating
every change mechanically, the gates prove the executable surface is
untouched before any full-context agent sees the workbook. The
full-context phase then cannot introduce execution-breaking changes even
if it errs, because it operates on a workbook the gates already certified
and every edit re-runs the same gate chain.

## Phase 1 — Mechanical translation (Mode A)

The worker deliberately sees fragments, not the living document:

1. **Candidates**: `tools/span-apply.mjs candidates <en-workbook>` emits
   every translatable position with a stable id, kind, width constraint,
   and its source line as word-sense context.
2. **Worker proposes** (two one-shot calls: draft, then review):
   `{"spans": {id: text}, "keeps": [ids], "suggestions": [...]}` — see
   [locale-policy.md](locale-policy.md) for what may translate and
   [translation-pipeline-modes.md](translation-pipeline-modes.md) for the
   Mode A/B design and worker access levels.
3. **Deterministic apply**: `span-apply apply` (and `apply-renames` for
   Stage B) — validates widths, quoting, escapes, format-spec integrity,
   U+FFFD hygiene; rejects rather than mangles.
4. **Static gates**: `span-derive` (structural identity / α-rename),
   `span-scan --lint` (completeness, with declared keeps as allows).
5. **Runtime gates** on the bench (`bench/`): import → Run All → export,
   twice (determinism envelope), then the **differential oracle**
   (`tools/output-oracle.mjs judge`) against the cached English baseline —
   byte-identical outside declared spans, with the tolerances documented
   in [field-lessons.md](field-lessons.md).
6. **Repair loop**: gate failures go back to the worker with the exact
   error text (max 2 rounds); integrity gates prevent un-translation.
7. **Evidence + index**: per-job `.pilot/<workbook>-<locale>/` (worker
   JSON, derived manifest, both post-run exports) and the item's
   `revision`/`sha256` bump. Batches commit per locale
   (`bench/fanout.sh`), release flow per [distribution.md](distribution.md).

One (workbook × locale) job = `node bench/run-translation.mjs <wb> <loc>`:
two worker calls plus bench time, no supervision required in Phase 1 —
the worker calls are one-shot JSON exchanges (`bench/agent-drive.mjs`),
not a supervised PTY session.

## Phase 2 — Contextual polish (Mode B)

Only after Phase 1 is green, a sandboxed worker imports the verified
workbook into the SciREPL Pro app, sees whole-workbook phrasing side by
side with the English source, inspects the **rendered** output (tables,
plots — which no Phase 1 step ever sees), and edits/re-runs/confirms
quality improvements in a live environment. The worker's own judgment is
a claim, not evidence: the supervisor exports the tab and re-runs the
FULL Phase 1 gate chain plus bench before anything is promoted — the
commit boundary is unchanged. "No changes needed" is an acceptable
outcome. The full specification (worker access levels, sandbox boundary,
headless TODO) is in
[translation-pipeline-modes.md](translation-pipeline-modes.md); the
field evidence for why this phase exists is the U+FFFD incident in
[field-lessons.md](field-lessons.md) — rendered-output inspection caught
corruption the fragment-based phase structurally could not see.

Content improvement ideas (in either phase) travel the escalation channel
to `.pilot/escalations.md` and, if accepted, change the ENGLISH source
and re-translate everywhere.

## Cross-repo references

Each stage runs on different machinery — the references are grouped by
which stage actually uses them:

- **Pass 1 (and Mode B's supervised sessions): remote-agent control** —
  the PTY worker/supervisor pattern:
  [tutorial](https://github.com/s243a/SciREPL-MCP/blob/main/docs/remote-agent-control.md) and
  [resources & scaling](https://github.com/s243a/SciREPL-MCP/blob/main/docs/supervision-resources-and-scaling.md)
  in SciREPL-MCP, plus the broker's
  [supervisor-skill template](https://github.com/s243a/SciREPL-MCP/blob/main/packages/broker/templates/remote-agent-supervisor-skill.md.template).
  Pass 2 **Phase 1 does not use PTY supervision**: its worker calls are
  one-shot JSON exchanges via `bench/agent-drive.mjs` (which talks to the
  broker's `/agent` surface, but without the interactive permission
  loop), and its gate chain is the local `tools/span-*.mjs` +
  `tools/output-oracle.mjs` toolset in **this repository**.
- **Pass 2 Phase 2 (Mode B): the sandboxed notebook tool surface** — the
  [scirepl-notebook skill template](https://github.com/s243a/SciREPL-MCP/blob/main/packages/broker/templates/scirepl-notebook-skill.md.template)
  and the cell-scoped MCP tools it documents; see
  [translation-pipeline-modes.md](translation-pipeline-modes.md).
- **The MCP broker** the bench drives:
  [README](https://github.com/s243a/SciREPL-MCP/blob/main/packages/broker/README.md),
  [protocol](https://github.com/s243a/SciREPL-MCP/blob/main/docs/protocol.md),
  [configuration](https://github.com/s243a/SciREPL-MCP/blob/main/docs/configuration.md), and
  [workbook file transfer](https://github.com/s243a/SciREPL-MCP/blob/main/docs/workbook-file-transfer.md)
  (the direct-to-file surface, SciREPL-MCP PR #7).
- **The notebook cell/tool surface** agents act on (why cell names are
  addressing identifiers): the app's notebook VFS
  ([www/js/notebook_vfs.js](https://github.com/s243a/SciREPL/blob/main/www/js/notebook_vfs.js)) in
  [SciREPL](https://github.com/s243a/SciREPL).
