"""Checks for the resistor-analogy workbook, shared by the offline and browser tests.

validate(ns, plots) takes the workbook's global namespace after a full top-to-bottom
run with the default parameters, and the mplot payloads in order. It recomputes every
fixture from first principles instead of trusting the workbook's own assertions.
Runs under CPython (offline test) and Pyodide (browser test): NumPy only.
"""
import math

import numpy as np

PLOT_TITLES = [
    "Fused variance<br>vs the weight on estimate 1",
    "Correlation erodes<br>the gain from averaging",
    "A shared error<br>cannot be averaged away",
    "Product variance<br>as relative errors grow",
    "Near zero, relative<br>uncertainty is meaningless",
    "Held-out reliability<br>(synthetic; bins of ≥ 20 cases)",
]
DEFAULTS = {
    "N_CASES": 8000, "SHARED_NOISE": 0.8, "OWN_NOISE": 0.6, "CONT_SHIFT": 0.7,
    "JEV_OVERCONFIDENCE": 1.8, "P": [0.8, 0.6], "PRIOR": 0.5, "MU": [2.0, 3.0],
    "SD": [0.1, 0.2], "LOG_SD": [0.3, 0.4], "V_EQ": 4.0, "RHO": 0.5, "SHARED_S2": 1.0,
    "T_EACH": 4.0, "BIAS": 0.5, "X_EST": [10.0, 14.0], "V_EST": [4.0, 9.0], "THETA": 12.0,
}


def close(a, b, tol=1e-12):
    return abs(float(a) - float(b)) <= tol * max(1.0, abs(float(b)))


def expect_value_error(action, message):
    try:
        action()
    except ValueError:
        return
    raise AssertionError(message)


