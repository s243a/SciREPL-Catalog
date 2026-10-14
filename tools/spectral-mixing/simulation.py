"""Cell 4: seeded records, deterministic reference curves, and a variance check.

All randomness is local to explicit NumPy Generator instances.  No global
random state, files, network, plots, or optional scientific packages are used.
"""


def transition_cdf(transition):
    """CDF per SOURCE column, matching P[destination, source]."""
    cumulative = np.cumsum(transition, axis=0)
    # Guarantee a destination for every u < 1 despite summation roundoff.
    cumulative[-1, :] = 1.0
    return cumulative


def seeded_occupation_snapshots(model, checkpoints, seed):
    """Record X_1,...,X_n, including rejected/stay proposals as observations."""
    checkpoints = tuple(sorted({_positive_step_count(step) for step in checkpoints}))
    if not checkpoints:
        raise ValueError("At least one checkpoint is needed.")
    generator = np.random.default_rng(seed)
    cumulative = transition_cdf(model["P"])
    current = int(model["start_index"])
    counts = np.zeros(model["P"].shape[0], dtype=np.int64)
    snapshots = {}
    for step in range(1, checkpoints[-1] + 1):
        current = int(np.searchsorted(cumulative[:, current], generator.random(), side="right"))
        counts[current] += 1
        if step in checkpoints:
            snapshots[step] = {
                "counts": counts.copy(),
                "distribution": counts.copy() / step,
                "endpoint_index": current,
                "endpoint_pair": model["states"][current],
            }
    return snapshots


def stationary_variance_replications(model, eigensystem, step_count=2048, replications=128, seed=271828):
    """Independent stationary paths validate Var(mean psi)=tau_n/n.

    This is a noisy Monte Carlo check with a modest replication count, not a
    calibrated hypothesis test.  Starting uniformly is essential for comparing
    with the stationary variance formula; the main paths start at (3,9).
    """
    step_count = _positive_step_count(step_count)
    replications = _positive_step_count(replications)
    if replications < 2:
        raise ValueError("At least two independent replications are required.")
    generator = np.random.default_rng(seed)
    state_count = model["P"].shape[0]
    current = generator.integers(state_count, size=replications)
    cumulative = transition_cdf(model["P"])
    counts = np.zeros((replications, state_count), dtype=np.int64)
    replication_index = np.arange(replications)
    for step in range(step_count):
        uniforms = generator.random(replications)
        # Each column selects the CDF of its current source state.  Counting
        # thresholds below u is vectorized categorical sampling for all paths.
        selected_cdfs = cumulative[:, current]
        current = np.sum(selected_cdfs <= uniforms[None, :], axis=0)
        # Each row identifies a distinct replication, so no repeated row/index
        # pair occurs; this direct indexed += safely adds one count per path.
        counts[replication_index, current] += 1
    mode_means = (counts / step_count) @ eigensystem["psi"][:, 1:]
    tau = finite_n_tau(eigensystem["eigenvalues"][1:], step_count)
    theoretical_variance = tau / step_count
    empirical_variance = mode_means.var(axis=0, ddof=1)
    whitened_per_path = (step_count * mode_means**2 / tau).mean(axis=1)
    return {
        "step_count": step_count,
        "replications": replications,
        "seed": seed,
        "mode_means": mode_means,
        "theoretical_variance": theoretical_variance,
        "empirical_variance": empirical_variance,
        "variance_ratio": empirical_variance / theoretical_variance,
        "W": whitened_per_path,
        "mean_W": float(whitened_per_path.mean()),
        "standard_error_W": float(whitened_per_path.std(ddof=1) / np.sqrt(replications)),
        "stationary_expected_W": 1.0,
    }


def summarize_occupation_case(model, eigensystem, snapshots):
    """Keep observed record, endpoint law, and expected record separate."""
    summaries = {}
    for step_count, snapshot in snapshots.items():
        observed_distribution = snapshot["distribution"]
        expected = exact_occupation_expectation(eigensystem, model["start_index"], step_count)
        endpoint = exact_endpoint_distribution(model["P"], model["start_index"], step_count)
        whitened = spectral_whitening(observed_distribution, eigensystem, step_count)
        uniform_stops = np.full(model["stop_count"], 1.0 / model["stop_count"])
        empirical_pooled = pooled_stop_distribution(observed_distribution, model)
        endpoint_pooled = pooled_stop_distribution(endpoint, model)
        summaries[step_count] = {
            "empirical_tv": total_variation(observed_distribution, model["pi"]),
            "W": whitened["W"],
            "whitening": whitened,
            "expected_occupation": expected,
            "endpoint_distribution": endpoint,
            "endpoint_tv": total_variation(endpoint, model["pi"]),
            "grid": pair_distribution_grid(observed_distribution, model),
            "empirical_pooled": empirical_pooled,
            "empirical_pooled_tv": total_variation(empirical_pooled, uniform_stops),
            "endpoint_pooled": endpoint_pooled,
            "endpoint_pooled_tv": total_variation(endpoint_pooled, uniform_stops),
        }
    return summaries


joint_visit_snapshots = {
    name: seeded_occupation_snapshots(model, spectral_checkpoints, spectral_seed)
    for name, model in joint_models.items()
}
joint_visit_summaries = {
    name: summarize_occupation_case(model, joint_spectra[name], joint_visit_snapshots[name])
    for name, model in joint_models.items()
}
# Independent stationary replications are a separate experiment, not more
# samples appended to the one fixed-start record used in the heatmaps.
stationary_variance_checks = {
    name: stationary_variance_replications(model, joint_spectra[name], seed=spectral_seed + 1)
    for name, model in joint_models.items()
}
