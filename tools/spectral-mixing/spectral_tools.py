"""Cell 3: reversible modes, finite-record uncertainty, and exact model means.

Here "exact" means a deterministic finite-state calculation, evaluated in
floating point, rather than a Monte Carlo estimate.  Occupancy records count
X_1,...,X_n AFTER the first move; an endpoint is the law of X_n alone.
"""


def uniform_eigensystem(transition):
    """Diagonalize a symmetric lazy kernel with uniform-pi normalized modes.

    psi_j = sqrt(m) v_j has E_pi[psi_j psi_k] = delta_jk.  The first
    mode is the constant 1 and the remaining modes have zero stationary mean.
    A sign convention helps reproducibility for a SIMPLE eigenvalue; vectors
    inside repeated eigenspaces are still arbitrary, so aggregate/projector
    quantities should be used when displaying a degenerate band.
    """
    transition = np.asarray(transition, dtype=float)
    if transition.ndim != 2 or transition.shape[0] != transition.shape[1]:
        raise ValueError("The transition matrix must be square.")
    if not np.allclose(transition, transition.T):
        raise ValueError("Uniform reversible modes require a symmetric kernel.")
    eigenvalues, vectors = np.linalg.eigh(transition)
    order = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[order]
    vectors = vectors[:, order]
    assert np.allclose(transition.sum(axis=0), 1.0)
    assert eigenvalues[-1] >= -1e-12
    assert np.isclose(eigenvalues[0], 1.0)
    assert eigenvalues[1] < 1.0 - 1e-12
    # Remove tiny roundoff below zero or above one, not negative model modes.
    eigenvalues = np.clip(eigenvalues, 0.0, 1.0)
    eigenvalues[0] = 1.0
    for mode in range(vectors.shape[1]):
        anchor = int(np.argmax(np.abs(vectors[:, mode])))
        if vectors[anchor, mode] < 0:
            vectors[:, mode] *= -1.0
    # The stationary vector is known analytically and avoids sign/roundoff noise.
    vectors[:, 0] = 1.0 / np.sqrt(transition.shape[0])
    functions = np.sqrt(transition.shape[0]) * vectors
    assert np.allclose(vectors.T @ vectors, np.eye(transition.shape[0]), atol=1e-11)
    assert np.allclose(transition @ vectors, vectors * eigenvalues, atol=1e-11)
    assert np.allclose(functions[:, 1:].mean(axis=0), 0.0, atol=1e-11)
    return {
        "eigenvalues": eigenvalues,
        "vectors": vectors,
        "psi": functions,
        "gap": float(1.0 - eigenvalues[1]),
        "mode_count": transition.shape[0] - 1,
    }


def _positive_step_count(step_count):
    if isinstance(step_count, (bool, np.bool_)) or int(step_count) != step_count or step_count < 1:
        raise ValueError("The number of recorded moves must be a positive integer.")
    return int(step_count)


def finite_n_tau(eigenvalues, step_count):
    """Stable tau_n = 1 + 2 sum_{k=1}^{n-1}(1-k/n) rho**k.

    For a stationary, unit-variance eigenfunction, Var(mean_n) = tau_n/n.
    Weighted recurrence avoids cancellation of the closed form when rho is
    near 1.  This is the finite-n value, not (1+rho)/(1-rho).
    """
    step_count = _positive_step_count(step_count)
    eigenvalues = np.asarray(eigenvalues, dtype=float)
    if np.any(~np.isfinite(eigenvalues)) or np.any(eigenvalues < 0) or np.any(eigenvalues > 1):
        raise ValueError("This lazy-model formula expects eigenvalues in [0, 1].")
    result = np.ones_like(eigenvalues)
    power = np.ones_like(eigenvalues)
    for lag in range(1, step_count):
        power *= eigenvalues
        result += 2.0 * (1.0 - lag / step_count) * power
    return result


def first_move_geometric_average(eigenvalues, step_count):
    """Return n^-1 sum_{t=1}^n rho**t, stable for rho close to 1.

    The leading rho matters: counting X_0,...,X_(n-1) would be a different
    estimator.  expm1 preserves the small numerator near a slow eigenvalue.
    """
    step_count = _positive_step_count(step_count)
    eigenvalues = np.asarray(eigenvalues, dtype=float)
    if np.any(eigenvalues < 0) or np.any(eigenvalues > 1) or np.any(~np.isfinite(eigenvalues)):
        raise ValueError("This lazy-model formula expects eigenvalues in [0, 1].")
    result = np.zeros_like(eigenvalues)
    result[eigenvalues == 1] = 1.0
    interior = (eigenvalues > 0) & (eigenvalues < 1)
    rho = eigenvalues[interior]
    result[interior] = rho * (-np.expm1(step_count * np.log(rho))) / (step_count * (1.0 - rho))
    return result


