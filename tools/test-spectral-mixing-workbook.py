#!/usr/bin/env python3
"""Run the inspected English candidate offline and verify its chart payloads.

This is a review runner for this source, not a sandbox for arbitrary books.
Use --record PATH to write source-bound numerical and plot evidence.
"""
import argparse
import ast
import contextlib
import hashlib
import io
import json
import math
from pathlib import Path
from time import perf_counter

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CANDIDATE = ROOT / "drafts/markov-spectral-mixing/en/markov-spectral-mixing.srwb"
SOURCE_MAP = {
    "route_graph": "setup.py", "draw_routes": "graph_picture.py",
    "single_endpoints": "single_picture.py", "joint_kernel": "joint_model.py",
    "spectral_tools": "spectral_tools.py", "spectral_picture": "spectrum_picture.py",
    "joint_endpoints": "joint_picture.py", "sample_walks": "simulation.py",
    "entropy_picture": "entropy_picture.py", "clustering_picture": "clustering_picture.py",
    "occupation_picture": "occupation_picture.py", "noise_picture": "noise_picture.py",
    "stationary_check": "stationary_picture.py", "periodic_example": "periodic_picture.py",
}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def inspect_source(code):
    tree = ast.parse(code)
    forbidden_names = {"open", "input", "eval", "exec", "compile", "globals", "locals", "getattr", "setattr"}
    forbidden_attributes = {"load", "save", "savez", "loadtxt", "savetxt", "fromfile", "tofile", "memmap", "ctypes"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            require([(entry.name, entry.asname) for entry in node.names] == [("numpy", "np")], "Unexpected import")
        if isinstance(node, ast.ImportFrom):
            require(node.module == "collections" and node.level == 0
                    and [(entry.name, entry.asname) for entry in node.names] == [("deque", None)], "Unexpected from-import")
        if isinstance(node, ast.Name):
            require(node.id not in forbidden_names and not node.id.startswith("__"), "Unexpected dynamic operation")
        if isinstance(node, ast.Attribute):
            require(not node.attr.startswith("_") and node.attr not in forbidden_attributes, "Unexpected file/private bridge")
    return tree


def run_candidate():
    source = CANDIDATE.read_bytes()
    book = json.loads(source)
    require(set(book) == {"format", "version", "notebook"}, "Unexpected top-level metadata")
    require(book["format"] == "srwb" and book["version"] == "1.0", "Unsupported workbook format")
    require(set(book["notebook"]) == {"name", "cells"}, "Unexpected notebook metadata")
    cells = book["notebook"]["cells"]
    require(len(cells) == 27 and len({cell["name"] for cell in cells}) == 27, "Cell inventory changed")
    require({cell["name"] for cell in cells if cell["type"] == "code"} == set(SOURCE_MAP), "Code-cell inventory changed")
    plots, records = [], []

    def capture(traces, **options):
        processed = []
        for value in traces:
            trace = dict(value)
            for key in ("x", "y"):
                if hasattr(trace.get(key), "tolist"):
                    trace[key] = trace[key].tolist()
            trace.setdefault("type", "scatter")
            trace.setdefault("mode", "lines")
            processed.append(trace)
        payload = {"traces": processed, "title": options.get("title", ""),
                   "xlabel": options.get("xlabel", ""), "ylabel": options.get("ylabel", ""),
                   "layout": options.get("layout") or {}}
        plots.append(json.loads(json.dumps(payload, allow_nan=False)))

    namespace = {"mplot": capture}
    for cell in cells:
        require(set(cell) == {"name", "code", "type", "language"}, "Unexpected cell metadata")
        require("\x00" not in cell["code"], "Control character in source")
        require(cell["language"] == ("python" if cell["type"] == "code" else "markdown"), "Unexpected language")
        output = io.StringIO()
        first_plot = len(plots)
        if cell["type"] == "code":
            original = (ROOT / "tools/spectral-mixing" / SOURCE_MAP[cell["name"]]).read_text().rstrip("\n")
            require(cell["code"] == original, "Candidate differs from inspected numerical/chart source")
            with contextlib.redirect_stdout(output):
                exec(compile(inspect_source(cell["code"]), cell["name"], "exec"), namespace)
        records.append({"name": cell["name"], "output": output.getvalue(), "plotStart": first_plot, "plotCount": len(plots) - first_plot})
    return source, namespace, plots, records


def check_charts(namespace, plots):
    require(len(plots) == 17, "Expected 17 charts")
    require(all(trace["type"] in {"scatter", "bar"} for plot in plots for trace in plot["traces"]), "Unsupported Plotly Basic trace")
    require(all(plot["layout"]["height"] <= 470 for plot in plots), "Chart too tall for default phone review")
    require(all(plot["layout"]["title"]["text"] == plot["title"] for plot in plots), "Title differs across bridge paths")
    # Two exact endpoint maps and two sampled maps use the same orientation.
    heatmap_indices = (4, 5, 10, 11)
    rows, columns = np.nonzero(~np.eye(12, dtype=bool))
    for index, case, sampled in ((4, "weak", False), (5, "strong", False), (10, "weak", True), (11, "strong", True)):
        plot = plots[index]
        tiles = plot["traces"][0]
        require(len(plot["traces"]) == 1 and tiles["type"] == "bar", "Heatmap tile implementation changed")
        require(len(tiles["x"]) == 132 and tiles["x"] == columns.tolist(), "Heatmap legal x coordinates")
        require(tiles["base"] == (rows - 0.5).tolist() and tiles["y"] == [1] * 132 and tiles["width"] == 1, "Heatmap legal y coordinates")
        distribution = (namespace["joint_visit_snapshots"][case][10000]["distribution"] if sampled
                        else namespace["joint_endpoint_100"][case])
        grid = namespace["pair_distribution_grid"](distribution, namespace["joint_models"][case])
        np.testing.assert_allclose(tiles["marker"]["color"], grid[rows, columns], atol=2e-13, rtol=0)
        require(tiles["marker"]["cmin"] == 0 and tiles["marker"]["cmax"] >= max(tiles["marker"]["color"]), "Colour scale clips legal values")
        require(np.isclose(sum(tiles["marker"]["color"]), 1), "Map probabilities must sum to one")
        for axis in ("xaxis", "yaxis"):
            require(plot["layout"][axis]["range"] == [-0.5, 11.5]
                    and plot["layout"][axis]["tickvals"] == list(range(12)), "Explicit 12-tile grid bounds/ticks")
        require(len(plot["layout"]["shapes"]) == 26, "13 boundaries per 12-tile axis")
        require(plot["xlabel"].startswith("Truck A") and plot["ylabel"].startswith("Truck B"), "Truck axes transposed")
    for left, right in ((4, 5), (10, 11)):
        require(plots[left]["traces"][0]["marker"]["cmax"] == plots[right]["traces"][0]["marker"]["cmax"], "Compared heatmaps must share a scale")
    require(heatmap_indices == (4, 5, 10, 11), "Map inventory")
    # Distances and mode displays are checked against numerical variables,
    # rather than against another copy of chart generation code.
    for trace, expected in zip(plots[1]["traces"], namespace["single_endpoint_curves"].values()):
        np.testing.assert_allclose(trace["y"], expected, rtol=0, atol=1e-14)
    require(len(plots[12]["traces"]) == 6, "Endpoint, expected record and sampled record for each graph")
    for case, model in namespace["joint_models"].items():
        require(len(model["states"]) == 132, "Legal pair count")
        endpoint = namespace["joint_endpoint_100"][case]
        target_tv = 0.5211655102995671 if case == "weak" else 0.29092798052696955
        np.testing.assert_allclose(namespace["total_variation"](endpoint, model["pi"]), target_tv, atol=2e-11)
    periodic = namespace["periodic_results"]
    require(periodic[0.0]["endpoint"] == [0, 1] * 6, "Periodic endpoint must alternate")
    require(periodic[0.0]["mean_record"][1::2] == [0.5] * 6, "Even periodic records balance exactly")
    require(periodic[0.5]["endpoint"] == [0.5] * 12, "Lazy endpoint mixes in one move")
    print("PASS 17 chart payloads, shared-scale 12×12 maps, exact laws, seeded records and periodicity")


def check_information_and_clustering(namespace, plots):
    def scalar_entropy(values):
        return -sum(float(value) * math.log2(float(value)) for value in values if value > 0)

    entropy = namespace["probability_entropy_bits"]
    np.testing.assert_allclose(entropy([0.99, 0.01]), scalar_entropy([0.99, 0.01]), atol=1e-14)
    require(entropy([1 - 1e-10, 1e-10]) > 0, "Rare possibilities must not be deleted")
    np.testing.assert_allclose(entropy(np.full(132, 1 / 132)), math.log2(132), atol=1e-13)
    for invalid in ([], [1.1, -0.1], [0.4, 0.4], [np.nan, 1], [np.inf], [[1]]):
        try:
            entropy(invalid)
        except ValueError:
            continue
        raise AssertionError("Invalid entropy input accepted")

    # Independent cycle-distance formula: local cycle hops or a path through
    # the unique bridge. This reference does not call the workbook's BFS.
    expected_distances = np.empty((12, 12), dtype=int)
    for first in range(12):
        for second in range(12):
            a, b = first % 6, second % 6
            delta = abs(a - b)
            expected_distances[first, second] = (min(delta, 6 - delta) if first // 6 == second // 6
                                                  else min(a, 6 - a) + 1 + min(b, 6 - b))
    np.testing.assert_array_equal(namespace["route_hop_distances"], expected_distances)
    require(expected_distances.max() == 7, "Topological diameter")

    entropy_fixtures = {"weak": 6.080059356, "strong": 6.72021129}
    for case, model in namespace["joint_models"].items():
        kernel = model["P"]
        curve = namespace["entropy_curves"][case]
        require(len(curve["state_bits"]) == 3001 and len(curve["gain_bits"]) == 3000, "Entropy time indexing")
        require(curve["state_bits"][0] == 0 and np.min(curve["gain_bits"]) >= -1e-11, "Uniform-target entropy growth")
        np.testing.assert_allclose(curve["state_bits"][1], math.log2(3), atol=1e-13)
        np.testing.assert_allclose(curve["effective_count"][1], 3, atol=1e-13)
        require(np.count_nonzero(namespace["entropy_snapshots"][case][1]) == 5, "Five possible pairs but three effective pairs")
        np.testing.assert_allclose(curve["state_bits"][100], entropy_fixtures[case], atol=1e-8)
        require(abs(curve["gain_bits"][-1]) < 1e-7 and curve["stationary_choice_bits"] > 1,
                "Endpoint entropy saturates while state-history randomness remains")
        start = np.zeros(132)
        start[model["start_index"]] = 1
        for step in namespace["joint_curve_times"]:
            previous = np.linalg.matrix_power(kernel, step - 1) @ start
            current = kernel @ previous
            np.testing.assert_allclose(namespace["entropy_snapshots"][case][step], current, atol=2e-12, rtol=0)
            state_h = scalar_entropy(current)
            direct_kl = sum(float(value) * math.log2(float(value) * 132) for value in current if value > 0)
            np.testing.assert_allclose(math.log2(132) - state_h, direct_kl, atol=2e-11, rtol=0)
            # Compute forward and reverse conditional entropies from the
            # actual two-time joint law, independently of the column helper.
            joint = kernel * previous[None, :]
            positive = joint > 0
            rows, columns = np.nonzero(positive)
            forward = -sum(float(joint[d, s]) * math.log2(float(joint[d, s] / previous[s]))
                           for d, s in zip(rows, columns))
            reverse = -sum(float(joint[d, s]) * math.log2(float(joint[d, s] / current[d]))
                           for d, s in zip(rows, columns))
            gain = state_h - scalar_entropy(previous)
            np.testing.assert_allclose(forward - reverse, gain, atol=2e-11, rtol=0)
            np.testing.assert_allclose(curve["new_choice_bits"][step - 1], forward, atol=2e-11, rtol=0)
            np.testing.assert_allclose(curve["gain_bits"][step - 1], gain, atol=2e-11, rtol=0)
        features = {
            "same_neighbourhood": np.array([a // 6 == b // 6 for a, b in model["states"]], dtype=float),
            "adjacent": np.array([expected_distances[a, b] == 1 for a, b in model["states"]], dtype=float),
            "mean_graph_distance": np.array([expected_distances[a, b] for a, b in model["states"]], dtype=float),
        }
        for name, feature in features.items():
            np.testing.assert_array_equal(namespace["pair_clustering_features"][case][name], feature)
            reference = {"same_neighbourhood": 5 / 11, "adjacent": 13 / 66, "mean_graph_distance": 3}[name]
            np.testing.assert_allclose(feature.mean(), reference, atol=1e-14)
            values = [float(feature @ (np.linalg.matrix_power(kernel, step) @ start))
                      for step in namespace["joint_curve_times"]]
            np.testing.assert_allclose(namespace["joint_clustering_curves"][case][name], values, atol=2e-11, rtol=0)
        for trace_index, field in ((7, "effective_count"),):
            trace = plots[trace_index]["traces"][0 if case == "weak" else 1]
            np.testing.assert_allclose(trace["y"], curve[field][namespace["joint_curve_times"]], atol=1e-13)
        trace = plots[9]["traces"][0 if case == "weak" else 1]
        np.testing.assert_allclose(trace["y"], namespace["joint_clustering_curves"][case]["same_neighbourhood"], atol=1e-13)
    require(plots[8]["ylabel"] == "Bits per step" and len(plots[8]["traces"]) == 4, "Entropy rate units/curve inventory")
    print("PASS weighted entropy, KL identity, forward/reverse conditionals, rare outcomes and clustering references")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--record", type=Path)
    options = parser.parse_args()
    started = perf_counter()
    source, namespace, plots, records = run_candidate()
    check_charts(namespace, plots)
    check_information_and_clustering(namespace, plots)
    receipt = {"candidate": str(CANDIDATE.relative_to(ROOT)),
               "candidateSha256": hashlib.sha256(source).hexdigest(), "numpyVersion": np.__version__,
               "allPassed": True, "cells": records, "plots": plots,
               "numericalSummary": {case: {"gap": namespace["joint_spectra"][case]["gap"],
                   "sampleTV10000": namespace["joint_visit_summaries"][case][10000]["empirical_tv"],
                   "sampleW10000": namespace["joint_visit_summaries"][case][10000]["W"],
                   "stationaryMeanW": namespace["stationary_variance_checks"][case]["mean_W"]}
                   for case in ("weak", "strong")}}
    if options.record:
        options.record.parent.mkdir(parents=True, exist_ok=True)
        options.record.write_text(json.dumps(receipt, indent=2, allow_nan=False) + "\n")
    print("PASS English candidate SHA256", receipt["candidateSha256"], "27 cells; %.3fs" % (perf_counter() - started))


if __name__ == "__main__":
    main()
