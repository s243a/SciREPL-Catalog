"""Independent offline numerical checks for the four workbook source cells.

Run with ``python3 tools/spectral-mixing/test_numerics.py``.  The runner reads
only its four adjacent, reviewed source blocks; it writes no files and needs
only NumPy plus the standard library.  Charts are intentionally out of scope.
"""

from collections import deque
from decimal import Decimal, localcontext
from itertools import product
from pathlib import Path
from time import perf_counter

import numpy as np


SOURCE_FILES = ("setup.py", "joint_model.py", "spectral_tools.py", "simulation.py")
AUDIT_GAPS = {
    "weak": (0.007240070662407949, 0.0028022239465677057),
    "strong": (0.02629405344594915, 0.008241791357971762),
}


def require(condition, message):
    """Keep checks enabled even when Python is invoked with -O."""
    if not condition:
        raise AssertionError(message)


def load_source_cells():
    namespace = {"__name__": "__spectral_numerics__"}
    source_directory = Path(__file__).resolve().parent
    for filename in SOURCE_FILES:
        path = source_directory / filename
        exec(compile(path.read_text(encoding="utf-8"), str(path), "exec"), namespace)
    return namespace


def independent_operators(bridge_weight, start_pair):
    """Construct operators from edge move rates, without production builders.

    Single-truck edge rates are weight/6 on the shared clock.  Joint edge
    rates are weight/12 because only one labelled truck is selected per step.
    The leftover mass stays put; occupied destinations never get a new edge.
    This construction uses neither a Laplacian nor joint_successors.
    """
    edge_list = [(stop, stop + 1, 1.0) for stop in range(5)]
    edge_list += [(5, 0, 1.0)]
    edge_list += [(stop, stop + 1, 1.0) for stop in range(6, 11)]
    edge_list += [(11, 6, 1.0), (0, 6, float(bridge_weight))]
    neighbours = [[] for _ in range(12)]
    single = np.zeros((12, 12))
    for first, second, weight in edge_list:
        neighbours[first].append((second, weight))
        neighbours[second].append((first, weight))
        single[first, second] = weight / 6.0
        single[second, first] = weight / 6.0
    for source in range(12):
        single[source, source] = 1.0 - sum(single[:, source])

    # Independent graph search discovers the class before forming its matrix.
    reached = {start_pair}
    pending = deque([start_pair])
    while pending:
        first, second = pending.popleft()
        successors = [(destination, second) for destination, _ in neighbours[first]
                      if destination != second]
        successors += [(first, destination) for destination, _ in neighbours[second]
                       if destination != first]
        for successor in successors:
            if successor not in reached:
                reached.add(successor)
                pending.append(successor)
    states = tuple(sorted(reached))
    index = {pair: state for state, pair in enumerate(states)}
    joint = np.zeros((len(states), len(states)))
    for source, (first, second) in enumerate(states):
        for destination, weight in neighbours[first]:
            if destination != second:
                joint[index[(destination, second)], source] = weight / 12.0
        for destination, weight in neighbours[second]:
            if destination != first:
                joint[index[(first, destination)], source] = weight / 12.0
        joint[source, source] = 1.0 - sum(joint[:, source])
    return single, joint, states, index


def decimal_tau_and_mean(rho, step_count):
    """High-precision closed-form reference, independent of float recurrence."""
    with localcontext() as context:
        context.prec = 70
        value = Decimal.from_float(float(rho))
        n = Decimal(step_count)
        if value == 1:
            return float(n), 1.0
        if value == 0:
            return 1.0, 0.0
        denominator = 1 - value
        ordinary_sum = (value - value**step_count) / denominator
        weighted_sum = (value - n * value**step_count
                        + (n - 1) * value**(step_count + 1)) / denominator**2
        tau = 1 + 2 * (ordinary_sum - weighted_sum / n)
        mean = (value - value**(step_count + 1)) / (n * denominator)
        return float(tau), float(mean)


