visit_step = spectral_checkpoints[-1]
visit_colour_limit = max(float(joint_visit_snapshots[case][visit_step]["distribution"].max())
                         for case in joint_models)
for case, model in joint_models.items():
    distribution = joint_visit_snapshots[case][visit_step]["distribution"]
    show_pair_map(distribution, model, case + " bridge · visits<br>n = " + str(visit_step) + " · 12 × 12",
                  visit_colour_limit, "Visit frequency")
    for step, summary in joint_visit_summaries[case].items():
        print(case, step, "visits; raw TV:", round(summary["empirical_tv"], 6),
              "stationary-reference W:", round(summary["W"], 6))

occupation_traces = []
for case, summaries in joint_visit_summaries.items():
    for kind, field, dash in (("sample", "empirical_tv", "solid"),
                              ("mean record", "expected_occupation", "dash"),
                              ("endpoint", "endpoint_tv", "dot")):
        values = [summary[field]["bias_tv"] if kind == "mean record" else summary[field]
                  for summary in summaries.values()]
        occupation_traces.append({"x": list(summaries), "y": values, "name": case + " · " + kind,
                                  "mode": "lines+markers", "line": {"color": plot_colours[case], "dash": dash}})
occupation_title = "Three different distances<br>fixed start (3, 9)"
occupation_layout = spectral_layout(occupation_title, height=470,
                                    xaxis={"type": "log", "automargin": True})
occupation_layout["margin"]["b"] = 140
mplot(occupation_traces, title=occupation_title, xlabel="Recorded moves n · log scale", ylabel="Total variation",
      layout=occupation_layout)
