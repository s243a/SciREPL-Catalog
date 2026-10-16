# Translation pipelines: workbook modes and tutorial sections

Choose a workflow by content, not by a single universal batch format. The
[method-selection guide](translation-process.md#choose-the-method-for-the-content)
distinguishes keyed app UI catalogues, executable workbooks and static web
tutorials. Mode A/B below remains the **workbook** workflow; the
[tutorial section-conversation method](#section-conversation-translation-for-static-tutorials)
is a separate option for prose-heavy pages.

Settled 2026-08-15 (owner + Kimi discussion). Mode A and Mode B are not
alternatives: they are **Phase 1 and Phase 2 of Pass 2**, run
sequentially. Mode A does the bulk mechanical translation and its gates
must be green before Mode B — the full-context quality pass — touches the
workbook. The phase ordering and its rationale (mechanical gating bounds
the execution-error surface before any full-context agent sees the
workbook) are documented in
[translation-process.md](translation-process.md).

## Mode A — mechanical (Phase 1 of Pass 2, bulk default)

Worker proposes JSON (span translations by id, identifier glossary, keeps);
deterministic tools apply; gates certify; gate failures loop back to the
worker with exact error text. No agent edits workbook bytes. Two worker
calls per locale. This produced the entire v0.2.0 compute-pi corpus.

Strengths: cheap, auditable (same JSON → same bytes), failure shape is
*rejection before any byte changes*. Blind spot: the worker sees fragments
plus context lines, not the living document — and nothing in this phase
sees RENDERED output. That blind spot is deliberate (safety over quality)
and is what Phase 2 exists to cover: **after Mode A's gates are green,
proceed to Mode B (Phase 2 of Pass 2) for contextual polish.**

## Mode B — sandboxed contextual polish (Phase 2 of Pass 2)

Runs AFTER Mode A's gates are green, on top of the verified baseline:

1. The supervisor imports the green workbook into the SciREPL Pro bench —
   the app tab is the WORKING COPY; the canonical file is never touched.
2. The worker process runs on the PC, but its EFFECTS are sandboxed in the
   browser: every cell read/write/execute travels over the MCP connection
   and lands inside the Pro app's sandbox, and permissioning happens at
   that MCP boundary (supervised per-call today; scoped auto-approval once
   the owner grants the worker standing MCP allow-rules). The worker sees
   whole-workbook phrasing side by side, inspects the rendered tables and
   plots, edits a cell, re-runs it, and confirms its own fix — the
   edit-test loop the mechanical mode structurally lacks.
3. Scope bound (in the task prompt): translation quality ONLY — the gate
   diff must still show only span-level changes; "no changes needed" is an
   explicitly acceptable outcome.
4. Hand-back: the supervisor exports the tab, diffs against the baseline,
   and re-runs the FULL gate chain + bench. The worker's own testing is a
   claim, not evidence — certification stays deterministic and
   supervisor-owned. Green → promote to the canonical path and bump the
   item revision; not green → the baseline stands.

Division of labor: bulk translation by cheap JSON draft; judgment by the
sandboxed worker with full context and rendered output; certification by
gates that trust nothing.

## Why writes stay inside the sandbox

The commit boundary is the enforcement point. Whatever happens in the tab,
nothing reaches the repo except an export that passes the same gates as
Mode A output. Write access inside the sandbox widens what the worker can
*try*, not what can *land*.

## TODO (side quest, owner decision pending)

Headless Mode B via scoped auto-approval: add standing allow-rules for the
cell-scoped scirepl MCP tools (list_cells, read_cell/s, write_cell,
execute_cell, inspect_namespace — NOT export/import/file tools) to agy's
own permissions config. Removes the per-call supervision cost; the
supervised PTY mode works today and remains the default until reviewed.

Division of boundary authority: the DEFAULT is that the CONTROLLER imports
the working copy into the app and exports the result — two deterministic
MCP calls with hash receipts; the worker's tool surface is cells only.
A worker WITH import/export capability is a documented ALTERNATIVE (it can
then fetch reference material or stage its own working copies), guarded by
three independent layers: the supervisor's per-call approvals, the MCP
broker's file-scope permissions (allowlisted roots, deny rules,
content-size caps), and the app's own permission gate on workbook
transfer. Least authority argues for the default; the alternative is a
policy choice, not a design violation.

## Improvement suggestions (escalation channel)

Translators read workbooks more closely than anyone; they will spot real
improvements (unclear explanations, pedagogy, outright bugs). These are OUT
OF SCOPE for translation edits — a locale that "fixes" content diverges
from the English source and fails the derive gate by design. The
legitimate path is escalation:

- **Mode A**: the worker's JSON may include an optional
  `"suggestions": [{"cell": n, "note": "..."}]` field. The controller
  stores it in the locale's evidence dir and surfaces it in reports.
  Suggestions never gate and never modify any file.
- **Mode B**: the worker's final report includes an observations section;
  the supervisor relays it verbatim.
- The controller aggregates suggestions across locales (the same issue
  spotted by three translators is a strong signal) and raises them to the
  owner. Accepted ones change the ENGLISH source, then re-translate to all
  locales — improvements propagate everywhere or nowhere.

### Narrow source-maintenance exception: Markov Stage 4

The owner-approved `--refresh-markdown-cell stage4` path sends only three
new English Markdown fields for one draft and one fresh review, with no
repair loop. It does not send or translate the prior lesson, Python,
comments, output labels, or SVGs. Math, inline code, numbers, English
residue, and locale scripts remain gated. A controller proposal is allowed
only after a recorded failure of that bounded model run.

Deterministic application is pinned to the previously reviewed predecessor
`017ea7eed65a9dc7875aa5b8c59df489114facbd`: the old `random_walk` cell is
split into `transition_matrix`, `sticker_step`, and `random_walk`, each
preceded by its new explanation. Only the matrix's compact sum becomes the
equivalent copied-identity loop. Existing localized comments and output
labels remain byte-identical, and the intro receives only the two new
inline-code run-order tokens. All other prior content and metadata stay
frozen. Static translation receipts do not claim browser/runtime review;
the independent offline NumPy and rendered checks remain controller-owned.

After translation, the Arabic edition alone receives four exact, reversible
`dir="ltr"` containers around its unchanged display equations. This is a
controller rendering correction, not model-approved HTML or a prose rewrite:
the pre-wrapper generation snapshot/hash is retained, no further model
request is made, and final checks require RTL prose with LTR math.

The subsequent owner-requested probability clarification is a separate,
controller-authored update pinned to `1d8e5fd1e0a3c1970cf87947697b724ee5dd5501`.
It replaces only the `sticker_bridge` explanation in all 13 editions, making
the general update and one-hot-at-j condition explicit and distinguishing
position indices from sticker labels. No model request is made; all code and
other Markdown remain unchanged. The completed Stage 4 campaign and its
four-formula rendering reports stay historical, with separate current
clarification receipts and native-language review still pending.

A final scoped clarity pass pins the completed probability clarification at
`f5958682ec637e7e7bd6470d84d489b9d267c982`. Seven controller-authored localized
paragraphs clarify entry meanings, independently explain stochasticity and
symmetry, list the per-move destinations, give the whole-cube convergence
conditions, and append a question-5 hint about the 24 corner-sticker positions.
Only Markdown cells 6, 8, 10 and 12 change; all Python, four display equations,
other content and metadata remain exact. This pass makes zero model requests
and does not claim model approval or native-speaker review. Every completed
translation campaign and prior rendering/runtime receipt stays historical;
separate clarity receipts bind fresh final-byte rendering and NumPy checks.

## Mode B inputs: give the polisher both versions

The polish prompt should include the ENGLISH source cells alongside the
loaded translated workbook (the worker reads the translation live in the
app; the English rides in the prompt as reference). Judging a translation
means comparing it to what it translates — without the source, the polisher
can only assess fluency, not fidelity.

## Worker access levels (both documented, owner's choice per run)

1. **MCP-only (locked default)**: the dedicated MCP-host workspace pattern —
   an empty trusted directory holding only `.agents/mcp_config.json`; file
   tools have nothing meaningful to reach; every scirepl MCP call is
   Ask-mode under the supervisor. Strongest containment; the worker sees
   only what the prompt and the cell tools give it.
2. **Workspace file access (opt-in)**: trust a working directory containing
   reference material (e.g., the English workbook, prior locales). Richer
   self-served context at the cost of prompt-free file reads (and, in
   headless mode, writes) inside that directory. Safeguards remain layered:
   supervisor per-call approvals on MCP tools, the broker's file-scope
   permissions (allowlisted roots, deny rules, size caps), and the app's
   own permission gate — plus deny-first rules in the worker's settings
   (`~/.ssh`, configs, the catalog repo) per the hardening notes.

Either way, the commit boundary is unchanged: exports re-run the full gate
chain before anything reaches the repo.

## Section-conversation translation for static tutorials

Use this for prose-heavy static help pages. It does not require a workbook
import, an app runtime locale catalogue, a broker or an agent editing files.
The controller sends sanitized content to AGY and renders validated results
as static pages such as `/help/fr/workbooks/import/`.

### Batch by meaning; retain page context

1. Freeze the English page and its glossary. Protect code, mathematical
   expressions, URLs and exact app-setting names with controller-validated
   placeholders; identify alt text and captions as translatable prose.
2. Start a fresh **draft conversation for one page and one locale**. Send
   its title, relevant app glossary and the first coherent section. Translate
   very short pages in one shot; group adjacent small sections rather than
   creating per-heading calls.
3. Save the returned `conversation_id`. Send each subsequent section with
   **`--conversation <conversation_id>`**, appending to that same drafting
   conversation. Do not use `--continue`: it selects the most recent chat,
   which is ambiguous when other pages, locales or jobs run concurrently.
4. Review the complete assembled page against English in a **fresh,
   independent review conversation**. Long reviews can also proceed by
   coherent sections in that review conversation, but never reuse the draft
   conversation as the reviewer. Resolve consistency across headings, body,
   captions, notes and actual UI labels, not just isolated fragments.
5. Deterministically apply accepted text to the frozen structure, render
   `/help/<locale>/<page>/`, and verify protected content, links, language
   switching, right-to-left layout, screenshots, mathematics and mobile
   readability. Translation acceptance is not publication or release
   clearance; machine review is not native-speaker approval.

Explicit continuation supplies useful context, not durable source authority:
the controller's frozen source, accepted translations and receipts remain
the recoverable record. A conversation ID identifies a chat; it does not
prove that a response is complete or correct. Detect a changed conversation
identity rather than silently starting over. Keep session IDs and raw
provider records private; publish only suitable provenance and status.

### Long requests and authority

Run model calls under a durable background owner and poll status without
launching more work. In the verified AGY interface, `--print-timeout 0s`
waits for the turn to finish: it does **not** mean immediate cancellation.
Avoid a short completion timeout merely because a section takes time.
Retain explicit cancellation, concurrency and response-size limits, require
the final success envelope and validation, and do not retry a consumed or
ambiguous request automatically. Keep accepted translations and successful
drafts when migrating from an earlier batch plan.

This method needs text-in / structured-text-out calls, **not** model-driven
shell, file-editing or MCP tool calls. Restrict the worker's actual
workspace, sandbox and tool permissions accordingly. A prompt saying
"do not use tools" is not a security boundary, and `0s` is not permission
for unlimited spending, retries or unrelated actions.

### Why this differs from the earlier small batches

Early tutorial runs used many tiny, independent fragment batches as a
workaround for short request deadlines. Removing that deadline avoids the
need to sacrifice page context or pay draft/review overhead per tiny batch.
Section-sized continuation keeps terminology in context while retaining
deterministic protection of executable examples. This does not justify
removing the workbook runtime gates or replacing the app's keyed UI strings
with whole-page HTML translation.

Implementation status: a three-call live canary verified continuation,
retained context and independent review. It did not exercise the full
production migration or establish that all tutorial pages are translated,
validated or published. Verify the implementation and current campaign
status before claiming those outcomes.

## Cross-repo references

Mode B's supervised sessions run on SciREPL-MCP's remote-agent control
surface: [tutorial](https://github.com/s243a/SciREPL-MCP/blob/main/docs/remote-agent-control.md),
[agent context](https://github.com/s243a/SciREPL-MCP/blob/main/docs/agent-context.md),
[resources & scaling](https://github.com/s243a/SciREPL-MCP/blob/main/docs/supervision-resources-and-scaling.md).
The sandbox boundary is the app's MCP tool surface (see the
[scirepl-notebook skill template](https://github.com/s243a/SciREPL-MCP/blob/main/packages/broker/templates/scirepl-notebook-skill.md.template)
the broker installs into agent workspaces). Worker import/export as a
guarded alternative rides the broker's
[workbook file transfer](https://github.com/s243a/SciREPL-MCP/blob/main/docs/workbook-file-transfer.md) permissions.