def check_graphs_and_gaps(namespace):
    independent = {}
    legal_pairs = {(first, second) for first in range(12)
                   for second in range(12) if first != second}
    for name, bridge_weight in (("weak", 0.15), ("strong", 1.0)):
        model = namespace["joint_models"][name]
        single, joint, states, index = independent_operators(bridge_weight, (3, 9))
        require(set(states) == legal_pairs and len(states) == 132,
                name + ": independent BFS must discover all 132 legal pairs")
        require(set(model["states"]) == legal_pairs,
                name + ": production BFS states must equal the independently discovered class")
        # Align the independently sorted state order to the production BFS order.
        permutation = [index[pair] for pair in model["states"]]
        aligned_joint = joint[np.ix_(permutation, permutation)]
        np.testing.assert_allclose(namespace["single_models"][name]["P"], single,
                                   atol=2e-15, rtol=0)
        np.testing.assert_allclose(model["P"], aligned_joint, atol=2e-15, rtol=0)
        for transition in (single, aligned_joint):
            np.testing.assert_allclose(transition, transition.T, atol=1e-15, rtol=0)
            np.testing.assert_allclose(transition.sum(axis=0), 1, atol=2e-15, rtol=0)
            require(np.min(transition) >= 0, "Transition probabilities cannot be negative")
            require(np.min(np.diag(transition)) >= 0.5 - 1e-15,
                    "Both kernels must retain at least half their mass")
            require(np.linalg.eigvalsh(transition)[0] >= -1e-12,
                    "The balanced lazy kernels must be positive semidefinite")
            uniform = np.full(transition.shape[0], 1.0 / transition.shape[0])
            np.testing.assert_allclose(transition @ uniform, uniform, atol=1e-15, rtol=0)
        observed_gaps = (1 - np.linalg.eigvalsh(single)[-2],
                         1 - np.linalg.eigvalsh(aligned_joint)[-2])
        np.testing.assert_allclose(observed_gaps, AUDIT_GAPS[name], atol=2e-12, rtol=0)
        np.testing.assert_allclose(namespace["single_spectra"][name]["gap"], observed_gaps[0],
                                   atol=2e-12, rtol=0)
        np.testing.assert_allclose(namespace["joint_spectra"][name]["gap"], observed_gaps[1],
                                   atol=2e-12, rtol=0)
        # Bay pair (0,6) has two bridge proposals rejected.  Their mass stays
        # at the source, with no inflation of any other off-diagonal rate.
        blocked = model["state_index"][(0, 6)]
        require(np.isclose(aligned_joint[blocked, blocked], 2.0 / 3.0),
                "Rejected bridge proposals must become stays")
        move_A = model["state_index"][(1, 6)]
        require(np.isclose(aligned_joint[move_A, blocked], 1.0 / 12.0),
                "Occupied-bay rejection must not renormalize allowed proposals")
        swapped = model["state_index"][(6, 0)]
        require(aligned_joint[swapped, blocked] == 0,
                "Both (0,6) and (6,0) are legal states, but cannot be a one-step swap")
        # Labels can exchange positions without ever sharing a bay.  Each
        # listed local move has probability 1/12 on the common pair clock.
        exchange_path = ((3, 4), (2, 4), (1, 4), (0, 4), (5, 4), (5, 3), (4, 3))
        path_indices = [model["state_index"][pair] for pair in exchange_path]
        path_probabilities = [aligned_joint[destination, source]
                              for source, destination in zip(path_indices[:-1], path_indices[1:])]
        np.testing.assert_allclose(path_probabilities, np.full(6, 1 / 12), atol=1e-15, rtol=0)
        require(aligned_joint[path_indices[-1], path_indices[0]] == 0,
                "The six-step exchange must not become an instantaneous two-truck move")
        require(np.linalg.matrix_power(aligned_joint, 6)[path_indices[-1], path_indices[0]]
                >= float(np.prod(path_probabilities)), "The legal exchange path must have positive probability")
        independent[name] = aligned_joint
        print("PASS", name, "BFS=132 single_gap=%.12f joint_gap=%.12f" % observed_gaps)
    # Only the bridge entry and its diagonal compensation change on one clock.
    difference = namespace["single_models"]["strong"]["P"] - namespace["single_models"]["weak"]["P"]
    changed = set(zip(*np.nonzero(np.abs(difference) > 1e-14)))
    require(changed == {(0, 0), (0, 6), (6, 0), (6, 6)},
            "Within-cycle rates must remain unchanged when the bridge is strengthened")
    return independent


