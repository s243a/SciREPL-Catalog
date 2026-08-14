# Proposal: second-pass translation — code content, verified by execution

**Status:** design. Nothing here is implemented. The first pass
([translation-process.md](translation-process.md)) translated only markdown
and was verified statically, because its executable surface stayed
byte-identical. This second pass translates *code content* — cell names,
comments, display strings, and (selectively) identifiers — which inverts the
verification model: **runtime execution becomes the gate**, not an exemption.

## What can be translated, per kernel

Keywords are not localizable in any shipped language (`def`, `for`, `if`
stay English — a fact of the languages, not a choice). The translatable
ceiling varies by kernel:

| Kernel | Comments | Display strings | Identifiers |
| --- | --- | --- | --- |
| Python | yes | yes (changes outputs) | yes — Unicode identifiers legal (PEP 3131) |
| JavaScript | yes | yes | yes |
| R | yes | yes | mostly (locale-sensitive edge cases) |
| Lua (Fengari) | yes | yes | **no — ASCII-only identifiers** |
| Prolog | yes | yes | atoms yes; variables must start uppercase, so caseless scripts (CJK, Arabic) need `V_…` workarounds |
| TypR / ClojureScript | yes | likely | probe empirically before relying on it |

## Stages

- **Stage A — comments + display strings.** Legal in every kernel, highest
  reader value per unit risk. Translated print/plot strings invalidate
  stored `.ipynb` outputs, so Stage A must build the core capability every
  later stage reuses: run the translated workbook in the real app and
  capture regenerated outputs.
- **Stage B — cell names.** The pass deferred from round one: translate the
  ~19 code-unreferenced names *and* the ~30 referenced ones together with
  their code references, provable only by execution. Prose mentions of
  renamed cells must be updated in the same change.
- **Stage C — identifiers.** Per-kernel per the table; skip Lua, special-
  case Prolog variables. Deferred until native-tester feedback shows demand
  — many programming communities prefer English identifiers, and this stage
  is the most invasive for the least certain benefit.

Each stage gets a gate revision: `verify-translation.mjs` relaxes
deep-equality exactly where the stage permits (Stage A: comment/string
spans and outputs may differ; all other code frozen) and adds a runtime
criterion — Run All completes without error cells and outputs regenerate.

## Architecture: two MCP connections, three agents

```
supervisor (Claude subagent)
    │  broker /term (PTY) — reviews every permission prompt
    ▼
worker (agy / Gemini) ────────► broker /mcp ────────► SciREPL Pro app
    two connections: controlled     mcp__scirepl__*        (kernel host;
    via the PTY, and itself an      cell + run tools       device permissions
    MCP client of the app           app-permission-gated   authoritative)

controller (Claude main session): gate v2, artifact reassembly, commits
Claude subagent + Playwright driver: visual/regression checks on the PWA
                                     (rendering, RTL, badges)
```

- The worker holds **two connections through the same broker**: it is
  *controlled* through the supervised PTY (per-prompt review, audit log, as
  in round one) and is itself an *MCP client* of the app for
  reconstruct/run/readback. Its tool calls are gated twice: by the
  supervisor's policy and by the app's own device permissions (Review mode,
  write scope, per-kernel rules — authoritative, per the
  [notebook skill](https://github.com/s243a/SciREPL-MCP/blob/main/packages/broker/templates/scirepl-notebook-skill.md.template)).
- The app must be **SciREPL Pro** (only Pro has the Remote bridge that
  connects outward to the broker), served as a local PWA for the test bench
  — not distributed, just `node server.js` in the Pro repo and a desktop
  browser tab that stays paired for the session.
- Supervision policy gains one prompt class: MCP tool calls. Baseline:
  approve `list_cells`/`read_*`/`create_cell`/`write_cell`/`rename_cell`/
  `run_cells`/`execute_cell` against the workbook under test; deny
  `execute_cell` payloads that perform file I/O (see below); deny
  everything else.

## Import/export over MCP

The current tool surface (`list_cells`, `read_cell(s)`, `write_cell`,
`create_cell`, `rename_cell`, `execute_cell`, `run_cells`,
`inspect_namespace`, read-only VFS: `list_dir`, `read_file`, `grep`) has no
first-class workbook import/export. Observations:

- **Readback ≈ export already.** `read_cells` after `run_cells` returns
  full notebook state including fresh outputs; the agent can serialize that
  to `.srwb`/`.ipynb` in its own workspace. What is missing is only a
  guarantee of *format fidelity* (key order, indentation, output encoding)
  — the difference between "the data is available" and "the artifact is
  reproducible".
- **Import by reconstruction works today**: `create_cell` per cell in
  order, `rename_cell` for named cells. Auditable (one tool call per cell)
  but chatty and lossy for container metadata.
- **The backdoor to decline**: `execute_cell` can run kernel code that does
  arbitrary VFS I/O, smuggling import/export through code. Policy: file-
  shaped operations happen via tools, never via kernel code — otherwise the
  tool-level auditability that motivated MCP is dissolved.

Proposed addition — a first-class pair, permission-gated separately:

- `export_workbook` → returns the current notebook serialized in canonical
  `.srwb` or `.ipynb` form (exact bytes the app itself would save). The
  serialized content travels over MCP; **the file lands wherever the agent
  writes it — its own workspace — never on the app's filesystem.** Export
  is thus data egress only, scoped by where the receiving agent may write
  (the broker workspace, enforced by existing supervisor policy).
- `import_workbook` → replaces/creates the open notebook from serialized
  content in one call. Higher risk than export (it *changes* app state), so
  it sits behind the same new permission and respects Review mode.
- **A separate app permission class** ("Workbook import/export") distinct
  from cell-edit permission, off by default, so a device owner can allow
  cell-level agent work without allowing wholesale notebook replacement.

Whether the canonical serializer lives in the app (ToolCore) or the MCP
layer is an implementation question for the app team; the app already owns
save/load, which argues for ToolCore with the broker as a pure relay.

## Pilot

One workbook (compute-pi), one locale (es), Stage A only: agy translates
comments + strings under PTY supervision; reconstruct-or-import into the
paired Pro PWA; `run_cells`; readback; gate v2; regenerated outputs
committed as `revision: 2` of the catalog item. The pilot's deliverable is
the harness as much as the artifact — and a precise answer to whether
reconstruction suffices or the first-class tools are needed before scaling.
