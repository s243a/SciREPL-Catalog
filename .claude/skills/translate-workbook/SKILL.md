---
name: translate-workbook
description: Run the Pass 2 translation pipeline for a (workbook, locale) pair — worker proposals, mechanical apply, full gate chain, runtime verification on the SciREPL bench.
---

# Translate a workbook edition

Full background: docs/translation-process.md (process),
docs/locale-policy.md (what may translate, per-script identifier policy,
the Arabic exception), docs/field-lessons.md (known failure modes),
bench/README.md (tooling).

## Preconditions

- Bench up: MCP broker (workspace-managed, `/agent` enabled) paired to the
  headless SciREPL Pro app — exactly one `bench/bench-pair.mjs` instance.
  Health check must include the TOOL LIST, not just `ok`.
- Target file `workbooks/<locale>/<wb>` exists with code cells
  byte-identical to `workbooks/en/<wb>` (round-one state). If a previous
  failed run staged changes, `git checkout` the file first.

## Run

    node bench/run-translation.mjs <workbook-file> <locale>

Green means every gate passed and evidence + index are staged (never
committed by the driver). Batches: edit the locale/workbook lists in
`bench/fanout.sh` — it is resumable, restores failed jobs, and commits
greens per locale.

## When a job fails

Read the failing stage in the job log (`jobs/<wb>-<locale>/` under the
bench scratch dir). Match the symptom against docs/field-lessons.md before
inventing a diagnosis — most classes are already known and guarded.
Genuine worker stubbornness on a single candidate may be resolved by
controller adjudication: add the id to `keeps` in the job's
`translations.worker.json`, rerun the mechanical steps, and record the
adjudication in the evidence. Never hand-edit workbook content directly;
never commit a job whose oracle did not pass.

## After

Aggregate any `suggestions.json` into `.pilot/escalations.md` (owner
decides; accepted fixes land in the EN source only). Release flow:
docs/distribution.md.
