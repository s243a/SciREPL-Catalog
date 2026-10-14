# Reset the seed: the first coordinate follows the histogram's SAME path.
joint_rng = np.random.default_rng(mixing_seed)
joint_position = (0, 2)
joint_counts = np.zeros(joint_mask.shape, dtype=int)
joint_snapshots = {}
for step in range(1, max(mixing_checkpoints) + 1):
    permutation = mixing_moves[int(joint_rng.integers(len(mixing_moves)))]
    joint_position = tuple(int(permutation[position]) for position in joint_position)
    first, second = joint_position
    assert joint_position in joint_reachable
    joint_counts[corner_index[second], corner_index[first]] += 1
    if step in mixing_checkpoints:
        joint_snapshots[step] = joint_counts.copy() / step

tile_borders = ([{"type": "line", "xref": "x", "yref": "y", "x0": edge - 0.5,
                 "x1": edge - 0.5, "y0": -0.5, "y1": len(corner_positions) - 0.5,
                 "layer": "above", "line": {"color": "rgba(230,237,243,0.25)", "width": 0.6}}
                for edge in range(len(corner_positions) + 1)]
               + [{"type": "line", "xref": "x", "yref": "y", "y0": edge - 0.5,
                   "y1": edge - 0.5, "x0": -0.5, "x1": len(corner_positions) - 0.5,
                   "layer": "above", "line": {"color": "rgba(230,237,243,0.25)", "width": 0.6}}
                  for edge in range(len(corner_positions) + 1)])

for step in mixing_checkpoints:
    frequencies = joint_snapshots[step]
    assert np.isclose(frequencies.sum(), 1)
    assert np.all(frequencies[~joint_mask] == 0)
    assert np.allclose(frequencies.sum(axis=0), visit_snapshots[step])
    # Plotly Basic supports bar tiles, not its optional native heatmap trace.
    # Omit impossible cells; every reachable zero remains a colored tile.
    heat_rows, heat_columns = np.nonzero(joint_mask)
    heat_colors = frequencies[heat_rows, heat_columns].tolist()
    heat_labels = [str(int(corner_positions[column])) + ", " + str(int(corner_positions[row]))
                   + ": " + str(round(float(frequencies[row, column]), 6))
                   for row, column in zip(heat_rows, heat_columns)]
    joint_title = mixing_wrap("Two stickers") + f"<br>{step} " + mixing_wrap("steps") + "<br>24 × 24"
    mplot([{"type": "bar", "x": heat_columns.tolist(), "y": [1] * len(heat_columns),
            "base": (heat_rows - 0.5).tolist(), "width": 1,
            "text": heat_labels, "hoverinfo": "text", "textposition": "none",
            "marker": {"color": heat_colors, "colorscale": "Viridis", "cmin": 0,
                       "cmax": max(joint_target * 3, float(frequencies.max())),
                       "line": {"width": 0}, "showscale": True,
                       "colorbar": {"orientation": "h", "x": 0.5, "y": -0.35, "len": 0.85,
                                    "xanchor": "center", "yanchor": "top", "tickangle": 0,
                                    "tickformat": ".3f", "thickness": 12,
                                    "title": {"text": mixing_wrap("Visit frequency"), "side": "top"}}}}],
          title=joint_title,
          xlabel=mixing_wrap("Label 1 corner index"), ylabel=mixing_wrap("Label 3 corner index"),
          layout={"height": 460, "margin": {"t": 70, "b": 170, "l": 65, "r": 12},
                  "title": {"text": joint_title, "font": {"size": 14}, "x": 0.5},
                  "paper_bgcolor": "#1c2128", "plot_bgcolor": "#161b22",
                  "font": {"size": 11, "color": "#e6edf3"}, "showlegend": False,
                  "barmode": "overlay", "bargap": 0, "shapes": tile_borders,
                  "xaxis": {"range": [-0.5, len(corner_positions) - 0.5],
                            "showgrid": False, "zeroline": False,
                            "tickmode": "array", "tickvals": list(range(0, len(corner_positions), 4)) + [len(corner_positions) - 1],
                            "ticktext": mixing_index_ticks,
                            "automargin": True},
                  "yaxis": {"range": [-0.5, len(corner_positions) - 0.5],
                            "showgrid": False, "zeroline": False,
                            "tickmode": "array", "tickvals": list(range(0, len(corner_positions), 4)) + [len(corner_positions) - 1],
                            "ticktext": mixing_index_ticks,
                            "automargin": True}})
    pair_tv = float(np.abs(frequencies[joint_mask] - joint_target).sum() / 2)
    print(step, "steps; joint visit-average distance:", round(pair_tv, 6))
print("Uniform target per reachable ordered pair:", round(joint_target, 8))
