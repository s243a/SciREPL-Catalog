periodic_traces = []
periodic_results = {}
for stay_probability, colour in ((0.0, "#fbbf24"), (0.5, "#63c5ff")):
    kernel = np.array([[stay_probability, 1 - stay_probability],
                       [1 - stay_probability, stay_probability]])
    endpoint = np.array([1.0, 0.0])
    running_total = np.zeros(2)
    endpoints, averages = [], []
    for step in range(1, 13):
        endpoint = kernel @ endpoint
        running_total += endpoint
        endpoints.append(float(endpoint[0]))
        averages.append(float(running_total[0] / step))
    periodic_results[stay_probability] = {"endpoint": endpoints, "mean_record": averages}
    for kind, values, dash in (("endpoint", endpoints, "solid"), ("expected record", averages, "dot")):
        periodic_traces.append({"x": list(range(1, 13)), "y": values,
                                "name": "s=" + str(stay_probability) + " · " + kind,
                                "mode": "lines+markers", "line": {"color": colour, "dash": dash}})
periodic_title = "Alternation versus waiting<br>probability at state 0"
mplot(periodic_traces, title=periodic_title, xlabel="Moves t", ylabel="Probability",
      layout=spectral_layout(periodic_title, yaxis={"range": [-0.05, 1.05], "automargin": True}))
