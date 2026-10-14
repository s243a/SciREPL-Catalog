variance_traces = []
for case, check in stationary_variance_checks.items():
    band_rates, band_ratios = [], []
    for band in joint_spectral_bands[case]:
        indices = np.array(band["indices"]) - 1
        band_rates.append(1 - band["eigenvalue"])
        band_ratios.append(float(check["variance_ratio"][indices].mean()))
    variance_traces.append({"x": band_rates, "y": band_ratios, "name": case,
                           "mode": "markers", "marker": {"color": plot_colours[case], "size": 6}})
    print(case, "stationary paths:", check["replications"], "moves each:", check["step_count"])
    print("Mean W:", round(check["mean_W"], 6), "Monte Carlo SE:", round(check["standard_error_W"], 6),
          "theoretical expectation:", check["stationary_expected_W"])
variance_traces.append({"x": [0.002, 1], "y": [1, 1], "name": "Reference 1",
                        "line": {"color": "#e6edf3", "dash": "dot"}})
variance_title = "Variance formula check<br>128 stationary routes"
mplot(variance_traces, title=variance_title, xlabel="Decay rate μ · log scale", ylabel="Empirical / theory",
      layout=spectral_layout(variance_title, xaxis={"type": "log", "automargin": True}))
