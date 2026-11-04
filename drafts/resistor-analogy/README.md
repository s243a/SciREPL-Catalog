# Resistor Analogy (English draft)

*Resistor Analogy: When Uncertainties Add in Series or Parallel* tests the idea that uncertainty
combines like resistors. Independent estimates of one target combine in parallel (precisions
add). Independent inputs to a sum combine in series (variances add). Probabilities of events
follow neither rule, but their logarithms do. Eight short investigations each ask for a prediction,
state the rule with its assumptions, units and exact or approximate status, and let you change
parameters and rerun. Investigation 6 adds four more circuit dictionaries: estimates as voltage
sources (Millman's theorem), log-probability resistance and conductance for reliability networks,
with the entropy lost when a network is reduced, random walks whose hitting probabilities are
voltages, and probability trees, where a path is a series circuit of surprisals. Investigation 8
asks which of these methods survive loops and merging paths.

- Workbook: [`en/resistor-analogy.srwb`](en/resistor-analogy.srwb), 38 cells, Python with NumPy
  and the app's built-in `mplot` only. Nothing is downloaded or installed while it runs.
- Theory: [`docs/resistor-analogy-theory.md`](../../docs/resistor-analogy-theory.md) has the full
  derivations; each investigation links to its section.
- Status: English draft, not yet in the catalog index. Registration needs the reviewed
  translations and receipts that `tools/register-example-workbooks.mjs` requires.

All data are synthetic. Investigation 7 uses made-up predictors in the style of two containment
models (CONT and jev); nothing in it is an observation of the real models.

## Open and run it

1. In SciREPL, open **Menu → Import File** and choose `resistor-analogy.srwb`.
2. Run the code cells from top to bottom, or use **Menu → Run All Cells**. A full run takes a few
   seconds on a desktop browser.
3. Fixed checks print `PASS` lines. Simulations print their sample size, the simulated and exact
   values, one standard error and a z-score; agreement means |z| < 4.

## Change parameters

Each investigation starts with a cell ending in `_parameters` (for example `fusion_parameters`).
Edit the values, rerun that cell, then rerun the cells below it in the same investigation.
The fixed textbook checks use their own inputs, so they keep passing after your edits. Invalid
inputs, such as a negative variance or a correlation outside [−1, 1], stop with a `ValueError`
that says what is wrong. The final `validation_summary` cell reruns every fixed check.

## Reproduce the validation

The source of truth is [`tools/build-resistor-analogy.py`](../../tools/build-resistor-analogy.py);
edit it, never the `.srwb`, and rebuild:

```sh
python3 tools/build-resistor-analogy.py           # write the .srwb
python3 tools/test-resistor-analogy-runtime.py    # needs NumPy
```

The runtime test checks the file is up to date and well formed, runs every code cell under
CPython, recomputes each fixture independently (`tools/resistor_analogy_checks.py`), and reruns
the book with learner-style parameter edits.

The browser test runs the same checks inside the real app, at phone width, in dark and light
themes, with every external request blocked. It needs a SciREPL checkout with Playwright installed
and its runtimes bundled (`node scripts/fetch-bundles.mjs full`), served on loopback:

```sh
(cd <SciREPL checkout> && PORT=8110 node server.js) &
SCIREPL_RESISTOR_APP=<SciREPL checkout> SCIREPL_RESISTOR_ORIGIN=http://localhost:8110 \
  node tools/test-resistor-analogy-browser.mjs
```

Set `SCIREPL_RESISTOR_EVIDENCE=<new directory>` to also save a JSON record and screenshots.
