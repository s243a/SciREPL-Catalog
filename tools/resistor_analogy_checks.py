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
    "Two series–parallel<br>dualities",
    "Held-out reliability<br>(synthetic; bins of ≥ 20 cases)",
    "Parallel routes:<br>a soft minimum",
]
DEFAULTS = {
    "N_CASES": 8000, "SHARED_NOISE": 0.8, "OWN_NOISE": 0.6, "CONT_SHIFT": 0.7,
    "JEV_OVERCONFIDENCE": 1.8, "P": [0.8, 0.6], "PRIOR": 0.5, "MU": [2.0, 3.0],
    "SD": [0.1, 0.2], "LOG_SD": [0.3, 0.4], "V_EQ": 4.0, "RHO": 0.5, "SHARED_S2": 1.0,
    "T_EACH": 4.0, "BIAS": 0.5, "X_EST": [10.0, 14.0], "V_EST": [4.0, 9.0], "THETA": 12.0,
    "NETWORK": ("series", [("parallel", [0.9, 0.7]), 0.95, ("parallel", [0.8, ("series", [0.6, 0.9])])]),
    "EDGES": [("a", "c", 1.0), ("a", "d", 2.0), ("c", "d", 1.0), ("c", "b", 2.0), ("d", "b", 1.0)],
    "START": "c",
    "TREE": [(0.5, "sunny"), (0.3, [(0.6, "light rain"), (0.4, "heavy rain")]), (0.2, "snow")],
    "ONE_WAY": {"x": {"y": 0.7, "a": 0.3}, "y": {"z": 0.7, "b": 0.3}, "z": {"x": 0.7, "a": 0.3}},
    "INIT": [0.6, 0.4], "TRANSITION": [[0.7, 0.3], [0.2, 0.8]], "STEPS": 3,
    "BRIDGE_P": [0.9, 0.8, 0.7, 0.85, 0.75],
}


def close(a, b, tol=1e-12):
    return abs(float(a) - float(b)) <= tol * max(1.0, abs(float(b)))


def expect_value_error(action, message):
    try:
        action()
    except ValueError:
        return
    raise AssertionError(message)


def binary_entropy(p):
    return -(p * math.log(p) + (1 - p) * math.log(1 - p))


def brute_force(network):
    """P(system works) and H(parts | outcome) by listing every state, written independently."""
    parts = []

    def collect(block):
        if isinstance(block, tuple):
            for child in block[1]:
                collect(child)
        else:
            parts.append(block)

    collect(network)
    up_weights, down_weights = [], []
    for code in range(2 ** len(parts)):
        state = [(code >> i) & 1 == 1 for i in range(len(parts))]
        position = iter(state)

        def ok(block):
            if not isinstance(block, tuple):
                return next(position)
            values = [ok(child) for child in block[1]]  # consume every part in order
            return all(values) if block[0] == "series" else any(values)

        weight = math.prod(p if s else 1 - p for p, s in zip(parts, state))
        (up_weights if ok(network) else down_weights).append(weight)
    conditional = 0.0
    for weights in (up_weights, down_weights):
        total = sum(weights)
        conditional -= sum(w * math.log(w / total) for w in weights if w > 0)
    return sum(up_weights), conditional, sum(binary_entropy(p) for p in parts)


