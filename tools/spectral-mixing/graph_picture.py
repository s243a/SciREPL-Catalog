# A fixed, explicit palette keeps these charts readable in either app theme.
plot_background = "#1c2128"
plot_ink = "#e6edf3"
plot_colours = {"weak": "#fbbf24", "strong": "#63c5ff"}


def spectral_layout(title, height=420, **extra):
    """Use short two-line titles and a horizontal legend on narrow screens."""
    layout = {
        "height": height,
        "margin": {"t": 76, "b": 100, "l": 62, "r": 16},
        "title": {"text": title, "x": 0.5, "font": {"size": 14}},
        "paper_bgcolor": plot_background,
        "plot_bgcolor": plot_background,
        "font": {"size": 11, "color": plot_ink},
        "legend": {"orientation": "h", "x": 0, "y": -0.26, "font": {"size": 10}},
        "xaxis": {"automargin": True},
        "yaxis": {"automargin": True},
    }
    layout.update(extra)
    return layout


def show_pair_map(distribution, model, title, colour_limit, colour_label):
    """Plot 132 legal tiles using bars, supported by SciREPL's Plotly Basic.

    Diagonal bays are omitted. Legal zero values remain actual colour data.
    x=A's stop; y=B's stop. There are 13 boundaries around 12 tiles.
    """
    grid = pair_distribution_grid(distribution, model)
    rows, columns = np.nonzero(joint_legal_mask)
    values = grid[rows, columns]
    assert np.all(np.isfinite(values)) and np.all(values >= -1e-12)
    values = np.maximum(values, 0)
    labels = ["A=" + str(column) + ", B=" + str(row) + ": " + format(float(value), ".6f")
              for row, column, value in zip(rows, columns, values)]
    borders = ([{"type": "line", "x0": edge - 0.5, "x1": edge - 0.5,
                 "y0": -0.5, "y1": 11.5, "layer": "above",
                 "line": {"color": "rgba(230,237,243,0.3)", "width": 0.5}}
                for edge in range(13)]
               + [{"type": "line", "y0": edge - 0.5, "y1": edge - 0.5,
                   "x0": -0.5, "x1": 11.5, "layer": "above",
                   "line": {"color": "rgba(230,237,243,0.3)", "width": 0.5}}
                  for edge in range(13)])
    axis = {"range": [-0.5, 11.5], "showgrid": False, "zeroline": False,
            "tickmode": "array", "tickvals": list(range(12)), "automargin": True}
    layout = spectral_layout(title, height=460, showlegend=False,
                             barmode="overlay", bargap=0, shapes=borders,
                             xaxis=axis, yaxis=dict(axis))
    layout["plot_bgcolor"] = "#0b0e12"
    layout["margin"] = {"t": 76, "b": 140, "l": 65, "r": 12}
    mplot([{"type": "bar", "x": columns.tolist(), "y": [1] * len(rows),
            "base": (rows - 0.5).tolist(), "width": 1, "text": labels,
            "hoverinfo": "text", "textposition": "none",
            "marker": {"color": values.tolist(), "colorscale": "Viridis",
                       "cmin": 0, "cmax": float(colour_limit), "showscale": True,
                       "line": {"width": 0}, "colorbar": {
                           "orientation": "h", "x": 0.5, "y": -0.34,
                           "xanchor": "center", "yanchor": "top", "len": 0.9,
                           "thickness": 12, "tickformat": ".3f",
                           "title": {"text": colour_label, "side": "top"}}}}],
          title=title, xlabel="Truck A stop · 0–11", ylabel="Truck B stop · 0–11", layout=layout)


angles = 2 * np.pi * np.arange(6) / 6
route_x = np.concatenate((-1.6 + 0.9 * np.cos(angles), 1.6 - 0.9 * np.cos(angles)))
route_y = np.concatenate((0.9 * np.sin(angles), 0.9 * np.sin(angles)))
local_edge_x, local_edge_y = [], []
for first, second, weight in single_models["weak"]["edges"][:-1]:
    local_edge_x.extend([float(route_x[first]), float(route_x[second]), None])
    local_edge_y.extend([float(route_y[first]), float(route_y[second]), None])
route_title = "Two neighbourhoods<br>bridge 0 ↔ 6"
mplot([
    {"x": local_edge_x, "y": local_edge_y, "mode": "lines", "name": "Local edge",
     "line": {"color": "#8596a7", "width": 2}},
    {"x": [float(route_x[0]), float(route_x[6])], "y": [0, 0], "mode": "lines",
     "name": "Bridge", "line": {"color": "#fbbf24", "width": 4}},
    {"x": route_x.tolist(), "y": route_y.tolist(), "mode": "markers+text",
     "text": [str(stop) for stop in range(12)], "textposition": "top center",
     "name": "Loading bay", "marker": {"size": 11, "color": "#63c5ff"}},
], title=route_title, xlabel="West: 0–5 · East: 6–11", ylabel="",
    layout=spectral_layout(route_title, height=360,
                           xaxis={"showgrid": False, "zeroline": False, "showticklabels": False, "range": [-2.9, 2.9]},
                           yaxis={"showgrid": False, "zeroline": False, "showticklabels": False, "range": [-1.4, 1.4]}))
print("Waiting probabilities are not drawn as loops.")
