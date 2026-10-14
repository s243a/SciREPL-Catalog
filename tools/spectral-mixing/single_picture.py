single_times = np.arange(301)
single_endpoint_curves = {}
single_endpoint_100 = {}
for case, model in single_models.items():
    probability = np.zeros(12)
    probability[3] = 1
    distances = []
    for step in single_times:
        distances.append(float(0.5 * np.abs(probability - model["pi"]).sum()))
        if step == 100:
            single_endpoint_100[case] = probability.copy()
        probability = model["P"] @ probability
    single_endpoint_curves[case] = distances

single_title = "One truck's endpoint<br>start at stop 3"
mplot([{"x": single_times.tolist(), "y": values, "name": case,
        "line": {"color": plot_colours[case]}}
       for case, values in single_endpoint_curves.items()],
      title=single_title, xlabel="Moves t", ylabel="Total variation",
      layout=spectral_layout(single_title))
single_bar_title = "Where is the truck?<br>Endpoint at t = 100"
mplot([{"type": "bar", "x": list(range(12)), "y": values.tolist(), "name": case,
        "marker": {"color": plot_colours[case]}}
       for case, values in single_endpoint_100.items()]
      + [{"x": list(range(12)), "y": [1 / 12] * 12, "name": "Uniform target",
          "line": {"color": "#e6edf3", "dash": "dot"}}],
      title=single_bar_title, xlabel="Stop index · 0–11", ylabel="Endpoint probability",
      layout=spectral_layout(single_bar_title, barmode="group",
                             xaxis={"tickmode": "array", "tickvals": list(range(12))}))
