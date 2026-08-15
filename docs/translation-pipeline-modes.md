# Translation pipeline: the two modes

Settled 2026-08-15 (owner + Kimi discussion; supersedes neither — Mode A
remains the bulk default, Mode B layers on top).

## Mode A — mechanical (bulk default)

Worker proposes JSON (span translations by id, identifier glossary, keeps);
deterministic tools apply; gates certify; gate failures loop back to the
worker with exact error text. No agent edits workbook bytes. Two worker
calls per locale. This produced the entire v0.2.0 compute-pi corpus.

Strengths: cheap, auditable (same JSON → same bytes), failure shape is
*rejection before any byte changes*. Blind spot: the worker sees fragments
plus context lines, not the living document — and no pass sees RENDERED
output.

## Mode B — sandboxed contextual polish (quality pass)

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

Division of boundary authority (settled): the CONTROLLER imports the
working copy into the app and exports the result — two deterministic MCP
calls with hash receipts. The worker's tool surface is cells only; the
sandbox/filesystem crossing never belongs to the worker.