def validate(ns, plots):
    checks = 0

    def check(condition, message):
        nonlocal checks
        if not condition:
            raise AssertionError(message)
        checks += 1

    for name, value in DEFAULTS.items():
        check(ns[name] == value, f"default parameter {name} changed")

    # Parallel fusion: weights proportional to precision, variance 1 / total precision.
    w, est, var = ns["fuse_independent"]([10, 14], [4, 9])
    check(close(w[0], 9 / 13) and close(w[1], 4 / 13), "fusion weights")
    check(close(est, 146 / 13) and close(var, 36 / 13), "fusion estimate and variance")
    rng = np.random.default_rng(1)
    for _ in range(25):
        x, v = rng.normal(size=4), rng.uniform(0.1, 10, size=4)
        w, est, var = ns["fuse_independent"](x, v)
        check(close(var, 1 / np.sum(1 / v)) and close(np.sum(w), 1.0), "random fusion")
        # No other weights summing to one do better.
        other = rng.dirichlet(np.ones(4))
        check(np.sum(other ** 2 * v) >= var - 1e-12, "fusion is not the minimum")

    # Correlated errors: compare with an explicit inverse on well-conditioned cases.
    for rho, want in [(0.0, 2.0), (0.5, 3.0), (1.0, 4.0)]:
        check(close(ns["equal_average_variance"](4.0, rho), want), "equal-variance average")
    w, _, var = ns["fuse_correlated"]([0, 0], ns["pair_covariance"](1.0, 4.0, 0.8))
    check(close(w[0], 4 / 3) and close(w[1], -1 / 3) and close(var, 0.8), "negative-weight example")
    for _ in range(10):
        A = rng.normal(size=(3, 3))
        S = A @ A.T + 3 * np.eye(3)
        ones = np.ones(3)
        inv = np.linalg.inv(S)
        w, _, var = ns["fuse_correlated"](np.zeros(3), S)
        check(np.allclose(w, inv @ ones / (ones @ inv @ ones), atol=1e-10), "GLS weights")
        check(close(var, 1 / (ones @ inv @ ones), 1e-10), "GLS variance")
    expect_value_error(lambda: ns["fuse_correlated"]([0, 0], ns["pair_covariance"](4, 4, 1.0)),
                       "singular covariance accepted")
    expect_value_error(lambda: ns["fuse_correlated"]([0, 0], [[1, 2], [2, 1]]), "indefinite covariance accepted")
    expect_value_error(lambda: ns["require_correlation"](1.5), "correlation above 1 accepted")
    expect_value_error(lambda: ns["require_variances"]([4, -1]), "negative variance accepted")
    expect_value_error(lambda: ns["require_variances"]([4, float("nan")]), "NaN variance accepted")
    expect_value_error(lambda: ns["fuse_independent"]([1, 2, 3], [1, 2]), "length mismatch accepted")
    check(close(ns["shared_floor_variance"](1.0, [4, 9]), 49 / 13), "shared floor")

    # Sums and products.
    check(close(ns["sum_variance"]([4, 9]), 13) and close(ns["sum_variance"]([4, 9], [2, -1]), 25), "sum variance")
    mean, var = ns["product_exact"]([2, 3], [0.01, 0.04])
    check(close(mean, 6) and close(var, 0.2504), "exact product, small errors")
    check(close(ns["product_delta"]([2, 3], [0.01, 0.04]), 0.25), "delta product, small errors")
    check(close(ns["product_exact"]([2, 3], [1, 1])[1], 14), "exact product, SD 1")
    check(close(ns["product_delta"]([2, 3], [1, 1]), 13), "delta product, SD 1")
    # Three independent inputs: E[Z²] - E[Z]² by direct moments.
    mu, v = np.array([1.5, -2.0, 0.5]), np.array([0.2, 0.3, 0.1])
    check(close(ns["product_exact"](mu, v)[1], np.prod(mu ** 2 + v) - np.prod(mu) ** 2), "three-input product")
    s2 = 0.3 ** 2 + 0.4 ** 2
    check(close(ns["log_var"], s2) and close(ns["z_var"], 36 * math.exp(s2) * math.expm1(s2), 1e-10), "log route")

    # Events, duplicates, complements and odds.
    check(close(ns["all_succeed"]([0.8, 0.6]), 0.48), "all succeed")
    check(close(ns["any_fail"]([0.8, 0.6]), 0.52), "any fails")
    check(close(ns["any_succeed"]([0.8, 0.6]), 0.92), "any succeeds")
    check(close(ns["combine_posteriors"](0.8, 0.8, 0.5), 16 / 17), "posterior odds")
    check(close(ns["combine_posteriors"](0.8, 0.5, 0.5), 0.8), "uninformative second posterior")

    # Simulations: every comparison present, seeded, and within the stated tolerance.
    log = ns["MC_LOG"]
    check(len(log) == 11, f"expected 11 simulation comparisons, got {len(log)}")
    for record in log.values():
        check(record["se"] > 0 and abs(record["z"]) < ns["Z_LIMIT"], "simulation disagrees: " + record["label"])
        check(record["n"] in (20000, 200000), "unexpected simulation size: " + record["label"])

    # Application (synthetic): ranking invariance and the expected qualitative result.
    results, yt = ns["results"], ns["yt"]
    check(close(ns["auc"](ns["cal_cont_logit"], yt), results["CONT-style alone"]["AUC"]), "Platt kept CONT AUC")
    check(close(ns["auc"](ns["cal_jev_logit"], yt), results["jev-style alone"]["AUC"]), "Platt kept jev AUC")
    toy = np.array([0.1, 0.4, 0.35, 0.8])
    check(close(ns["auc"](toy, np.array([0, 0, 1, 1])), 0.75), "AUC by hand")
    check(close(ns["auc"](np.array([0.5, 0.5]), np.array([0, 1])), 0.5), "AUC ties count half")
    check(results["naive product"]["mean − rate"] < -0.05, "naive product should be too low on average")
    best = min(results, key=lambda name: results[name]["Brier"])
    check(best in ("stacked", "calibrated, averaged"), "calibrated methods should have the lowest Brier score")
    check(abs(results["stacked"]["mean − rate"]) < 0.02, "stacked scores should be calibrated in the large")

    # Plots: count, titles, finite numbers.
    check([p["title"] for p in plots] == PLOT_TITLES, "plot titles or order changed")
    for p in plots:
        for trace in p["traces"]:
            for key in ("x", "y"):
                values = np.asarray(trace[key], dtype=float)
                check(values.size > 0 and np.all(np.isfinite(values)), f"non-finite {key} in {p['title']}")
    return checks
