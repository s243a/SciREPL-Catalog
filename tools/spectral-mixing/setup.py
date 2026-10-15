"""Cell 1: a fictional, deliberately balanced delivery-route graph.

Only NumPy and the standard library are used.  Stops are single loading bays,
not measurements of a real fleet.  Matrix entries use P[destination, source].
"""

import numpy as np
from collections import deque


def build_stop_graph(bridge_weight, clock_degree=3.0):
    """Return two six-stop cycles joined at stops 0 and 6.

    P = I - L / (2 * clock_degree) is symmetric and column stochastic.
    Keeping clock_degree=3 for BOTH bridge weights gives one common clock:
    strengthening the bridge does not rescale all the within-cycle moves.
    Its diagonal is at least 1/2, so this lazy reversible kernel is PSD.
    """
    bridge_weight = float(bridge_weight)
    clock_degree = float(clock_degree)
    if not np.isfinite(bridge_weight) or bridge_weight <= 0:
        raise ValueError("The connecting bridge must have positive finite weight.")
    if not np.isfinite(clock_degree) or clock_degree <= 0:
        raise ValueError("clock_degree must be positive and finite.")

    weights = np.zeros((12, 12), dtype=float)
    edges = []
    for offset in (0, 6):
        for local_stop in range(6):
            first = offset + local_stop
            second = offset + (local_stop + 1) % 6
            weights[first, second] = weights[second, first] = 1.0
            edges.append((first, second, 1.0))
    weights[0, 6] = weights[6, 0] = bridge_weight
    edges.append((0, 6, bridge_weight))

    weighted_degree = weights.sum(axis=0)
    if clock_degree < float(weighted_degree.max()):
        raise ValueError("The common clock must dominate every weighted degree.")
    laplacian = np.diag(weighted_degree) - weights
    transition = np.eye(12) - laplacian / (2.0 * clock_degree)
    stationary = np.full(12, 1.0 / 12)
    assert np.allclose(transition, transition.T)
    assert np.allclose(transition.sum(axis=0), 1.0)
    assert np.all(transition >= 0)
    assert np.all(np.diag(transition) >= 0.5 - 1e-14)
    assert np.allclose(transition @ stationary, stationary)
    return {
        "weights": weights,
        "edges": tuple(edges),
        "degree": weighted_degree,
        "laplacian": laplacian,
        "P": transition,
        "pi": stationary,
        "bridge_weight": bridge_weight,
        "clock_degree": clock_degree,
        "stop_count": 12,
    }


spectral_seed = 314159
spectral_checkpoints = (100, 1000, 10000)
spectral_start_pair = (3, 9)
spectral_bridge_weights = {"weak": 0.15, "strong": 1.0}
# The strongest graph has maximum weighted degree 2 + 1 = 3.
spectral_common_clock = 3.0
single_models = {
    name: build_stop_graph(weight, spectral_common_clock)
    for name, weight in spectral_bridge_weights.items()
}
stop_labels = tuple("Bay " + str(index) for index in range(12))
