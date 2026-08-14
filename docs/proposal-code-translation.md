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

| Kernel | Comments | Display strings | Identifiers | Status |
| --- | --- | --- | --- | --- |
| Python | yes | yes (changes outputs) | yes — Unicode identifiers incl. CJK-initial (PEP 3131) | **verified** (CPython probe; Pyodide is CPython) |
| JavaScript | yes | yes | yes — Unicode identifiers | **verified** (V8 probe; same engine as the browser) |
| R | yes | yes | mostly (locale-sensitive edge cases) | pilot probes in-app |
| Lua (Fengari) | yes | yes | **no — strictly ASCII**: CJK *and accented Latin* (`área`) are syntax errors | **verified** (fengari npm, the engine SciREPL loads) |
| Prolog | yes | yes | atoms in any script (`家族` works, incl. as predicate names); **CJK text parses as an atom, never a variable** — so a "CJK variable" fails as atom unification, not syntax; `_家族` (underscore-prefixed) is a legal variable workaround | **verified** (swipl probes) |
| TypR / ClojureScript | yes | likely | unknown | pilot probes in-app |

Verification method: local interpreter probes (python3, node, `fengari` from
npm — the same engine the app loads — and swipl). Pyodide is CPython and the
browser's JS is the same V8 family, so those results carry; R, TypR and
ClojureScript get probed in-app during the pilot. Practical consequences:
Stage C for Lua is comments/strings only in *every* locale (even Spanish
cannot rename `área`); for Prolog, CJK/Arabic locales can localize atoms and
predicate names but variables only via the `_…` form, which reads poorly —
another argument for deferring Stage C until testers ask for it.

## Stages

- **Stage A — comments + display strings.** Legal in every kernel, highest
  reader value per unit risk. Translated print/plot strings invalidate
  stored `.ipynb` outputs, so Stage A must build the core capability every
  later stage reuses: run the translated workbook in the real app and
  capture regenerated outputs.
- **Stage B — cell names.** The pass deferred from round one: translate the
  ~19 code-unreferenced names *and* the ~30 referenced ones together with
  their code references, provable only by execution. (Counts from a
  substring scan of cell names against all code cells, run 2026-08-13;
  rerun the scan before Stage B begins.) Prose mentions of renamed cells
  must be updated in the same change. Stage A has the same issue in
  miniature: markdown that *quotes output strings* diverges when the
  string is translated — the Stage A checklist includes syncing quoted
  outputs in prose.
- **Stage C — identifiers.** Per-kernel per the table; skip Lua, special-
  case Prolog variables — the real ceiling is Python/JS/R only. Deferred
  until native-tester demand, **per-locale opt-in, with a precondition and
  a kill criterion** (review): any locale shipping Stage C must maintain a
  bidirectional English↔localized identifier map, or upstream English
  fixes stop propagating mechanically and cross-locale greppability dies
  (a user quoting a localized identifier in a bug report becomes
  unfindable). If the map cannot be maintained, Stage C is killed for
  that locale, not deferred.

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
  everything else — with the side-door exception below: VFS reads of
  kernel-written files are export-class, not baseline reads.
- **Cross-channel rules (review).** Two connections invite laundering:
  content written via the PTY side (reviewed as a file write) becoming an
  MCP-side import source. Closed by construction: import sources may come
  only from the broker-allowlisted directory, whose contents are
  broker-written exports and controller-placed files — never
  worker-written files. And the two permission layers (supervisor policy,
  app device permissions) are independent verdicts on one action:
  **most-restrictive wins**, and both layers' verdicts land in a single
  ordered audit timeline keyed by a shared session id — without which
  "what did the worker actually do" cannot be reconstructed across
  channels, defeating the audit log's purpose.

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
- **The side door (review finding)**: the same backdoor composes with the
  "benign" read-only VFS tools — kernel code writes a file into the
  browser VFS, then `read_file` walks it out. The baseline policy of
  approving all reads misses this. Rule: **VFS reads of kernel-written
  files are export-class operations**, judged under export policy, not
  read policy. Practically: the supervisor tracks which paths kernel code
  has written this session and escalates reads of them.

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

### Need vs should: the direct-to-file variant

