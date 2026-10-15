joint_endpoint_100 = {case: exact_endpoint_distribution(model["P"], model["start_index"], 100)
                      for case, model in joint_models.items()}
endpoint_colour_limit = max(float(values.max()) for values in joint_endpoint_100.values())
for case, model in joint_models.items():
    probability = joint_endpoint_100[case]
    show_pair_map(probability, model, case + " bridge · endpoint<br>t = 100 · 12 × 12",
                  endpoint_colour_limit, "Endpoint probability")
    marginal_a, marginal_b = pair_distribution_marginals(probability, model)
    pooled = pooled_stop_distribution(probability, model)
    print(case, "joint TV:", round(total_variation(probability, model["pi"]), 6),
          "pooled TV:", round(total_variation(pooled, np.full(12, 1 / 12)), 6))
    print("Individual marginal TV, A/B:",
          round(total_variation(marginal_a, np.full(12, 1 / 12)), 6),
          round(total_variation(marginal_b, np.full(12, 1 / 12)), 6))

joint_curve_times = [1, 3, 10, 30, 100, 300, 1000, 3000]
joint_endpoint_curve_traces = []
for case, model in joint_models.items():
    vectors = joint_spectra[case]["vectors"]
    eigenvalues = joint_spectra[case]["eigenvalues"]
    source = vectors[model["start_index"], :]
    joint_distances, pooled_distances = [], []
    for step in joint_curve_times:
        probability = vectors @ (source * eigenvalues**step)
        joint_distances.append(total_variation(probability, model["pi"]))
        pooled_distances.append(total_variation(pooled_stop_distribution(probability, model), np.full(12, 1 / 12)))
    for kind, values, dash in (("joint", joint_distances, "solid"), ("pooled", pooled_distances, "dot")):
        joint_endpoint_curve_traces.append({"x": joint_curve_times, "y": values, "name": case + " · " + kind,
                                           "mode": "lines+markers", "line": {"color": plot_colours[case], "dash": dash}})
joint_curve_title = "Joint versus pooled<br>exact endpoint distance"
mplot(joint_endpoint_curve_traces, title=joint_curve_title, xlabel="Moves t · log scale", ylabel="Total variation",
      layout=spectral_layout(joint_curve_title, xaxis={"type": "log", "automargin": True}))
