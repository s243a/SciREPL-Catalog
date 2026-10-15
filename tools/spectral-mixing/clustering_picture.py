"""Summaries of labelled-pair proximity, not truck counts or attraction.

The full pair law can show association even when pooled visits look uniform.
These descriptive summaries compare that law with the 132-state uniform
exclusion reference; they do not assume the trucks are independent.
"""


def unweighted_route_distances(weights):
    """Count shortest-path edges by BFS; weights do not become travel times.

    Every positive-weight edge is one topological hop, including the bridge.
    The weak and strong graphs have the same support, hence the same distances.
    """
    adjacency = np.asarray(weights) > 0
    stop_count = adjacency.shape[0]
    if adjacency.shape != (stop_count, stop_count):
        raise ValueError("Route weights must be a square matrix.")
    distances = np.full((stop_count, stop_count), -1, dtype=int)
    for source in range(stop_count):
        distances[source, source] = 0
        pending = deque([source])
        while pending:
            current = pending.popleft()
            for neighbour in np.flatnonzero(adjacency[:, current]):
                if distances[source, neighbour] < 0:
                    distances[source, neighbour] = distances[source, current] + 1
                    pending.append(int(neighbour))
    assert np.all(distances >= 0)
    return distances


route_hop_distances = unweighted_route_distances(single_models["weak"]["weights"])
pair_clustering_features = {}
joint_clustering_curves = {}
joint_clustering_at_100 = {}
clustering_reference = None

for case, model in joint_models.items():
    # Each feature is indexed by the model's BFS-ordered labelled states.
    # Both endpoints in 0..5 or both in 6..11 means the same neighbourhood.
    features = {
        "same_neighbourhood": np.array([
            (first < 6) == (second < 6) for first, second in model["states"]
        ], dtype=float),
        "adjacent": np.array([
            route_hop_distances[first, second] == 1 for first, second in model["states"]
        ], dtype=float),
        "mean_graph_distance": np.array([
            route_hop_distances[first, second] for first, second in model["states"]
        ], dtype=float),
    }
    pair_clustering_features[case] = features
    reference = {name: float(feature @ model["pi"]) for name, feature in features.items()}
    assert np.isclose(reference["same_neighbourhood"], 5 / 11)
    assert np.isclose(reference["adjacent"], 13 / 66)
    assert np.isclose(reference["mean_graph_distance"], 3)
    if clustering_reference is None:
        clustering_reference = reference
    else:
        assert all(np.isclose(reference[name], clustering_reference[name]) for name in reference)

    curves = {name: [] for name in features}
    vectors = joint_spectra[case]["vectors"]
    eigenvalues = joint_spectra[case]["eigenvalues"]
    start_coordinates = vectors[model["start_index"], :]
    for step in joint_curve_times:
        # This spectral identity evaluates the exact finite-state law
        # q_t = P**t e_start in floating point; it is not a sampled record.
        probability = vectors @ (start_coordinates * eigenvalues**step)
        for name, feature in features.items():
            curves[name].append(float(feature @ probability))
    joint_clustering_curves[case] = curves
    # Reuse the separately computed matrix-power endpoint at t=100, so the
    # printed summaries are independently checkable against the curve values.
    joint_clustering_at_100[case] = {
        name: float(feature @ joint_endpoint_100[case])
        for name, feature in features.items()
    }
    time_100_index = joint_curve_times.index(100)
    assert all(np.isclose(curves[name][time_100_index], value, atol=1e-11)
               for name, value in joint_clustering_at_100[case].items())

print("Uniform 132-pair exclusion references:")
print("Same neighbourhood: 5/11 =", format(clustering_reference["same_neighbourhood"], ".10f"))
print("Adjacent stops: 13/66 =", format(clustering_reference["adjacent"], ".10f"))
print("Mean graph distance: 3 hops")
for case, values in joint_clustering_at_100.items():
    print(case, "t=100; same neighbourhood:", format(values["same_neighbourhood"], ".10f"),
          "adjacent:", format(values["adjacent"], ".10f"),
          "mean graph distance:", format(values["mean_graph_distance"], ".10f"))
print("Labelled-pair proximity is not a truck count or evidence of attraction.")
print("Graph distance counts edges, not travel time.")

clustering_title = "Same neighbourhood?<br>Labelled pair · exact law"
clustering_traces = [
    {"x": joint_curve_times, "y": curves["same_neighbourhood"], "name": case,
     "mode": "lines+markers", "line": {"color": plot_colours[case]}}
    for case, curves in joint_clustering_curves.items()
]
clustering_traces.append({
    "x": joint_curve_times,
    "y": [clustering_reference["same_neighbourhood"]] * len(joint_curve_times),
    "name": "5/11", "mode": "lines", "line": {"color": plot_ink, "dash": "dot"},
})
mplot(clustering_traces, title=clustering_title, xlabel="Moves t · log scale", ylabel="Pair probability",
      layout=spectral_layout(clustering_title,
                             xaxis={"type": "log", "automargin": True},
                             yaxis={"range": [0, 0.5], "automargin": True}))