Returning serialized bytes over MCP (above) routes the full content through
the agent's context — supervisable in-channel, but expensive in tokens at
scale. A third design writes the export **directly to a file the agent
never carries**:

| Design | Token cost | Supervision |
| --- | --- | --- |
| Readback + agent serializes | high | full, in-channel |
| `export_workbook` returns bytes | high | full, in-channel |
| Direct-to-file (broker sink) | ~zero (receipt only) | shifted on-disk |

In the direct variant the browser app still cannot touch host files; the
**broker** intercepts the export payload and writes it into an allowlisted
directory in the agent workspace, returning only a receipt to the agent.
The receipt must be **evidence, not a claim** (review): sha256 computed by
re-reading the file after write and fsync (hashing the inbound payload
misses truncation); bound to the tool-call id, notebook identity/revision,
and timestamp so a stale receipt is distinguishable; the path proven
canonical inside the allowlist (symlinks resolved, `..` rejected) with the
allowlist constraining extension as well as directory; and **dual-logged**
— the broker writes the same hash to its own audit channel the agent
cannot touch, and on-disk review trusts the broker log, never the agent's
copy. Import mirrors all of it: same allowlist, and the broker logs the
hash of what it streamed *in*, so the audit trail proves which bytes
entered the app.
Supervision relocates rather than degrades: the supervisor reviews the
artifact on disk, exactly the scratch-script pattern already codified as
policy rule 3. The gating stack: the app permission class decides *whether*
an agent may export; a broker-side directory allowlist decides *where*;
the supervisor and the verification gate decide *what* is acceptable.

Classification: designs 1–2 are the **need** (the pilot runs on them);
design 3 is the **should**, justified by token economics once the process
scales past a pilot (15 workbooks × 12 locales of round-tripped notebook
content through an agent context is real cost). Import has the same split:
a broker-side file *source* (agent names an allowlisted path; broker
streams it to the app) is the token-cheap "should" over reconstruction.

## Verification economics: who verifies, and what it costs

A tempting trade — let the worker verify via its own Playwright access
(cheap tokens, weak sandbox) versus the supervisor verifying (expensive
tokens, stronger trust) — hides the option that dominates both:
**authoritative verification should be deterministic code, invoked by the
controller, entering no agent's context at all.** The static gate
(`verify-translation.mjs`) already works this way; Stage A's runtime check
should too — a run-all-and-capture Playwright script in the shape of the
app's own release suites, whose token cost is a verdict line regardless of
content size.

| Who verifies | Token cost | Trust |
| --- | --- | --- |
| Worker, via its own browser access | low | weakest twice over: full browser in the least-trusted hands, and self-verification is a claim, not a check |
| Supervisor, via tools | high | medium — agent tokens spent on what a script does better |
| Deterministic harness, controller-invoked | ~zero | strongest — only the verdict enters a context |

A script verifies correctness exactly as far as it has an **oracle**, and
no further — "ran without error cells" is the weakest oracle, not
correctness. Stage A has a strong one: the English original's outputs.
Because only comments and display strings change, a correct translated run
must produce outputs **identical to the English outputs except within the
known translated string spans** — numbers exact, structure exact, every
diff inside a fragment mechanically derived from the static code-cell
diff (see the hardenings below — spans are never self-certified). That
differential check is mechanical and catches computation-breaking
translation errors (mangled format strings, shifted quotes) outright.
Four hardenings (from review) make the oracle trustworthy:

- **Determinism envelope.** The English run must pass its own oracle
  first: run it twice, diff, and only outputs stable across both runs are
  oracle-eligible. Nondeterministic channels — unseeded RNG, timestamps,
  async completion order, stream interleaving — are either pinned in the
  workbook (seeds) or excluded from the oracle by the manifest. A
  workbook whose English runs disagree cannot gate a translation.
- **Runtime-locale pinning.** `toLocaleString`, `Intl.*`, and date
  formatting follow the *browser environment's* locale, not the
  workbook's language — identical code diverges across machines with no
  translation error at all. The bench pins browser locale and timezone
  identically for baseline and translated runs.
- **Spans are derived, never self-certified.** The static gate diff of
  the code cells mechanically derives the changed comment/string spans;
  that derived manifest is what the runtime oracle consumes.
  Worker-declared spans are at most a cross-check. This closes the hole
  where a lazy or compromised worker hides errors by over-declaring, and
  gives the regression property for free: gate v2 rejects everything v1
  rejects outside the derived spans.