def check_pooling_and_pair_clock(namespace, independent):
    """Check the exact pooled-law closure and the remaining label-exchange mode."""
    times = {0, 1, 3, 10, 30, 100, 300, 1000, 3000}
    asymmetric_pooled = {}
    # With half the initial pooled mass at each opposite cycle's stop 3,
    # symmetry makes the bridge carry zero net pooled flow at every step.
    # The independent reference is therefore one half-mass six-cycle walk,
    # with local rates 1/12 (the random-scan pair clock), copied to both sides.
    cycle = np.eye(6) * (5 / 6)
    for stop in range(6):
        cycle[(stop - 1) % 6, stop] = 1 / 12
        cycle[(stop + 1) % 6, stop] = 1 / 12
    for name, transition in independent.items():
        model = namespace["joint_models"][name]
        single = independent_operators(0.15 if name == "weak" else 1.0, (3, 9))[0]
        pooling = np.zeros((12, 132))
        for column, (first, second) in enumerate(model["states"]):
            pooling[first, column] = 0.5
            pooling[second, column] = 0.5
        pooled_clock = (np.eye(12) + single) / 2
        # A matrix identity checks ALL 132 one-hot starts, not just (3,9).
        np.testing.assert_allclose(pooling @ transition, pooled_clock @ pooling, atol=2e-15, rtol=0)
        asymmetric_pooled[name] = pooling @ np.linalg.matrix_power(transition, 100)[:, model["state_index"][(3, 4)]]
        probability = np.zeros(132)
        probability[model["state_index"][(3, 9)]] = 1
        reference = np.zeros(6)
        reference[3] = 0.5
        A_west = np.array([first < 6 for first, second in model["states"]], dtype=float)
        A_west_100 = None
        for step in range(max(times) + 1):
            if step in times:
                pooled = pooling @ probability
                np.testing.assert_allclose(pooled, np.concatenate((reference, reference)), atol=2e-12, rtol=0)
                np.testing.assert_allclose(pooled[:6].sum(), 0.5, atol=2e-12, rtol=0)
                np.testing.assert_allclose(namespace["pooled_stop_distribution"](probability, model),
                                           pooled, atol=2e-14, rtol=0)
            if step == 100:
                A_west_100 = float(A_west @ probability)
                require(round(A_west_100, 2) == (0.89 if name == "weak" else 0.72),
                        "Balanced pooling must not conceal the documented individual-label imbalance")
            probability = transition @ probability
            reference = cycle @ reference

        single_values = np.linalg.eigvalsh(single)
        pair_values, pair_vectors = np.linalg.eigh(transition)
        clock_scaled_gap = (1 - single_values[-2]) / 2
        np.testing.assert_allclose(1 - pair_values[-3], clock_scaled_gap, atol=2e-12, rtol=0)
        pair_gap = 1 - pair_values[-2]
        reduction_percent = 100 * (1 - pair_gap / clock_scaled_gap)
        require(round(float(reduction_percent)) == (23 if name == "weak" else 37),
                "Pair slowdown beyond the half-speed proposal clock must match the rounded comparison")
        swap_indices = [model["state_index"][(second, first)] for first, second in model["states"]]
        slow_mode = pair_vectors[:, -2]
        np.testing.assert_allclose(slow_mode[swap_indices], -slow_mode, atol=2e-11, rtol=0)
        np.testing.assert_allclose(pooling @ slow_mode, 0, atol=2e-11, rtol=0)
        print("PASS", name, "pooling intertwines all 132 starts; bridge-independent pooled law; A-west(t=100)=%.6f"
              % A_west_100)
        print("PASS", name, "second pair decay=single gap/2; antisymmetric slow mode; further gap reduction=%.3f%%"
              % reduction_percent)
    require(np.max(np.abs(asymmetric_pooled["weak"] - asymmetric_pooled["strong"])) > 1e-3,
            "Bridge independence is special to the symmetric start, not a consequence of pooling alone")
    print("PASS legal pair endpoints, rejected bridge stays, and six-step label-exchange path")


