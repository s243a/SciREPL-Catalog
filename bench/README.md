# Translation bench tooling

The executable half of the translation pipeline (docs/translation-process.md).
These scripts ran the entire Pass 2 campaign; they are committed so the
process is reproducible, not just described. Paths are currently
single-machine (the owner's bench: broker on 127.0.0.1:8088, token at
~/scirepl-broker/broker-token, repo at ~/Projects/SciREPL-Catalog) — adjust
the constants at the top of each script for another environment.

| Script | Role |
| --- | --- |
| `bench-pair.mjs` | Holds the SciREPL Pro PWA open in headless Chromium, paired to the MCP broker — the bench "device". Sets the bench consent/permission profile (incl. `scirepl_auto_download`, without which non-bundled kernels wedge headless). Run exactly ONE instance. |
| `mcp-run.mjs` | import → Run All → export one workbook through the broker `/mcp` surface. The bench's unit of runtime verification. |
| `agent-drive.mjs` | One-shot worker call over the broker `/agent` surface (headless agy). Used for draft/review/repair calls. |
| `term-drive.mjs` | Drive the broker `/term` PTY (supervised worker sessions — Mode B). |
| `run-translation.mjs` | The Pass 2 driver: one (workbook × locale) job end to end — worker draft + review, mechanical apply, all static gates, bench ×2, envelope, differential oracle, evidence + index bump. Repair loop feeds gate failures back to the worker. Never commits. |
| `reverify-locale.mjs` | Re-run the gate chain on an already-staged file (post-repair verification). |
| `fanout.sh` | Batch driver over locales × workbooks. Resumable (evidence dirs are done-markers), restores failed jobs to round-one state, commits greens per locale. |

Broker setup, security posture, and the agent/PTY surfaces are documented
in [SciREPL-MCP](https://github.com/s243a/SciREPL-MCP/blob/main/packages/broker/README.md) (see also
[configuration](https://github.com/s243a/SciREPL-MCP/blob/main/docs/configuration.md)).

Verification tools proper (span-lib/apply/derive/scan, output-oracle) live in
`tools/` and are covered by the fixture suites there.