def total_variation(distribution, stationary):
    """Raw probability distance; it does not account for serial correlation."""
    distribution = np.asarray(distribution, dtype=float)
    stationary = np.asarray(stationary, dtype=float)
    if distribution.shape != stationary.shape:
        raise ValueError("The distributions must have matching shapes.")
    return float(0.5 * np.abs(distribution - stationary).sum())


def spectral_whitening(distribution, eigensystem, step_count):
    """Normalize occupancy-mode energy by its STATIONARY finite-n variance.

    W = sum_j n * mean(psi_j)**2 / tau_n,j / (m-1).  Stationary starts
    have E[W]=1 exactly; W is not a proof of mixing or a chi-square test.
    The fixed starts used in the main experiment can have bias and different
    variances.  Equal-eigenvalue rotations leave the aggregate W unchanged.
    """
    step_count = _positive_step_count(step_count)
    distribution = np.asarray(distribution, dtype=float)
    functions = eigensystem["psi"][:, 1:]
    if distribution.shape != (functions.shape[0],):
        raise ValueError("One occupancy probability is required per state.")
    mode_means = distribution @ functions
    tau = finite_n_tau(eigensystem["eigenvalues"][1:], step_count)
    mode_energy = step_count * mode_means**2 / tau
    return {
        "W": float(mode_energy.mean()),
        "energy_sum": float(mode_energy.sum()),
        "mode_means": mode_means,
        "mode_energy": mode_energy,
        "tau": tau,
        "stationary_expected_W": 1.0,
    }


def exact_endpoint_distribution(transition, start_index, step_count):
    """Compute P**n e_start, not an empirical occupation histogram."""
    if isinstance(step_count, (bool, np.bool_)) or int(step_count) != step_count or step_count < 0:
        raise ValueError("The endpoint step must be a nonnegative integer.")
    start = np.zeros(transition.shape[0])
    start[int(start_index)] = 1.0
    return np.linalg.matrix_power(transition, int(step_count)) @ start


def exact_occupation_expectation(eigensystem, start_index, step_count):
    """Expected counts, mean histogram, and fixed-start bias after n moves.

    E[hat_pi_n] = sum_j v_j v_j(start) * (sum_{t=1}^n rho_j**t)/n.
    All nonconstant terms are fixed-start bias, not sampling fluctuation.
    """
    step_count = _positive_step_count(step_count)
    vectors = eigensystem["vectors"]
    average_power = first_move_geometric_average(eigensystem["eigenvalues"], step_count)
    expected_distribution = vectors @ (average_power * vectors[int(start_index), :])
    stationary = np.full(vectors.shape[0], 1.0 / vectors.shape[0])
    expected_mode_means = average_power[1:] * eigensystem["psi"][int(start_index), 1:]
    assert np.isclose(expected_distribution.sum(), 1.0)
    assert np.all(expected_distribution >= -1e-12)
    return {
        "counts": step_count * expected_distribution,
        "distribution": expected_distribution,
        "bias": expected_distribution - stationary,
        "bias_tv": total_variation(expected_distribution, stationary),
        "mode_bias": expected_mode_means,
    }


def eigenvalue_bands(eigensystem, tolerance=1e-10):
    """Group nonconstant equal-eigenvalue modes for basis-invariant displays.

    A band's squared projected coordinate at each state is invariant under
    rotation of a degenerate eigenbasis.  Mode indices refer to full psi
    columns, so 0 (the stationary constant) is never included.
    """
    eigenvalues = eigensystem["eigenvalues"]
    bands = []
    first = 1
    while first < len(eigenvalues):
        last = first + 1
        while last < len(eigenvalues) and abs(eigenvalues[last] - eigenvalues[first]) <= tolerance:
            last += 1
        indices = tuple(range(first, last))
        band_functions = eigensystem["psi"][:, first:last]
        bands.append({
            "indices": indices,
            "eigenvalue": float(eigenvalues[first:last].mean()),
            "multiplicity": last - first,
            "state_energy": np.sum(band_functions**2, axis=1),
        })
        first = last
    return tuple(bands)


single_spectra = {name: uniform_eigensystem(model["P"]) for name, model in single_models.items()}
joint_spectra = {name: uniform_eigensystem(model["P"]) for name, model in joint_models.items()}
joint_spectral_bands = {name: eigenvalue_bands(spectrum) for name, spectrum in joint_spectra.items()}