def check_expectations(namespace, independent):
    maximum_count_error = 0.0
    maximum_endpoint_error = 0.0
    for name, transition in independent.items():
        model = namespace["joint_models"][name]
        spectrum = namespace["joint_spectra"][name]
        start = np.zeros(132)
        start[model["start_index"]] = 1
        distribution = start.copy()
        expected_counts = np.zeros(132)
        np.testing.assert_array_equal(
            namespace["exact_endpoint_distribution"](transition, model["start_index"], 0), start)
        for n in range(1, 41):
            distribution = transition @ distribution
            expected_counts += distribution
            result = namespace["exact_occupation_expectation"](spectrum, model["start_index"], n)
            endpoint = namespace["exact_endpoint_distribution"](transition, model["start_index"], n)
            maximum_count_error = max(maximum_count_error,
                                      float(np.max(np.abs(result["counts"] - expected_counts))))
            maximum_endpoint_error = max(maximum_endpoint_error,
                                         float(np.max(np.abs(endpoint - distribution))))
            np.testing.assert_allclose(result["counts"], expected_counts, atol=2e-10, rtol=0)
            np.testing.assert_allclose(result["distribution"], expected_counts / n, atol=1e-11, rtol=0)
            np.testing.assert_allclose(result["bias"], expected_counts / n - model["pi"],
                                       atol=1e-11, rtol=0)
            np.testing.assert_allclose(result["mode_bias"], (expected_counts / n) @ spectrum["psi"][:, 1:],
                                       atol=2e-11, rtol=0)
            np.testing.assert_allclose(endpoint, distribution, atol=1e-12, rtol=0)
            if n == 1:
                np.testing.assert_allclose(result["counts"], transition[:, model["start_index"]],
                                           atol=1e-11, rtol=0)
                require(not np.allclose(result["distribution"], start),
                        "Occupation must count X_1, not X_0, as its first observation")
        n = 100
        endpoint = namespace["exact_endpoint_distribution"](transition, model["start_index"], n)
        expected_joint_tv = 0.5211655102995671 if name == "weak" else 0.29092798052696955
        np.testing.assert_allclose(namespace["total_variation"](endpoint, model["pi"]),
                                   expected_joint_tv, atol=2e-11, rtol=0)
        pooled = namespace["pooled_stop_distribution"](endpoint, model)
        np.testing.assert_allclose(namespace["total_variation"](pooled, np.full(12, 1 / 12)),
                                   0.00011093092950221345, atol=2e-11, rtol=0)
    print("PASS exact means n=1..40 max_count_error=%.3g max_endpoint_error=%.3g"
          % (maximum_count_error, maximum_endpoint_error))


def check_finite_record_formulas(namespace):
    rhos = np.array([0.0, 0.5, 0.99, 1.0 - 1e-12, 1.0])
    maximum_tau_error = 0.0
    maximum_mean_error = 0.0
    for n in (1, 2, 17, 10000):
        references = np.array([decimal_tau_and_mean(rho, n) for rho in rhos])
        tau = namespace["finite_n_tau"](rhos, n)
        means = namespace["first_move_geometric_average"](rhos, n)
        np.testing.assert_allclose(tau, references[:, 0], atol=5e-10, rtol=5e-13)
        np.testing.assert_allclose(means, references[:, 1], atol=2e-15, rtol=2e-13)
        require(np.all((tau >= 1 - 1e-12) & (tau <= n + 1e-9)),
                "A lazy model's finite tau must lie between one and n")
        maximum_tau_error = max(maximum_tau_error, float(np.max(np.abs(tau - references[:, 0]))))
        maximum_mean_error = max(maximum_mean_error, float(np.max(np.abs(means - references[:, 1]))))
    print("PASS finite tau/geometric means rho=0..1 n<=10000 max_tau_error=%.3g max_mean_error=%.3g"
          % (maximum_tau_error, maximum_mean_error))