def random_network(rng, depth):
    if depth == 0 or rng.random() < 0.3:
        return float(rng.uniform(0.05, 0.95))
    kind = "series" if rng.random() < 0.5 else "parallel"
    return (kind, [random_network(rng, depth - 1) for _ in range(int(rng.integers(2, 4)))])


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
    check(close(ns["log_var"], s2) and close(ns["z_mean"], 6) and close(ns["z_var"], 36 * math.expm1(s2), 1e-10),
          "log route: lognormal inputs with means 2 and 3")

    # Events, duplicates, complements and odds.
    check(close(ns["all_succeed"]([0.8, 0.6]), 0.48), "all succeed")
    check(close(ns["any_fail"]([0.8, 0.6]), 0.52), "any fails")
    check(close(ns["any_succeed"]([0.8, 0.6]), 0.92), "any succeeds")
    check(close(ns["combine_posteriors"](0.8, 0.8, 0.5), 16 / 17), "posterior odds")
    check(close(ns["combine_posteriors"](0.8, 0.5, 0.5), 0.8), "uninformative second posterior")

    # More circuits: Millman / Thévenin equals inverse-variance fusion.
    for _ in range(10):
        x, v = rng.normal(size=3), rng.uniform(0.1, 10, size=3)
        V, R = ns["millman"](x, v)
        _, est, var = ns["fuse_independent"](x, v)
        check(close(V, est, 1e-10) and close(R, var, 1e-10), "Millman equals fusion")
    # Log reliability: the duality, and reduction against brute-force enumeration.
    for x in rng.uniform(0.01, 6, size=10):
        check(close(ns["dual"](ns["dual"](x)), x, 1e-9), "dual is an involution")
        check(close(math.exp(-x) + math.exp(-ns["dual"](x)), 1.0, 1e-12), "exp(-r) + exp(-g) = 1")
    for p in rng.uniform(0.01, 0.99, size=10):
        check(close(ns["entropy"](p), binary_entropy(p), 1e-12), "entropy = p r + (1 - p) g")
    for network in [ns["NETWORK"]] + [random_network(rng, 3) for _ in range(12)]:
        steps = []
        P = ns["reduce_network"](network, steps)
        P_bf, H_given, H_parts = brute_force(network)
        check(close(P, P_bf, 1e-10), "reduction equals enumeration")
        if steps:
            lost = sum(s["lost"] for s in steps)
            check(close(lost, H_given, 1e-9), "lost entropy equals H(parts | outcome)")
            check(close(H_parts, binary_entropy(P) + lost, 1e-9) and lost >= -1e-12, "entropy balance")
    check(close(brute_force(DEFAULTS["NETWORK"])[0], 0.836722), "default network probability")
    steps = []
    check(close(ns["reduce_network"](0.9, steps), 0.9) and steps == [], "a single part needs no merge")
    # Valid parts whose reduction rounds to exactly 1 or 0 must not crash or give NaN.
    for network, rounded in [(("parallel", [0.99999999] * 3), 1.0),
                             (("series", [("parallel", [0.99999999] * 3), 0.9]), 0.9),
                             (("series", [1e-200, 1e-200]), 0.0),
                             (("parallel", [("series", [1e-200, 1e-200]), 0.5]), 0.5)]:
        steps = []
        P = ns["reduce_network"](network, steps)
        check(P == rounded or close(P, rounded, 1e-12), f"endpoint reduction {network}")
        check(all(math.isfinite(st["lost"]) and st["lost"] >= -1e-12 for st in steps), "finite, nonnegative losses at endpoints")
    check(ns["entropy"](1.0) == 0 and ns["entropy"](0.0) == 0, "a certain outcome has no entropy")
    expect_value_error(lambda: ns["resistance"](1.5), "probability 1.5 accepted")
    expect_value_error(lambda: ns["reduce_network"](("series", [0.5, 1.0]), []), "probability 1 accepted")
    expect_value_error(lambda: ns["reduce_network"](("both", [0.5, 0.5]), []), "unknown block accepted")
    # Random walks: voltages by an explicit inverse, and the escape / Green's function identities.
    nodes, index, L, V, C_eff = ns["voltages"](DEFAULTS["EDGES"])
    check([round(V[index[n]], 12) for n in "abcd"] == [1.0, 0.0, 0.4, 0.6], "bridge voltages")
    check(close(C_eff, 1.4) and close(C_eff / L[index["a"], index["a"]], 7 / 15), "bridge escape")
    for _ in range(5):
        names = ["a", "b", "c", "d", "e"]
        edges = [(names[i], names[j], float(rng.uniform(0.2, 3))) for i in range(5) for j in range(i + 1, 5)
                 if rng.random() < 0.8 or (i, j) == (0, 1)]
        nodes, index, L, V, C_eff = ns["voltages"](edges)
        a, b = index["a"], index["b"]
        inner = [i for i in range(len(nodes)) if i not in (a, b)]
        if inner:
            explicit = -np.linalg.inv(L[np.ix_(inner, inner)]) @ L[inner, a]
            check(np.allclose(V[inner], explicit, atol=1e-10), "harmonic voltages")
        keep = [i for i in range(len(nodes)) if i != b]
        G = np.linalg.inv(L[np.ix_(keep, keep)])
        check(close(G[keep.index(a), keep.index(a)], 1 / C_eff, 1e-10), "Var(X_a) = R_eff")
        check(np.allclose(G[:, keep.index(a)] / G[keep.index(a), keep.index(a)], V[keep], atol=1e-10),
              "conditional mean = voltages")
    expect_value_error(lambda: ns["voltages"]([("a", "c", 1.0)]), "network without b accepted")
    expect_value_error(lambda: ns["voltages"]([("a", "b", -1.0)]), "negative conductance accepted")

    # Probability trees: chain rule against the leaf distribution, on random trees.
    def random_tree(depth):
        if depth == 0 or rng.random() < 0.3:
            return "leaf"
        q = rng.dirichlet(np.ones(int(rng.integers(2, 5))))
        return [(float(c), random_tree(depth - 1)) for c in q]
    for tree in [DEFAULTS["TREE"]] + [random_tree(4) for _ in range(12)]:
        if isinstance(tree, str):
            continue
        rows = list(ns["tree_leaves"](tree))
        P = np.array([q for _, q, _ in rows])
        check(close(P.sum(), 1.0, 1e-12), "leaf probabilities add to 1")
        check(all(close(q, math.prod(path), 1e-12) for _, q, path in rows), "leaf = product along the path")
        check(close(ns["chain_rule_entropy"](tree), -np.sum(P * np.log(P)), 1e-10), "chain rule")
    for network in [DEFAULTS["NETWORK"], ("parallel", [0.3, ("series", [0.7, 0.2])])]:
        _, _, H_parts = brute_force(network)
        tree = ns["diagnosis_tree"](network)
        check(close(ns["chain_rule_entropy"](tree), H_parts, 1e-10), "diagnosis tree entropy = parts' entropy")
    expect_value_error(lambda: list(ns["tree_leaves"]([(0.5, "x"), (0.4, "y")])), "branches adding to 0.9 accepted")

    # Beyond trees: one-way chains, merging routes and the bridge, against independent methods.
    for _ in range(5):
        exits = rng.uniform(0.05, 0.6, size=3)
        chain = {s: {n: 1 - e, t: e} for s, n, t, e in zip("xyz", "yzx", "aba", exits)}
        h = ns["hitting_probabilities"](chain)
        # Independent route: absorb by iterating the transition matrix to its limit.
        order = ["x", "y", "z", "a", "b"]
        M = np.zeros((5, 5)); M[3, 3] = M[4, 4] = 1
        for s, row in chain.items():
            for t, q in row.items():
                M[order.index(s), order.index(t)] = q
        limit = np.linalg.matrix_power(M, 4000)
        check(all(close(h[s], limit[order.index(s), 3], 1e-9) for s in "xyz"), "one-way hitting probabilities")
    for _ in range(8):
        k = int(rng.integers(2, 4))
        init = rng.dirichlet(np.ones(k)); T = rng.dirichlet(np.ones(k), size=k); steps = int(rng.integers(1, 5))
        r = ns["forward_surprisal"](init, T, steps)
        check(np.allclose(np.exp(-r), init @ np.linalg.matrix_power(T, steps), atol=1e-12), "forward = matrix power")
        best = ns["forward_surprisal"](init, T, steps, best=True)
        for j in range(k):
            routes = [rr for end, rr in ns["route_surprisals"](init, T, steps) if end == j]
            check(close(best[j], min(routes), 1e-10), "best route = minimum")
            check(min(routes) - math.log(len(routes)) - 1e-12 <= r[j] <= min(routes) + 1e-12, "soft-min bounds")
    for _ in range(10):
        pb = rng.uniform(0.05, 0.95, size=5)
        total = 0.0
        for code in range(32):
            s = [(code >> i) & 1 for i in range(5)]
            path = (s[0] and s[3]) or (s[1] and s[4]) or (s[0] and s[2] and s[4]) or (s[1] and s[2] and s[3])
            total += path * math.prod(q if b else 1 - q for q, b in zip(pb, s))
        check(close(ns["bridge_reliability"](pb), total, 1e-10), "bridge by conditioning")
    # Sparse chains: zero transitions and deterministic starts give surprisal ∞, never NaN.
    for init, T, steps in [([1, 0], [[0, 1], [1, 0]], 3), ([1, 0, 0], [[0, 1, 0], [0, 0, 1], [1, 0, 0]], 2),
                           ([0.5, 0.5, 0], [[1, 0, 0], [0.3, 0.7, 0], [0.2, 0.2, 0.6]], 4)]:
        exact = np.asarray(init, float) @ np.linalg.matrix_power(np.asarray(T, float), steps)
        for best in (False, True):
            r = ns["forward_surprisal"](init, T, steps, best=best)
            check(not np.any(np.isnan(r)), "forward algorithm produced NaN on a sparse chain")
            check(np.array_equal(np.isinf(r), exact == 0), "impossible states must have surprisal ∞")
        r = ns["forward_surprisal"](init, T, steps)
        check(np.allclose(np.exp(-r), exact, atol=1e-12), "sparse forward = matrix power")
    # Route probabilities below 1e-308 underflow as products; as surprisal sums they stay finite.
    init, T = [0.5, 0.5], [[0.999, 0.001], [1e-200, 1 - 1e-200]]
    ends = [rr for end, rr in ns["route_surprisals"](init, T, 3) if end == 0]
    check(len(ends) == 8 and all(math.isfinite(rr) for rr in ends), "tiny routes must not be dropped")
    check(close(ns["soft_min"](ends), ns["forward_surprisal"](init, T, 3)[0], 1e-12), "tiny routes: soft-min = forward")
    check(math.isinf(ns["soft_min"]([math.inf, math.inf])) and math.isinf(ns["soft_min"]([])), "soft-min of no routes")
    expect_value_error(lambda: ns["forward_surprisal"]([0.5, 0.4], [[1, 0], [0, 1]], 1), "INIT adding to 0.9 accepted")
    expect_value_error(lambda: ns["forward_surprisal"]([0.5, 0.5], [[1, 0, 0], [0, 1, 0]], 1), "non-square TRANSITION accepted")
    expect_value_error(lambda: ns["hitting_probabilities"]({"x": {"a": 0.5, "b": 0.4}}), "rows adding to 0.9 accepted")

    # Simulations: every comparison present, seeded, and within the stated tolerance.
    log = ns["MC_LOG"]
    check(len(log) == 20, f"expected 20 simulation comparisons, got {len(log)}")
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
