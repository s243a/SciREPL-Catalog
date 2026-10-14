spectrum_title = "Slow decay rates<br>μ = 1 − ρ"
spectrum_traces = []
for case in single_models:
    for kind, spectra, dash in (("one", single_spectra, "dot"), ("pair", joint_spectra, "solid")):
        rates = 1 - spectra[case]["eigenvalues"][1:]
        spectrum_traces.append({"x": list(range(1, min(12, len(rates)) + 1)),
                                "y": rates[:12].tolist(), "name": case + " · " + kind,
                                "mode": "lines+markers", "line": {"color": plot_colours[case], "dash": dash}})
        print(case, kind, "gap:", round(spectra[case]["gap"], 8))
mplot(spectrum_traces, title=spectrum_title, xlabel="Nonconstant mode rank", ylabel="Decay rate μ",
      layout=spectral_layout(spectrum_title, yaxis={"type": "log", "automargin": True}))
# The slowest pair eigenvalue is simple. Sign flips change neither this
# exchange relation nor the squared errors used in later plots.
for case, model in joint_models.items():
    slow = joint_spectra[case]["psi"][:, 1]
    swapped = np.array([slow[model["state_index"][(b, a)]] for a, b in model["states"]])
    assert np.allclose(swapped, -slow, atol=1e-10)
print("The slowest pair mode changes sign when truck labels A/B are swapped.")