def independent_seeded_counts(transition, start_index, checkpoints, seed):
    """Scalar inverse categorical reference, with no production CDF helper."""
    generator = np.random.default_rng(seed)
    current = start_index
    counts = np.zeros(transition.shape[0], dtype=np.int64)
    snapshots = {}
    for n in range(1, max(checkpoints) + 1):
        draw = generator.random()
        cumulative = 0.0
        for destination in range(transition.shape[0]):
            cumulative += float(transition[destination, current])
            if draw < cumulative:
                current = destination
                break
        else:
            raise AssertionError("Independent categorical sampler found no destination")
        counts[current] += 1
        if n in checkpoints:
            snapshots[n] = (counts.copy(), current)
    return snapshots


def check_seeded_records(namespace, independent):
    for name, transition in independent.items():
        model = namespace["joint_models"][name]
        checkpoints = namespace["spectral_checkpoints"]
        rerun = namespace["seeded_occupation_snapshots"](model, checkpoints, namespace["spectral_seed"])
        reference = independent_seeded_counts(transition, model["start_index"], checkpoints,
                                              namespace["spectral_seed"])
        for n in checkpoints:
            result = namespace["joint_visit_snapshots"][name][n]
            np.testing.assert_array_equal(rerun[n]["counts"], result["counts"])
            np.testing.assert_array_equal(result["counts"], reference[n][0])
            require(result["endpoint_index"] == reference[n][1], "Endpoint must match the independent path")
            require(result["counts"].sum() == n, "Each post-move state, including a stay, must be counted")
            np.testing.assert_array_equal(result["distribution"], result["counts"] / n)
            grid = namespace["pair_distribution_grid"](result["distribution"], model)
            require(np.all(np.isnan(np.diag(grid))), "Only forbidden co-occupancy cells are NaN")
            require(np.all(np.isfinite(grid[namespace["joint_legal_mask"]])), "All legal pairs must remain numeric")
            require(np.isclose(np.nansum(grid), 1), "Heatmap mass must sum to one")
        one_move = namespace["seeded_occupation_snapshots"](model, (1,), 4)[1]
        reference_one = independent_seeded_counts(transition, model["start_index"], (1,), 4)[1]
        np.testing.assert_array_equal(one_move["counts"], reference_one[0])
        require(one_move["endpoint_index"] != model["start_index"],
                "The chosen seed must move, making an X_0 counting bug observable")
        require(one_move["counts"][model["start_index"]] == 0, "The initial state must not be counted")
    print("PASS seeded records match independent sampling at 100/1000/10000; post-move convention verified")


