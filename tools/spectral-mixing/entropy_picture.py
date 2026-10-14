def probability_entropy_bits(probability):
    """Shannon entropy of a normalized finite probability vector, in bits.

    Ignore zero terms, not rare outcomes. These inputs are directly
    propagated nonnegative laws; no histogram bias correction is applied.
    """
    probability = np.asarray(probability, dtype=float)
    if probability.ndim != 1 or len(probability) == 0:
        raise ValueError("Entropy needs a nonempty probability vector.")
    if np.any(~np.isfinite(probability)) or np.any(probability < 0):
        raise ValueError("Probabilities must be finite and nonnegative.")
    if not np.isclose(probability.sum(), 1.0, atol=1e-11, rtol=0):
        raise ValueError("Probabilities must sum to one.")
    positive = probability > 0
    return float(-np.sum(probability[positive] * np.log2(probability[positive])))


entropy_horizon = 3000
entropy_curves = {}
entropy_snapshots = {}
entropy_limit = float(np.log2(132))
for case, model in joint_models.items():
    kernel = model["P"]
    # Each SOURCE column gives the distribution of the next full pair state.
    choice_bits_by_state = np.array([probability_entropy_bits(kernel[:, source])
                                     for source in range(len(model["states"]))])
    probability = np.zeros(len(model["states"]))
    probability[model["start_index"]] = 1.0
    entropies = [probability_entropy_bits(probability)]
    choice_bits, gains = [], []
    snapshots = {0: probability.copy()}
    for step in range(1, entropy_horizon + 1):
        # Conditional entropy averages source-column entropies under q_(t-1).
        choice_bits.append(float(probability @ choice_bits_by_state))
        probability = kernel @ probability
        new_entropy = probability_entropy_bits(probability)
        gains.append(new_entropy - entropies[-1])
        entropies.append(new_entropy)
        if step in joint_curve_times:
            snapshots[step] = probability.copy()
    entropy_curves[case] = {
        "state_bits": np.array(entropies),
        "effective_count": 2**np.array(entropies),
        "gain_bits": np.array(gains),
        "new_choice_bits": np.array(choice_bits),
        "stationary_choice_bits": float(model["pi"] @ choice_bits_by_state),
    }
    entropy_snapshots[case] = snapshots
    assert np.min(gains) >= -1e-11
    assert np.max(entropies) <= entropy_limit + 1e-11
    assert np.isclose(entropies[1], np.log2(3))
    assert np.count_nonzero(snapshots[1]) == 5
    print(case, "t=100; endpoint entropy:", round(entropies[100], 6),
          "bits; effective pairs:", round(float(2**entropies[100]), 6))
    print("Stationary new-choice entropy:",
          round(entropy_curves[case]["stationary_choice_bits"], 6), "bits per pair step")

entropy_count_title = "Effective endpoint possibilities<br>uniform target: 132 pairs"
entropy_count_traces = [
    {"x": joint_curve_times, "y": [float(curve["effective_count"][step]) for step in joint_curve_times],
     "name": case, "mode": "lines+markers", "line": {"color": plot_colours[case]}}
    for case, curve in entropy_curves.items()
]
entropy_count_traces.append({"x": joint_curve_times, "y": [132] * len(joint_curve_times),
                             "name": "Uniform 132", "line": {"color": plot_ink, "dash": "dot"}})
mplot(entropy_count_traces, title=entropy_count_title, xlabel="Moves t · log scale", ylabel="Effective pair count",
      layout=spectral_layout(entropy_count_title, xaxis={"type": "log", "automargin": True},
                             yaxis={"range": [0, 140], "automargin": True}))

entropy_rate_title = "New choices versus state gain<br>bits per pair step"
entropy_rate_traces = []
for case, curve in entropy_curves.items():
    for kind, field, dash in (("state gain", "gain_bits", "solid"), ("new choices", "new_choice_bits", "dot")):
        # At step t these arrays refer to the transition X_(t-1) -> X_t.
        values = [max(0.0, float(curve[field][step - 1])) for step in joint_curve_times]
        entropy_rate_traces.append({"x": joint_curve_times, "y": values, "name": case + " · " + kind,
                                    "mode": "lines+markers", "line": {"color": plot_colours[case], "dash": dash}})
mplot(entropy_rate_traces, title=entropy_rate_title, xlabel="Moves t · log scale", ylabel="Bits per step",
      layout=spectral_layout(entropy_rate_title, xaxis={"type": "log", "automargin": True}))
print("Endpoint entropy gain can vanish while new route histories remain uncertain.")
print("Uniform endpoint limit:", round(entropy_limit, 6), "bits.")