- **Placeholder integrity.** Within translated strings, the placeholder
  set (`{name}`, `%s`, printf codes) must be equal between source and
  translation — checked statically, catching the most common i18n break
  before execution is even needed.

The oracle's edges define the residue: plot images — where "a plot
rendered" is too weak; check dimensions plus non-blank pixel fraction,
then pixel-diff against the English raster with a threshold outside the
declared label regions, keeping everything but the labels inside the
mechanical oracle (noting even untranslated plots drift byte-wise via
font rasterization) — translation quality itself (native review, as
ever), and Stages B/C, where code changes weaken "identical modulo spans"
toward "same numeric results".

Worker *self-checks* remain valuable as an inner loop (the worker already
writes and runs its own verify scripts, catching errors before they cost a
supervision round-trip) — cheap precisely because they are also
script-shaped, and never authoritative. The full stack: worker self-checks
(fast, non-authoritative) → mechanical gate (authoritative, token-free) →
agent judgment only for the residue that genuinely cannot be scripted, with
that residue assigned to a trust tier proportional to the stakes.

## Replicating without Pro

The `/app` MCP surface requires SciREPL Pro's Remote bridge, which the Free
app does not have. Anyone reproducing this pipeline on the Free PWA swaps
the app surface for SciREPL-MCP's other package — the
[Playwright driver](https://github.com/s243a/SciREPL-MCP/tree/main/packages/playwright-driver),
itself an MCP server that launches or attaches Chromium and drives the real
UI (local or hosted PWA). Trade-offs: UI-level rather than semantic tools,
and no app-side permission layer — the browser session is fully driveable,
so the sandbox becomes a throwaway browser profile rather than app-enforced
write scopes. The cheapest tier drops interactive supervision of app
actions entirely and verifies programmatically (load workbook, Run All,
assert no error cells, compare outputs — the shape of SciREPL's own
Playwright suites). That is proportionate rather than weak: executing a
workbook in the Free PWA mutates only a browser profile, and a small blast
radius justifies a light control. Multi-app brokering (one broker, several
paired apps) is not currently supported and is not needed for any of these
paths; a Pro user wanting two paired apps runs two brokers on two ports.

## Generalization economics

The pilot's hand-built artifacts (the exhaustive span list, width
constraints, no-translate traps) are **specifications for generators, not
the working form** — the same trajectory as round one, where a bespoke
pilot prompt became `gen-task.mjs` and eleven locales then ran at ~7
minutes each. Concretely: the completeness linter run in reverse *is* the
span-list generator (every comment/docstring/prose-like string, classified
by destination); width constraints are read out of the format specs
mechanically (`{'step':>4}` contains the 4); traps become scanner
heuristics seeded by the pilot's cases. Per-workbook human/model effort
drops from authoring a list to reviewing a generated one — and the list is
per-workbook, not per-locale, so 15 reviews serve all 180 artifacts.

**Success criterion (testable):** workbook #2's task file must be ≥90%
generated. If it still needs hand-authoring at pilot fidelity, the design
does not generalize and gets rethought before scaling.

## Pilot deliverables (beyond the artifact)

- The Stage A harness: determinism envelope, locale-pinned bench, derived
  span manifest, differential output gate, plot checks.
- A **headless-runnability inventory**: which of the 15 workbooks Run All
  cleanly without interaction or long compute — the scaling
  prerequisite the pilot is positioned to produce cheaply.
- Version pinning: record probe-interpreter and shipped-engine versions
  (Pyodide/CPython, Fengari, swipl) so the kernel-table claims stay
  auditable as engines move.
- A verdict on reconstruction vs first-class import/export before scaling.

## Pilot

One workbook (compute-pi), one locale (es), Stage A only: agy translates
comments + strings under PTY supervision; reconstruct-or-import into the
paired Pro PWA; `run_cells`; readback; gate v2; regenerated outputs
committed as `revision: 2` of the catalog item. The pilot's deliverable is
the harness as much as the artifact — and a precise answer to whether
reconstruction suffices or the first-class tools are needed before scaling.