def check_stationary_whitening(namespace, independent):
    for name, transition in independent.items():
        spectrum = namespace["joint_spectra"][name]
        functions = spectrum["psi"][:, 1:]
        state_count = transition.shape[0]
        np.testing.assert_allclose(functions.T @ functions / state_count,
                                   np.eye(state_count - 1), atol=2e-11, rtol=0)
        np.testing.assert_allclose(functions.mean(axis=0), 0, atol=2e-11, rtol=0)
        # Stationary covariance is computed from actual matrix powers, without
        # substituting eigenvalue powers.  Both orientations contribute at lag k.
        n = 17
        propagated = functions.copy()
        covariance = n * (functions.T @ functions) / state_count
        for lag in range(1, n):
            propagated = transition @ propagated
            cross_covariance = functions.T @ propagated / state_count
            covariance += (n - lag) * (cross_covariance + cross_covariance.T)
        covariance /= n**2
        tau = namespace["finite_n_tau"](spectrum["eigenvalues"][1:], n)
        np.testing.assert_allclose(covariance, np.diag(tau / n), atol=2e-11, rtol=0)
        expected_W = float(np.mean(n * np.diag(covariance) / tau))
        np.testing.assert_allclose(expected_W, 1, atol=2e-12, rtol=0)
        # Enumerating every stationary one-move state checks the metric's
        # division by m-1, independently of the covariance calculation.
        one_move_W = []
        for state in range(state_count):
            occupation = np.zeros(state_count)
            occupation[state] = 1
            one_move_W.append(namespace["spectral_whitening"](occupation, spectrum, 1)["W"])
        np.testing.assert_allclose(np.mean(one_move_W), 1, atol=2e-12, rtol=0)
        stationary_metric = namespace["spectral_whitening"](np.full(state_count, 1 / state_count), spectrum, n)
        require(stationary_metric["W"] < 1e-20, "An exactly uniform histogram must have no nonconstant energy")
        replication = namespace["stationary_variance_checks"][name]
        # Monte Carlo has sampling noise; the deterministic covariance checks
        # above establish normalization.  The replication check only catches
        # a gross wrong-start/wrong-scale regression with a generous tolerance.
        require(abs(replication["mean_W"] - 1) < max(0.12, 8 * replication["standard_error_W"]),
                "Stationary replication normalization has a gross discrepancy")
        repeat = namespace["stationary_variance_replications"](
            namespace["joint_models"][name], spectrum, replication["step_count"],
            replication["replications"], replication["seed"])
        np.testing.assert_array_equal(repeat["mode_means"], replication["mode_means"])
        np.testing.assert_array_equal(repeat["W"], replication["W"])
        print("PASS", name, "stationary E[W]=%.12f replication_mean=%.8f SE=%.8f"
              % (expected_W, replication["mean_W"], replication["standard_error_W"]))

    # Exhaustive stationary two-state paths supply an independent finite-n
    # probability calculation, rather than a large-state Monte Carlo check.
    small_transition = np.array([[0.8, 0.2], [0.2, 0.8]])
    small_spectrum = namespace["uniform_eigensystem"](small_transition)
    for n in range(1, 7):
        expected_W = 0.0
        probability_sum = 0.0
        for path in product((0, 1), repeat=n + 1):
            probability = 0.5
            for step in range(1, n + 1):
                probability *= small_transition[path[step], path[step - 1]]
            # The first element is the unrecorded stationary starting state.
            occupation = np.bincount(path[1:], minlength=2) / n
            expected_W += probability * namespace["spectral_whitening"](occupation, small_spectrum, n)["W"]
            probability_sum += probability
        np.testing.assert_allclose(probability_sum, 1, atol=2e-14, rtol=0)
        np.testing.assert_allclose(expected_W, 1, atol=2e-13, rtol=0)
    print("PASS exhaustive stationary two-state paths give E[W]=1 for n=1..6")


def check_degenerate_rotations(namespace):
    generator = np.random.default_rng(8675309)
    for name in ("weak", "strong"):
        original = namespace["joint_spectra"][name]
        rotated = {key: value.copy() if isinstance(value, np.ndarray) else value
                   for key, value in original.items()}
        bands = namespace["eigenvalue_bands"](original)
        rotated_count = 0
        for band in bands:
            size = band["multiplicity"]
            if size < 2:
                continue
            columns = list(band["indices"])
            rotation, _ = np.linalg.qr(generator.normal(size=(size, size)))
            rotated["psi"][:, columns] = original["psi"][:, columns] @ rotation
            rotated["vectors"][:, columns] = original["vectors"][:, columns] @ rotation
            rotated_count += 1
        require(rotated_count > 0, "The rotation test requires an actual degenerate eigenspace")
        rotated_bands = namespace["eigenvalue_bands"](rotated)
        for before, after in zip(bands, rotated_bands):
            require(before["indices"] == after["indices"], "Band membership must not change under a basis rotation")
            np.testing.assert_allclose(before["state_energy"], after["state_energy"], atol=2e-11, rtol=0)
        for n in namespace["spectral_checkpoints"]:
            occupation = namespace["joint_visit_snapshots"][name][n]["distribution"]
            before = namespace["spectral_whitening"](occupation, original, n)
            after = namespace["spectral_whitening"](occupation, rotated, n)
            np.testing.assert_allclose(after["W"], before["W"], atol=2e-11, rtol=2e-11)
            for band in bands:
                # energy arrays omit the constant column, hence index minus 1.
                energy_columns = np.array(band["indices"]) - 1
                np.testing.assert_allclose(after["mode_energy"][energy_columns].sum(),
                                           before["mode_energy"][energy_columns].sum(),
                                           atol=2e-10, rtol=2e-11)
        print("PASS", name, "W and projector energy invariant under rotations of", rotated_count, "bands")


