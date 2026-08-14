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

## The division of labor

| Role | Who | Pays with | Responsibility |
| --- | --- | --- | --- |
| Worker | Antigravity CLI (`agy`, Gemini Flash) | Gemini quota | Generates the translations, file by file, inside one repository |
| Supervisor | Claude subagent (Sonnet-class; Opus for the first pilot) | Claude tokens | Reviews every permission prompt the worker raises, one at a time; keeps an audit log |
| Controller | Claude (main session) | Claude tokens | Writes the task files, verifies every produced file, maintains the index, commits |
| Human | Repo owner | Attention | Privilege decisions (enabling agent mode, trusting the workspace) and final quality judgment |

The worker runs under the SciREPL-MCP broker's supervised terminal surface —
one named agent CLI on a PTY, no shell, every consequential action gated by
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
   in the repo root: the 15 files, per-format rules (srwb vs ipynb), the
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
