#!/usr/bin/env python3
"""Execute only the pinned, inspected core plus this reviewed optional draft.

Offline NumPy/plot-payload oracle. This is not a sandbox for arbitrary books.
"""
import ast
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import numpy as np

REPO = Path(__file__).resolve().parent.parent
PIN = "f88d9b9e26364eeb5e7ff1ee9bcce5f27d47c66e"
LOCALES = ("en", "ar", "bn", "de", "es", "fr", "hi", "id", "ja", "ko", "pt-BR", "ru", "zh")
DRAFT = REPO / "drafts/markov-mixing/en/markov-groups.srwb"
checks = 0


def check(condition, message):
    global checks
    if not condition:
        raise AssertionError(message)
    checks += 1


def safe_source(code):
    tree = ast.parse(code)
    blocked = {"open", "eval", "exec", "compile", "input", "globals", "locals", "getattr", "setattr"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            check(len(node.names) == 1 and node.names[0].name == "numpy" and node.names[0].asname == "np", "Unexpected import")
        check(not isinstance(node, ast.ImportFrom), "Unexpected from-import")
        if isinstance(node, ast.Name):
            check(node.id not in blocked and not node.id.startswith("__"), "Unsafe inspected name")
        if isinstance(node, ast.Attribute):
            check(not node.attr.startswith("_") and node.attr not in {"load", "save", "savez", "loadtxt", "savetxt", "fromfile", "tofile", "memmap", "ctypes"}, "Unsafe inspected attribute")
    return tree


def run(cells):
    plots, output = [], io.StringIO()
    def capture(traces, **options):
        # Exactly the app's mplot payload route (x/y conversion only).
        processed = []
        for value in traces:
            trace = dict(value)
            for key in ("x", "y"):
                if key in trace and hasattr(trace[key], "tolist"):
                    trace[key] = trace[key].tolist()
            trace.setdefault("type", "scatter")
            trace.setdefault("mode", "lines")
            processed.append(trace)
        payload = {"traces": processed, "title": options.get("title", ""),
                   "xlabel": options.get("xlabel", ""), "ylabel": options.get("ylabel", ""),
                   "layout": options.get("layout") or {}}
        plots.append(json.loads(json.dumps(payload, allow_nan=False)))
    allowed = {name: getattr(__builtins__, name) for name in
               ("range", "len", "zip", "sum", "int", "float", "str", "round", "print", "list", "dict", "tuple",
                "sorted", "all", "any", "ValueError", "enumerate", "set", "abs", "divmod", "max", "bool")}
    def numpy_import(name, *args, **kwargs):
        check(name == "numpy" or name.startswith("numpy."), "Unexpected imported module")
        return __import__(name, *args, **kwargs)
    allowed["__import__"] = numpy_import
    namespace = {"__builtins__": allowed, "mplot": capture}
    with contextlib.redirect_stdout(output):
        for cell in cells:
            if cell["type"] == "code":
                check(cell["language"] == "python", "Unexpected kernel")
                exec(compile(safe_source(cell["code"]), cell["name"], "exec"), namespace, namespace)
    return namespace, plots, output.getvalue()


def validate(namespace, plots):
    positions, mask = namespace["corner_positions"], namespace["joint_mask"]
    check(len(positions) == 24 and mask.shape == (24, 24), "Grid shape")
    check(mask.sum() == 504 and (~mask).sum() == 72, "Reachability counts")
    check(np.array_equal(mask, ~namespace["same_slot"]), "Mask does not match cubie slots")
    check(np.all(mask.sum(axis=0) == 21) and np.all(mask.sum(axis=1) == 21),
          "Every 24-slot row/column has 21 reachable pairs and three gaps")
    check(positions[~mask[0]].tolist() == [0, 29, 36]
          and positions[~mask[:, 0]].tolist() == [0, 29, 36], "Bottom-row/left-column explanatory example")
    check((np.flatnonzero(~mask[0]) + 1).tolist() == [1, 14, 17], "Displayed forbidden indices match the original IDs")
    check(namespace["corner_target"].tolist() == [1 / 24] * 24, "Single target")
    check(namespace["joint_target"] == 1 / 504, "Joint target")
    check(len(plots) == 6, "Expected three histograms and three heatmaps")
    checkpoints = namespace["mixing_checkpoints"]
    check(checkpoints == (100, 1000, 10000), "Phone-safe default checkpoints")
    for index, step in enumerate(checkpoints):
        single = namespace["visit_snapshots"][step]
        joint = namespace["joint_snapshots"][step]
        check(np.isclose(single.sum(), 1) and np.isclose(joint.sum(), 1), "Frequency mass")
        check(np.all(joint[~mask] == 0), "Impossible pair visited")
        check(np.allclose(joint.sum(axis=0), single, rtol=0, atol=1e-15), "Joint marginal mismatch")
        exact = np.linalg.matrix_power(namespace["T"], step) @ namespace["location_probability"]
        check(np.allclose(namespace["exact_snapshots"][step], exact[positions], rtol=0, atol=2e-13), "Exact T^n mismatch")
        bars, target = plots[index]["traces"]
        check(bars["type"] == "bar" and bars["x"] == positions.tolist() and bars["y"] == single.tolist(), "Histogram data")
        check(target["type"] == "scatter" and target["y"] == [1 / 24] * 24, "Histogram target line")
        tiles = plots[index + 3]["traces"][0]
        check(tiles["type"] == "bar" and len(tiles["x"]) == 504, "Supported heatmap tile route")
        check(tiles["width"] == 1 and tiles["y"] == [1] * 504, "Heatmap tile shape")
        rows, columns = np.nonzero(mask)
        check(tiles["x"] == columns.tolist() and tiles["base"] == (rows - 0.5).tolist(), "Heatmap orientation")
        check(tiles["marker"]["color"] == joint[rows, columns].tolist(), "Heatmap frequencies")
        check(tiles["marker"]["cmin"] == 0 and tiles["marker"]["cmax"] >= max(tiles["marker"]["color"]), "Heatmap scale")
        check(plots[index + 3]["layout"]["xaxis"]["range"] == [-0.5, 23.5], "Grid full extent")
        pair_plot = plots[index + 3]
        check(pair_plot["title"].endswith("<br>24 × 24"), "Figure dimensions must be explicit")
        borders = pair_plot["layout"]["shapes"]
        edges = (np.arange(len(positions) + 1) - 0.5).tolist()
        check(len(borders) == 50, "Twenty-five boundaries per axis delineate 24 cells")
        check([line["x0"] for line in borders[:25]] == edges
              and [line["y0"] for line in borders[25:]] == edges, "Cell boundaries, not centre gridlines")
        check(pair_plot["xlabel"] == "Label 1 corner index"
              and pair_plot["ylabel"] == "Label 3 corner index", "Consecutive corner indices need explicit labels")
        tick_indices = list(range(0, len(positions), 4)) + [len(positions) - 1]
        for axis in ("xaxis", "yaxis"):
            axis_layout = pair_plot["layout"][axis]
            check(axis_layout["tickvals"] == tick_indices, "Compressed 24-position axis")
            check(axis_layout["ticktext"] == [index + 1 for index in tick_indices], "Displayed grid indices must run from 1 to 24")
            check(axis_layout["showgrid"] is False and axis_layout["zeroline"] is False,
                  "Gridlines must not show through forbidden cells")


def reject(action):
    try:
        action()
    except AssertionError:
        return
    raise AssertionError("Negative case was accepted")


def main():
    draft_bytes = DRAFT.read_bytes()
    draft = json.loads(draft_bytes)
    for locale in LOCALES:
        shipped = (REPO / f"workbooks/{locale}/markov-groups.srwb").read_bytes()
        pinned = subprocess.check_output(["git", "show", f"{PIN}:workbooks/{locale}/markov-groups.srwb"], cwd=REPO)
        if shipped != pinned:
            current = json.loads(shipped)
            previous = json.loads(pinned)
            suffix = current["notebook"]["cells"][13:]
            check(len(current["notebook"]["cells"]) == 19, f"Shipped {locale} unsupported extension")
            check([cell["name"] for cell in suffix] == ["mixing_bridge", "mixing_setup", "visit_bridge",
                  "sticker_visits", "joint_bridge", "joint_visits"], f"Shipped {locale} extension names")
            for index, cell in enumerate(suffix):
                check(set(cell) == {"name", "type", "language", "code"}, "Extension metadata changed")
                check(cell["type"] == ("markdown" if index % 2 == 0 else "code")
                      and cell["language"] == ("markdown" if index % 2 == 0 else "python")
                      and isinstance(cell["code"], str) and bool(cell["code"].strip()), "Extension schema changed")
            current["notebook"]["cells"] = current["notebook"]["cells"][:13]
            check(current == previous, f"Shipped {locale} historical core/container changed")
        else:
            check(shipped == pinned, f"Shipped {locale} changed")
        if locale == "en":
            predecessor = json.loads(pinned)
    check(draft["notebook"]["cells"][:13] == predecessor["notebook"]["cells"], "Core 13 cells changed")
    restored = json.loads(draft_bytes)
    restored["notebook"]["cells"] = predecessor["notebook"]["cells"]
    check(restored == predecessor, "Container changed")
    namespace, plots, output = run(draft["notebook"]["cells"])
    repeated, repeat_plots, repeat_output = run(draft["notebook"]["cells"])
    validate(namespace, plots)
    check(plots == repeat_plots and output == repeat_output, "Nondeterministic plots/output")
    core, _, _ = run(predecessor["notebook"]["cells"])
    for name in ("T", "SOLVED", "walk_state", "location_probability", "after_one_step"):
        check(np.array_equal(namespace[name], core[name]), f"Optional cells changed {name}")
    check(namespace["moves"] == core["moves"], "Optional seed changed original sample")
    # Independent full-sticker trajectory oracle, not the workbook's pair code.
    oracle_rng = np.random.default_rng(namespace["mixing_seed"])
    state = np.arange(1, 55)
    single_counts, pair_counts = np.zeros(24, int), np.zeros((24, 24), int)
    for step in range(1, 10001):
        p = namespace["mixing_moves"][int(oracle_rng.integers(13))]
        destination_state = np.empty_like(state)
        destination_state[p] = state
        state = destination_state
        first, second = int(np.flatnonzero(state == 1)[0]), int(np.flatnonzero(state == 3)[0])
        single_counts[namespace["corner_index"][first]] += 1
        pair_counts[namespace["corner_index"][second], namespace["corner_index"][first]] += 1
        if step in (100, 1000, 10000):
            check(np.array_equal(namespace["visit_snapshots"][step], single_counts / step), "Full-cube single oracle")
            check(np.array_equal(namespace["joint_snapshots"][step], pair_counts / step), "Full-cube joint oracle")
    # Independent first-step witness: independent choices include same-slot
    # states, which our reachable-pair gate MUST reject.
    independent = [(int(p[0]), int(q[2])) for p in namespace["mixing_moves"] for q in namespace["mixing_moves"]]
    illegal = [pair for pair in independent if pair not in namespace["joint_reachable"]]
    check(len(illegal) == 28 and (0, 0) in illegal and (0, 36) in illegal, "Independent-move error witness")
    reject(lambda: check(not illegal, "Independent moves are not a cube walk"))
    corrupt = dict(namespace)
    corrupt["joint_mask"] = namespace["joint_mask"].copy()
    corrupt["joint_mask"][0, 0] = True
    reject(lambda: validate(corrupt, plots))
    corrupt_plots = json.loads(json.dumps(plots))
    corrupt_plots[3]["traces"][0]["marker"]["color"][0] += 0.001
    reject(lambda: validate(namespace, corrupt_plots))
    corrupt_axes = json.loads(json.dumps(plots))
    corrupt_axes[3]["layout"]["xaxis"]["ticktext"][0] = 53
    reject(lambda: validate(namespace, corrupt_axes))
    corrupt_axes = json.loads(json.dumps(plots))
    corrupt_axes[3]["layout"]["yaxis"]["showgrid"] = True
    reject(lambda: validate(namespace, corrupt_axes))
    reject(lambda: safe_source("import urllib.request"))
    reject(lambda: safe_source("open('secret')"))
    fields = json.loads((REPO / "drafts/markov-mixing/translation-fields.json").read_bytes())
    check(fields["candidateEnglishSha256"] == hashlib.sha256(draft_bytes).hexdigest(), "Canonical fields hash")
    check(len(fields["markdown"]) == 3 and len(fields["candidates"]) == 27, "Translation scope")
    check(all(int(candidate["id"].split(":")[0]) >= 13 for candidate in fields["candidates"]), "Core sent to translator")
    report = {"allPassed": True, "checks": checks, "scope": "English offline execution and exact plot payloads, not browser/native review",
              "predecessorCommit": PIN, "candidateSha256": hashlib.sha256(draft_bytes).hexdigest(),
              "numpyVersion": np.__version__, "cornerPositions": namespace["corner_positions"].tolist(),
              "reachableOrderedPairs": 504, "maskedSameCubiePairs": 72,
              "snapshots": [{"steps": step,
                             "singleVisitTV": float(np.abs(namespace["visit_snapshots"][step] - 1 / 24).sum() / 2),
                             "exactEndPositionTV": float(np.abs(namespace["exact_snapshots"][step] - 1 / 24).sum() / 2),
                             "jointVisitTV": float(np.abs(namespace["joint_snapshots"][step][namespace["joint_mask"]] - 1 / 504).sum() / 2)}
                            for step in (100, 1000, 10000)], "plots": plots}
    if len(sys.argv) == 3 and sys.argv[1] == "--report":
        destination = Path(sys.argv[2]).resolve()
        check(destination.is_relative_to(REPO / "reviews/markov-mixing-english-20261007"), "Fresh scoped report path required")
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("x", encoding="utf-8") as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
    print(json.dumps({key: value for key, value in report.items() if key != "plots"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