def check_negative_inputs(namespace):
    """Inputs explicitly outside each documented API contract must fail."""
    cases = []
    model = namespace["joint_models"]["weak"]
    spectrum = namespace["joint_spectra"]["weak"]
    single = namespace["single_models"]["weak"]
    for bridge in (0, -0.1, np.inf, np.nan):
        cases.append(("invalid bridge", namespace["build_stop_graph"], (bridge,)))
    for clock in (0, -1, np.inf, np.nan, 2):
        cases.append(("invalid common clock", namespace["build_stop_graph"], (0.15, clock)))
    for pair in ((3, 3), (-1, 9), (3, 12), (3,), (3, 9, 10)):
        cases.append(("invalid start pair", namespace["build_joint_model"], (single, pair)))
    cases.append(("nonsquare kernel", namespace["uniform_eigensystem"], (np.ones((2, 3)),)))
    cases.append(("nonsymmetric kernel", namespace["uniform_eigensystem"], (np.array([[0.8, 0.1], [0.2, 0.9]]),)))
    for name in ("finite_n_tau", "first_move_geometric_average"):
        for rho in (-0.1, 1.1, np.nan, np.inf):
            cases.append(("invalid eigenvalue", namespace[name], (np.array([rho]), 10)))
        for n in (0, -1, 1.5, True):
            cases.append(("invalid record length", namespace[name], (np.array([0.5]), n)))
    cases.append(("mismatched TV shapes", namespace["total_variation"], (np.zeros(2), np.zeros(3))))
    cases.append(("wrong grid shape", namespace["pair_distribution_grid"], (np.zeros(12), model)))
    cases.append(("wrong whitening shape", namespace["spectral_whitening"], (np.zeros(12), spectrum, 10)))
    cases.append(("empty checkpoints", namespace["seeded_occupation_snapshots"], (model, (), 4)))
    cases.append(("invalid checkpoint", namespace["seeded_occupation_snapshots"], (model, (0,), 4)))
    for n in (-1, 1.5, True):
        cases.append(("invalid endpoint length", namespace["exact_endpoint_distribution"], (model["P"], 0, n)))
    for n in (0, -1, 1.5, True):
        cases.append(("invalid expectation length", namespace["exact_occupation_expectation"], (spectrum, 0, n)))
    cases.append(("too few replications", namespace["stationary_variance_replications"], (model, spectrum, 10, 1)))
    cases.append(("invalid replication length", namespace["stationary_variance_replications"], (model, spectrum, 0, 2)))
    for description, function, arguments in cases:
        try:
            function(*arguments)
        except ValueError:
            continue
        raise AssertionError(description + " should raise ValueError: " + function.__name__)
    print("PASS", len(cases), "meaningful invalid inputs rejected with ValueError")
    return len(cases)


def main():
    started = perf_counter()
    namespace = load_source_cells()
    print("NumPy", np.__version__, "loaded four source blocks")
    independent = check_graphs_and_gaps(namespace)
    check_pooling_and_pair_clock(namespace, independent)
    check_expectations(namespace, independent)
    check_finite_record_formulas(namespace)
    check_seeded_records(namespace, independent)
    check_stationary_whitening(namespace, independent)
    check_degenerate_rotations(namespace)
    negative_count = check_negative_inputs(namespace)
    print("ALL NUMERICAL CHECKS PASSED (%d negative cases; %.3fs)"
          % (negative_count, perf_counter() - started))


if __name__ == "__main__":
    main()
