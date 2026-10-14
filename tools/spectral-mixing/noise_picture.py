noise_lengths = [100, 300, 1000, 3000, 10000]
noise_traces = []
for case, spectrum in joint_spectra.items():
    rho = spectrum["eigenvalues"][1]
    standard_errors = [float(np.sqrt(finite_n_tau(np.array([rho]), n)[0] / n)) for n in noise_lengths]
    noise_traces.append({"x": noise_lengths, "y": standard_errors, "name": case,
                         "mode": "lines+markers", "line": {"color": plot_colours[case]}})
noise_title = "Slowest mode's uncertainty<br>stationary initialization"
mplot(noise_traces, title=noise_title, xlabel="Recorded moves n · log scale", ylabel="Standard error",
      layout=spectral_layout(noise_title, xaxis={"type": "log", "automargin": True}))

band_energy_traces = []
for case, spectrum in joint_spectra.items():
    whitening = joint_visit_summaries[case][visit_step]["whitening"]
    band_rates, band_energies = [], []
    for band in joint_spectral_bands[case]:
        # Band indices use full-spectrum numbering, excluding constant 0;
        # the energy array starts at nonconstant mode 1, hence subtract 1.
        indices = np.array(band["indices"]) - 1
        band_rates.append(1 - band["eigenvalue"])
        band_energies.append(float(whitening["mode_energy"][indices].mean()))
    band_energy_traces.append({"x": band_rates, "y": band_energies, "name": case,
                               "mode": "markers", "marker": {"color": plot_colours[case], "size": 6}})
energy_title = "Noise-adjusted band energy<br>one fixed-start record"
mplot(band_energy_traces, title=energy_title, xlabel="Decay rate μ · log scale", ylabel="Energy per mode",
      layout=spectral_layout(energy_title, xaxis={"type": "log", "automargin": True}))
print("Band points average modes with equal eigenvalues; W weights every mode equally.")
print("A fixed-start W near 1 does not certify endpoint mixing or histogram accuracy.")
