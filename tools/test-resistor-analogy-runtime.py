#!/usr/bin/env python3
"""Offline test of the English resistor-analogy draft: structure, a full run, edits.

Executes every code cell in order under CPython + NumPy with the app's mplot payload
route stubbed, then recomputes the fixtures independently (resistor_analogy_checks.py).
Also reruns the book with edited parameter cells, as a learner would.
"""
import ast
import contextlib
import io
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.dont_write_bytecode = True  # keep tools/ free of __pycache__
sys.path.insert(0, str(REPO / "tools"))
from resistor_analogy_checks import validate  # noqa: E402

BOOK = REPO / "drafts/resistor-analogy/en/resistor-analogy.srwb"


def capture_plots(plots):
    def mplot(traces, **options):
        # The app's payload route: NumPy x/y become lists, scatter/lines are the defaults.
        processed = []
        for value in traces:
            trace = dict(value)
            for key in ("x", "y"):
                if hasattr(trace.get(key), "tolist"):
                    trace[key] = trace[key].tolist()
            trace.setdefault("type", "scatter")
            trace.setdefault("mode", "lines")
            processed.append(trace)
        plots.append(json.loads(json.dumps({"traces": processed, "title": options.get("title", ""),
                                            "layout": options.get("layout") or {}}, allow_nan=False)))
    return mplot


def run(cells):
    plots, out = [], io.StringIO()
    ns = {"mplot": capture_plots(plots)}
    with contextlib.redirect_stdout(out):
        for cell in cells:
            if cell["type"] == "code":
                exec(compile(cell["code"], cell["name"], "exec"), ns)
    return ns, plots, out.getvalue()


def edited(cells, cell_name, old, new):
    copy = json.loads(json.dumps(cells))
    cell = next(c for c in copy if c["name"] == cell_name)
    assert cell["code"].count(old) == 1, (cell_name, old)
    cell["code"] = cell["code"].replace(old, new)
    return copy


def main():
    subprocess.run([sys.executable, str(REPO / "tools/build-resistor-analogy.py"), "--check"], check=True)
    book = json.loads(BOOK.read_text(encoding="utf-8"))
    assert sorted(book) == ["format", "notebook", "version"]
    assert book["format"] == "srwb" and book["version"] == "1.0"
    assert sorted(book["notebook"]) == ["cells", "name"]
    cells = book["notebook"]["cells"]
    names = [c["name"] for c in cells]
    assert len(names) == len(set(names)), "duplicate cell names"
    for cell in cells:
        assert sorted(cell) == ["code", "language", "name", "type"]
        assert (cell["type"], cell["language"]) in {("markdown", "markdown"), ("code", "python")}
        assert cell["code"].strip() and "�" not in cell["code"]
        if cell["type"] == "code":
            for node in ast.walk(ast.parse(cell["code"])):
                assert not isinstance(node, ast.ImportFrom), "only 'import numpy as np' is allowed"
                if isinstance(node, ast.Import):
                    assert [(a.name, a.asname) for a in node.names] == [("numpy", "np")], "only NumPy"
        else:
            # KaTeX display blocks must be balanced; links to the theory notes must resolve.
            assert cell["code"].count("$$") % 2 == 0, cell["name"]
    theory = (REPO / "docs/resistor-analogy-theory.md").read_text(encoding="utf-8")
    anchors = {re.sub(r"[^a-z0-9 -]", "", h.lower()).replace(" ", "-")
               for h in re.findall(r"^#+ (.+)$", theory, re.M)}
    for link in re.findall(r"resistor-analogy-theory\.md#([a-z0-9-]+)", BOOK.read_text(encoding="utf-8")):
        assert link in anchors, "broken theory link #" + link

    ns, plots, output = run(cells)
    assert "FAIL" not in output and "DISAGREES" not in output, output
    count = validate(ns, plots)
    print(f"Default run: {len(cells)} cells, {len(plots)} plots, {count} independent checks passed.")

    scenarios = [
        ("three estimates", "fusion_parameters", "X_EST = [10.0, 14.0]", "X_EST = [10.0, 14.0, 11.0]",
         "V_EST = [4.0, 9.0]", "V_EST = [4.0, 9.0, 1.0]"),
        ("perfect correlation", "correlation_parameters", "RHO = 0.5 ", "RHO = 1.0 ", None, None),
        ("perfect anticorrelation", "correlation_parameters", "RHO = 0.5 ", "RHO = -1.0 ", None, None),
        ("mean near zero", "product_parameters", "MU = [2.0, 3.0]", "MU = [0.1, 3.0]", None, None),
        ("three events", "event_parameters", "P = [0.8, 0.6]", "P = [0.9, 0.7, 0.5]", None, None),
        ("no shared error", "application_parameters", "SHARED_NOISE = 0.8", "SHARED_NOISE = 0.0", None, None),
        ("parallel top-level network", "circuit_parameters", 'NETWORK = ("series", [("parallel", [0.9, 0.7]), 0.95,',
         'NETWORK = ("parallel", [("series", [0.9, 0.7]), 0.95,', None, None),
        ("larger walk network", "circuit_parameters", '("d", "b", 1.0)]',
         '("d", "b", 1.0), ("d", "e", 0.5), ("e", "b", 3.0), ("c", "e", 1.5)]', 'START = "c"', 'START = "e"'),
        ("walk starts at a", "circuit_parameters", 'START = "c"', 'START = "a"', None, None),
        ("deeper tree", "circuit_parameters", '(0.2, "snow")]', '(0.2, [(0.9, "snow"), (0.1, "hail")])]', None, None),
    ]
    for label, cell_name, old, new, old2, new2 in scenarios:
        book_cells = edited(cells, cell_name, old, new)
        if old2:
            book_cells = edited(book_cells, cell_name, old2, new2)
        _, _, out = run(book_cells)
        assert "FAIL" not in out and "DISAGREES" not in out and "nan" not in out, label
        if label == "mean near zero":
            assert "Warning: input 1 has |mean| < 3 SD" in out, "near-zero warning missing"
        print(f"Edited run passed: {label}")

    try:
        run(edited(cells, "circuit_parameters", "0.95,", "1.0,"))
    except ValueError as error:
        assert "strictly between 0 and 1" in str(error)
        print("Edited run rejected as intended: a part that never fails")
    else:
        raise AssertionError("a probability of 1 was accepted")

    try:
        run(edited(cells, "correlation_parameters", "RHO = 0.5 ", "RHO = 1.5 "))
    except ValueError as error:
        assert "between -1 and 1" in str(error)
        print("Edited run rejected as intended: correlation 1.5")
    else:
        raise AssertionError("an invalid correlation was accepted")


if __name__ == "__main__":
    main()
