# Count positions AFTER each move; the initial position is not a visit.
visit_rng = np.random.default_rng(mixing_seed)
visit_position = 0
visit_counts = np.zeros(len(corner_positions), dtype=int)
visit_snapshots, exact_snapshots = {}, {}
exact_probability = np.zeros(len(corner_positions))
exact_probability[corner_index[0]] = 1
for step in range(1, max(mixing_checkpoints) + 1):
    permutation = mixing_moves[int(visit_rng.integers(len(mixing_moves)))]
    visit_position = int(permutation[visit_position])
    visit_counts[corner_index[visit_position]] += 1
    exact_probability = corner_T @ exact_probability
    if step in mixing_checkpoints:
        visit_snapshots[step] = visit_counts.copy() / step
        exact_snapshots[step] = exact_probability.copy()

for step in mixing_checkpoints:
    frequencies = visit_snapshots[step]
    assert np.isclose(frequencies.sum(), 1)
    assert np.isclose(exact_snapshots[step].sum(), 1)
    visit_title = mixing_wrap("One sticker") + f"<br>{step} " + mixing_wrap("steps")
    mplot([
        {"type": "bar", "x": corner_positions.tolist(), "y": frequencies.tolist(),
         "name": mixing_wrap("Observed visits"), "marker": {"color": "#4c78a8"}},
        {"type": "scatter", "mode": "lines", "x": corner_positions.tolist(),
         "y": corner_target.tolist(), "name": mixing_wrap("Uniform target"),
         "line": {"color": "#f58518", "dash": "dash", "width": 2}},
    ], title=visit_title,
       xlabel=mixing_wrap("Label 1 position"), ylabel=mixing_wrap("Visit frequency"),
       layout={"height": 390, "margin": {"t": 70, "b": 115, "l": 65, "r": 12},
               "title": {"text": visit_title, "font": {"size": 14}, "x": 0.5},
               "paper_bgcolor": "#1c2128", "plot_bgcolor": "#161b22",
               "font": {"size": 11, "color": "#e6edf3"},
               "xaxis": {"type": "category", "tickmode": "array", "tickvals": mixing_ticks,
                         "automargin": True}, "yaxis": {"rangemode": "tozero", "automargin": True},
               "legend": {"orientation": "h", "y": -0.38, "font": {"size": 10}}})
    empirical_tv = float(np.abs(frequencies - corner_target).sum() / 2)
    exact_tv = float(np.abs(exact_snapshots[step] - corner_target).sum() / 2)
    print(step, "steps; visit-average distance:", round(empirical_tv, 6),
          "exact end-position distance:", round(exact_tv, 6))
