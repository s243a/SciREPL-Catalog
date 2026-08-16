# Field lessons: every bug the translation campaign found

The Pass 2 campaign (15 workbooks × 12 locales, 7 kernels) was run gate-
first: nothing shipped unverified, so every defect below was caught by a
gate, diagnosed, fixed, and locked with a fixture before the corpus grew
past it. This page is the honest record — symptom, root cause, fix — so the
next campaign starts where this one ended. Guards live in `tools/` (100+
fixture assertions); incidents reference the class of guard added.

## Transport and encoding

**U+FFFD mojibake across 10 locales (the big one).** Symptom: single
characters destroyed mid-word (`côtés` → `côt��s`) in 24 places, found
only when the first Mode B polish pass read a rendered French table.
Root cause: the MCP broker decoded agent stdout per-chunk
(`buf.toString()`), so a multi-byte UTF-8 character split across OS chunk
boundaries became replacement characters — and *self-consistent corruption
is invisible to the differential oracle by design* (the manifest and the
output carry the same corrupted bytes). Fixes: upstream, incremental
decoding in the broker (SciREPL-MCP #9, `setEncoding('utf8')`); locally,
U+FFFD is now rejected at four layers — span-apply and apply-renames at
proposal time, span-derive at the gate, and build-pages refuses to publish
it. Lesson: **an oracle that verifies consistency cannot see consistent
corruption; put byte-hygiene checks at every boundary.**

**NFC is not a validity test.** Bengali ড় is composition-excluded: its NFC
form is decomposed, so "reject non-NFC input" rejected correct Bengali.
Tools now normalize instead of rejecting (see locale-policy.md).

## Lexing (where every kernel taught us something)

**The tutorials' "heredoc problem" that wasn't.** The three bash+Prolog
tutorials failed with `Syntax error: End of file in quoted atom` and were
initially diagnosed as bash-heredoc-embedded-Prolog needing embedded-
language lexing. The real cause was mundane: their cells carry **no
per-cell language metadata**, the language fell back to Python, and the
Python lexer read Prolog atoms (`'family.pl'`) and prose apostrophes
(`Abraham's`) as string delimiters — so translations were spliced into
positions that were never strings. Fix: consult the nbformat notebook-level
default (`kernelspec`/`language_info`) and recognize `%%bash` cell magics.
Under the Prolog lexer, single-quoted atoms are code *by design* and the
entire failure class is structurally impossible. Lesson: **verify the
diagnosis against the artifact before building the clever fix** — the
33-job locale batch for these "hard" workbooks then passed with zero
failures.

**Python scanner on Lua misread `#` (length operator) as a comment**,
producing a phantom lint candidate. Candidate generation is now language-
aware everywhere, not just tokenization.

**ipynb writes were a silent no-op.** span-apply wrote `cell.code`, but
nbformat stores `source` as a line array — the file serialized unchanged
while "applied 16 spans" was reported. Caught by the zero-changed-spans
integrity gate (below). All writers now go through a format-aware
`setCellCode`.

**f-string micro-structure.** Quoted-literal placeholders (`{'step':>4}`)
are translatable headers, not placeholder changes; call kwargs are API
surface but def-signature defaults are parameters (`mplot(layout=…)` vs
`def f(doublings=18)` — both bugs shipped to the bench once each);
bracket context must thread across code tokens split by string literals.

## Oracle semantics (what "identical output" has to tolerate)

Each of these was a *legitimate* translation consequence that a byte-exact
oracle wrongly failed — the art is tolerating exactly these and nothing
more:

- **Rendered vs raw text**: manifests store `\n` as two characters; output
  has the newline. Field widths pad differently for different-length
  headers. The oracle masks *rendered* span text (escapes decoded, padding
  applied).
- **Format strings render their specs**: `"Count: ~w~n"` never appears in
  output; its literal runs do. Masking splits on `%`-specs, `~`-specs, and
  bash substitutions and masks literal runs pairwise (spec equality is
  enforced upstream at apply time).
- **Plot auto-ranging**: Korean label widths changed Plotly's tick range.
  Plot cells route to the plot check — detected by rendered plot markup,
  because *every* cell carries `lastOutputHtml` (text cells as `<pre>`).
- **Auto-layout reflow**: R's `table()` pads columns to header width, so
  translated headers reflow numeric whitespace. Space-run-only differences
  in span-bearing cells pass with a note; a changed digit still fails.
- **Cross-cell surfacing**: meta-workbooks print *other* cells' strings.
  Masking escalates from local (this cell's spans) to global only when the
  cell still mismatches — always-global over-masked data words that
  coincide with translated labels (R column names), which the systematic
  re-judge of all prior runs caught before commit.
- **Mask ordering**: comment-span masking before display-span masking
  shredded longer spans containing a comment word as substring
  (`square` inside `Odd squares: `). One unified longest-first pass.
- **Checked-claim demoted to warning**: tutorial comments legitimately echo
  expected output; meta-workbooks print their own code.

## Worker behavior (the gates that keep agents honest)

**English-echo + keeps-flooding gamed the pipeline once.** A repair round
returned the English text as "translations" and moved the rest into keeps;
the lint was silenced by its own allow-list and an untranslated workbook
went green. Now: zero-changed-spans and echo-majority are hard failures,
and repair prompts state that un-translating is itself a failure. Lesson:
**any gate whose inputs the worker controls (keeps → allow-list) needs a
gate the worker cannot control (derived span count).**

**Repair-loop degradation**: told "your JSON failed", a worker's instinct
is to revert, not fix. Repair prompts carry the exact machine error plus
explicit anti-degradation instructions; a failed/empty repair response
counts as a spent round instead of crashing the job.

**Headless permission walls**: agy auto-denies any tool needing a prompt
and returns nothing — which crashed repair rounds until treated as a
retryable condition, and which is why worker prompts say "no tool use".
Supervised (PTY) mode is the path for tool-using workers; see
translation-pipeline-modes.md.

**Sanctioned keeps and controller adjudication**: some candidates are
legitimately untranslatable ("id" is the token-type name and the same word
in Indonesian; " < pi < " is math). Workers declare keeps; identical-text
spans count as implicit keeps; and the controller may adjudicate a keep
on the record when the worker repeatedly fails to (documented in the
job's evidence).

## Bench operations

- Non-bundled kernels (Lua/Prolog CDN runtimes) show a download-consent
  dialog; headless nobody clicks; `ensureReady` awaits forever and wedges
  every subsequent tool call. Bench profile sets
  `localStorage.scirepl_auto_download = '1'`.
- Exactly ONE bench-pair process may hold the app connection; N>1 fight
  over the single slot with random "connection replaced" failures. And
  `pkill -f` matches your own shell's command line — kill by PID list.
- The broker process serves the code it was *started* with; a checkout
  left on a side branch silently ran a broker without the file-transfer
  tools for a whole evening. Health checks should include the tool list,
  not just `ok: true`.
- The batch driver is resumable by design: evidence dirs are done-markers,
  failed jobs restore their workbook to round-one state, greens commit per
  locale. A mid-batch broker restart cost ~56 jobs that all recovered on
  the next sweep — infrastructure failures should never cost content.
