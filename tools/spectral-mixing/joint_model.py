"""Cell 2: labelled trucks A/B with one truck per loading bay.

A step chooses A or B with probability 1/2 and proposes a single-truck
P move.  A proposal to the other truck's bay becomes a stay: it is NOT
discarded and the remaining proposals are NOT renormalized.
"""


def joint_successors(pair, base_transition):
    """List (destination_pair, probability) proposals, including rejected stays.

    Duplicate destinations are intentional; the joint matrix accumulates
    them, including the two kinds of ordinary stay and occupied-bay rejection.
    """
    first, second = pair
    successors = []
    for truck_index in (0, 1):
        source_stop = pair[truck_index]
        other_stop = pair[1 - truck_index]
        for destination_stop in range(base_transition.shape[0]):
            proposal_probability = float(base_transition[destination_stop, source_stop])
            if proposal_probability <= 0:
                continue
            destination = list(pair)
            if destination_stop != other_stop:
                destination[truck_index] = destination_stop
            successors.append((tuple(destination), 0.5 * proposal_probability))
    return successors


def build_joint_model(single_model, start_pair=(3, 9)):
    """Discover the legal communicating class by BFS, then build its kernel.

    We verify 12*11 reachable ordered pairs after discovery, instead of
    assuming that exclusion leaves every off-diagonal pair reachable.
    """
    base_transition = np.asarray(single_model["P"], dtype=float)
    stop_count = base_transition.shape[0]
    start_pair = tuple(int(stop) for stop in start_pair)
    if len(start_pair) != 2 or start_pair[0] == start_pair[1]:
        raise ValueError("A and B must start at two different bays.")
    if any(stop < 0 or stop >= stop_count for stop in start_pair):
        raise ValueError("The starting bay is outside the graph.")

    queue = deque([start_pair])
    discovered = {start_pair}
    states = []
    while queue:
        pair = queue.popleft()
        states.append(pair)
        for destination, probability in joint_successors(pair, base_transition):
            if probability > 0 and destination not in discovered:
                discovered.add(destination)
                queue.append(destination)
    state_index = {pair: index for index, pair in enumerate(states)}
    expected_legal = {
        (first, second)
        for first in range(stop_count)
        for second in range(stop_count)
        if first != second
    }
    assert discovered == expected_legal
    assert len(states) == stop_count * (stop_count - 1) == 132

    transition = np.zeros((len(states), len(states)), dtype=float)
    for source_index, pair in enumerate(states):
        for destination, probability in joint_successors(pair, base_transition):
            transition[state_index[destination], source_index] += probability
    stationary = np.full(len(states), 1.0 / len(states))
    assert np.allclose(transition, transition.T)
    assert np.allclose(transition.sum(axis=0), 1.0)
    assert np.all(transition >= 0)
    assert np.all(np.diag(transition) >= 0.5 - 1e-14)
    assert np.allclose(transition @ stationary, stationary)
    return {
        "P": transition,
        "pi": stationary,
        "states": tuple(states),
        "state_index": state_index,
        "start_pair": start_pair,
        "start_index": state_index[start_pair],
        "stop_count": stop_count,
        "bridge_weight": single_model["bridge_weight"],
        "clock_degree": single_model["clock_degree"],
    }


def pair_distribution_grid(values, model, forbidden_value=np.nan):
    """Map a state vector to a 12x12 chart: x=A bay, y=B bay.

    A forbidden diagonal is NaN by default; off-diagonal zero entries remain
    actual zeros so an unvisited legal pair is not confused with an illegal one.
    """
    values = np.asarray(values)
    if values.shape != (len(model["states"]),):
        raise ValueError("One value is required per reachable ordered pair.")
    grid = np.full((model["stop_count"], model["stop_count"]), forbidden_value, dtype=float)
    for state, (first, second) in enumerate(model["states"]):
        grid[second, first] = values[state]
    return grid


def pair_distribution_marginals(values, model):
    """Return A and B bay marginals without interpreting forbidden cells as data."""
    grid = pair_distribution_grid(values, model, forbidden_value=0.0)
    return grid.sum(axis=0), grid.sum(axis=1)


def pooled_stop_distribution(values, model):
    """Pool the labelled A/B marginals, intentionally forgetting which truck.

    A uniform pooled distribution does not establish uniformity of either
    label or of the full ordered pair; opposite label imbalances can cancel.
    """
    first_marginal, second_marginal = pair_distribution_marginals(values, model)
    return 0.5 * (first_marginal + second_marginal)


joint_models = {
    name: build_joint_model(model, spectral_start_pair)
    for name, model in single_models.items()
}
joint_legal_mask = ~np.eye(12, dtype=bool)
joint_uniform_target = 1.0 / 132
