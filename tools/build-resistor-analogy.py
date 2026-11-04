#!/usr/bin/env python3
"""Build the English draft of the resistor-analogy workbook from readable cell sources.

    python3 tools/build-resistor-analogy.py          # write the .srwb
    python3 tools/build-resistor-analogy.py --check  # fail if the .srwb is stale

Cells are plain Markdown and Python (NumPy plus the app's built-in mplot only).
The full derivations live in docs/resistor-analogy-theory.md.
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "drafts/resistor-analogy/en/resistor-analogy.srwb"
TITLE = "Resistor Analogy: When Uncertainties Add in Series or Parallel"
THEORY = "https://github.com/s243a/SciREPL-Catalog/blob/main/docs/resistor-analogy-theory.md"

CELLS = []


def md(name, text):
    CELLS.append({"name": name, "type": "markdown", "language": "markdown", "code": text.strip("\n")})


def py(name, code):
    CELLS.append({"name": name, "type": "code", "language": "python", "code": code.strip("\n")})


SERIES_PARALLEL_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 330" role="img" aria-label="Series and parallel resistor analogy" style="display:block;width:100%;max-width:340px;height:auto;margin:1rem 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
<title>Series and parallel resistor analogy</title>
<desc>Top: two resistors in series, labelled v1 and v2, for a sum of independent inputs whose variances add. Bottom: two resistors in parallel, labelled v1 and v2, for independent estimates of one target whose precisions add.</desc>
<path d="M25 70 H55 l5 -10 l10 20 l10 -20 l10 20 l10 -20 l5 10 H145 l5 -10 l10 20 l10 -20 l10 20 l10 -20 l5 10 H275"/>
<path d="M25 230 H60 M60 200 V260 M60 200 H125 l5 -10 l10 20 l10 -20 l10 20 l10 -20 l5 10 H240 M60 260 H125 l5 -10 l10 20 l10 -20 l10 20 l10 -20 l5 10 H240 M240 200 V260 M240 230 H275"/>
<g fill="currentColor" stroke="none" font-family="sans-serif" font-size="15" text-anchor="middle">
<text x="150" y="24" font-weight="bold">Sum of inputs: series</text>
<text x="80" y="48">v₁</text><text x="170" y="48">v₂</text>
<text x="150" y="110">v = v₁ + v₂ (variances add)</text>
<text x="150" y="160" font-weight="bold">Estimates of one target: parallel</text>
<text x="150" y="184">v₁</text><text x="150" y="292">v₂</text>
<text x="150" y="320">1/v = 1/v₁ + 1/v₂ (precisions add)</text>
</g>
</svg>"""

PROBABILITY_TREE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 250" role="img" aria-label="Probability tree" style="display:block;width:100%;max-width:380px;height:auto;margin:1rem 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
<title>Probability tree</title>
<desc>A root with three branches: sunny 0.5, rain 0.3 and snow 0.2. Rain splits into light rain 0.6 and heavy rain 0.4. The path to heavy rain is highlighted: its probability is 0.3 times 0.4, 0.12, and its surprisal is the sum of the branch surprisals.</desc>
<path d="M25 110 L120 40 M25 110 L120 170"/>
<path d="M120 110 L215 140" />
<path d="M25 110 L120 110 L215 80" stroke-width="2"/>
<path d="M25 110 L120 110 L215 140" stroke-width="5" opacity="0.55"/>
<g fill="currentColor" stroke="none"><circle cx="25" cy="110" r="5"/><circle cx="120" cy="110" r="5"/></g>
<g fill="currentColor" stroke="none" font-family="sans-serif" font-size="13">
<text x="58" y="66">0.5</text><text x="66" y="104">0.3</text><text x="58" y="158">0.2</text>
<text x="160" y="88">0.6</text><text x="160" y="140">0.4</text>
<text x="126" y="44">sunny: 0.5</text><text x="126" y="174">snow: 0.2</text>
<text x="221" y="84">light: 0.18</text><text x="221" y="144" font-weight="bold">heavy: 0.12</text>
<text x="170" y="212" text-anchor="middle">−ln 0.12 = (−ln 0.3) + (−ln 0.4)</text>
<text x="170" y="236" text-anchor="middle">a path is a series circuit</text>
</g>
</svg>"""

# ---------------------------------------------------------------- introduction
md("intro", rf"""
# Resistor Analogy: When Uncertainties Add in Series or Parallel

Two familiar rules look like circuit laws:

- **Parallel:** independent estimates of the *same* quantity combine like resistors in parallel. Their precisions (1/variance) add.
- **Series:** independent uncertain *inputs to a sum* combine like resistors in series. Their variances add.

This lesson tests that analogy instead of memorising it. The analogy only works once you know **what is being combined** and **which assumptions hold**, so we keep three operations apart:

1. **Estimate fusion** combines several noisy estimates of the *same* target. Start by minimising the fused variance over weights that sum to one.
2. **Uncertainty propagation** combines the inputs to a sum, product or other function. Start from their joint distribution, or at least their covariance.
3. **Event composition** combines probabilities of *distinct* events. Start by naming the event and stating the dependence assumptions.

**How to use it.** Each investigation asks you to *predict* first, then shows the rule with its assumptions, units and whether it is exact or approximate. Edit the clearly marked parameter cell and rerun the cells below it. Every simulation uses a fixed seed and prints its sample size and a sampling tolerance. Fixed numerical checks print `PASS` lines; they use the textbook inputs, so they keep passing when you change the parameters.

Run the code cells **from top to bottom** the first time. The full derivations are in the companion [theory notes]({THEORY}).

**Scope.** All data here are synthetic. Investigation 7 uses made-up predictors in the style of two containment models, called CONT and jev; nothing in it is an observation from a real project.
""")

py("setup", r"""
import numpy as np

TOL = 1e-12     # deterministic checks: floating-point tolerance only
Z_LIMIT = 4.0   # Monte Carlo: |z| below this counts as agreement
MC_LOG = {}     # latest result of each simulation comparison, for the summary


def check_exact(label, got, want, tol=TOL):
    # Deterministic check with a relative floating-point tolerance.
    got, want = float(got), float(want)
    ok = abs(got - want) <= tol * max(1.0, abs(want))
    print(("PASS  " if ok else "FAIL  ") + f"{label}: got {got:.10g}, expected {want:.10g}")
    assert ok, label
    return got


def require_variances(variances):
    v = np.asarray(variances, dtype=float)
    if v.ndim != 1 or v.size == 0 or not np.all(np.isfinite(v)) or np.any(v <= 0):
        raise ValueError("Variances must be finite and strictly positive.")
    return v


def require_correlation(rho):
    rho = float(rho)
    if not -1.0 <= rho <= 1.0:
        raise ValueError("A correlation must lie between -1 and 1.")
    return rho


def mc_compare(label, samples, exact, what="variance"):
    # Compare a simulated moment with its exact value using its sampling error.
    # Mean: SE = s / sqrt(n).  Variance: SE = sqrt((m4 - s^4) / n).
    x = np.asarray(samples, dtype=float)
    n = x.size
    if what == "mean":
        estimate = x.mean()
        se = x.std(ddof=1) / np.sqrt(n)
    else:
        d = x - x.mean()
        estimate = d.var(ddof=1)
        se = np.sqrt(max(np.mean(d ** 4) - estimate ** 2, 0.0) / n)
    if se > 0:
        z = (estimate - exact) / se
    else:  # no spread at all, e.g. perfectly cancelling errors
        z = 0.0 if abs(estimate - exact) <= 1e-12 * max(1.0, abs(exact)) else float("inf")
    verdict = "agrees" if abs(z) < Z_LIMIT else "DISAGREES"
    print(f"{label}: n = {n}, simulated {what} {estimate:.5g} ± {se:.2g} (1 SE), "
          f"exact {exact:.5g}, z = {z:+.2f} → {verdict} (|z| < {Z_LIMIT:g})")
    MC_LOG[label] = {"label": label, "n": n, "estimate": estimate, "se": se, "exact": exact, "z": z}
    return estimate, se, z



def phone_layout(**overrides):
    # Room for a two-line title, with the legend below the chart, readable at 320 px.
    # The app draws light text, so keep a dark panel behind it in the light theme too.
    layout = {"height": 470, "paper_bgcolor": "#1c2128", "margin": {"t": 70, "b": 40, "l": 55, "r": 15},
              "xaxis": {"automargin": True}, "yaxis": {"automargin": True},
              "legend": {"orientation": "h", "x": 0, "y": -0.22, "yanchor": "top", "font": {"size": 10}}}
    layout.update(overrides)
    return layout


print("Ready: NumPy", np.__version__)
""")

# ------------------------------------------------------- 1. choose operation
md("choose-operation", rf"""
## Investigation 1 — choose the operation

**Notation and units.** Let θ be the target and xᵢ an observed estimate, both in some unit U.

| Symbol | Meaning | Units |
|---|---|---|
| $v_i = \operatorname{{Var}}(X_i)$ | variance of an estimator or uncertain input | U² |
| $\sigma_i = \sqrt{{v_i}}$ | standard deviation or standard error | U |
| $\tau_i = 1/v_i$ | precision | U⁻² |
| $v_i/\mu_i^2$ | relative variance, for a nonzero mean $\mu_i$ | none |

{SERIES_PARALLEL_SVG}

**Analogy, not identity.** Variance plays the algebraic role of resistance and precision the role of conductance, but variance is measured in U², not ohms. **Standard deviations do not obey these rules**: they combine in quadrature, not by plain addition.

**Predict.** Classify each example below as `"fusion"`, `"propagation"` or `"events"`. Type your answers into the next cell and run it.

- **A.** Two thermometers read the same water bath: 20.3 °C and 20.9 °C.
- **B.** Two rods, each measured with some uncertainty, are laid end to end. What is the total length?
- **C.** A rectangle's area comes from an uncertain width times an uncertain height.
- **D.** A machine works only if two independent parts both work.
- **E.** Two weather models each give a chance of rain in the same city tomorrow.
- **F.** Two independent backup generators: what is the chance that at least one starts?

[Theory: the three operations]({THEORY}#1-three-operations)
""")

py("classify", r"""
# Your answers: replace each None with "fusion", "propagation" or "events".
my_answers = {
    "A": None,
    "B": None,
    "C": None,
    "D": None,
    "E": None,
    "F": None,
}

KEY = {
    "A": ("fusion", "two readings of one target; precisions add when errors are independent"),
    "B": ("propagation", "a sum of different inputs; variances add (series)"),
    "C": ("propagation", "a product; relative variances add, approximately, when errors are small"),
    "D": ("events", "both distinct events must occur: multiply only under independence"),
    "E": ("fusion", "two predictions of ONE event, not two events; see Investigations 5 and 7"),
    "F": ("events", "at least one success: 1 minus the product of the failure probabilities"),
}

for item, (answer, why) in KEY.items():
    guess = my_answers[item]
    mark = "—" if guess is None else ("correct" if guess == answer else f"you said {guess}")
    print(f"{item}: {answer:<11} ({mark}) {why}")
""")

# ------------------------------------------------------- 2. parallel fusion
md("parallel-fusion", rf"""
## Investigation 2 — parallel fusion of estimates

**Operation:** estimate fusion. **Assumptions:** each estimator $X_i$ is unbiased for the same fixed θ, has a known finite positive variance $v_i$, and the errors are uncorrelated (independence is more than needed). We consider only linear combinations whose weights sum to one.

$$
\hat\theta=\sum_i w_i X_i,\qquad \sum_i w_i=1,
$$

$$
\operatorname{{Var}}(\hat\theta)=\sum_i w_i^2 v_i .
$$

Minimising this variance (with a Lagrange multiplier, or by completing the square) gives

$$
w_i=\frac{{1/v_i}}{{\sum_j 1/v_j}},\qquad v_{{\text{{fused}}}}=\frac{{1}}{{\sum_i 1/v_i}}.
$$

Precisions add, exactly like parallel conductances. **Status:** exact and optimal *within the stated linear unbiased class*. It does not need Gaussian errors, and it is not a universal rule for arbitrary predictors. With *estimated* variances the weights lose some of this optimality.

**Predict.** Estimates 10 and 14 have variances 4 and 9. Which estimate gets more weight, and is the fused variance below 4?

[Theory: deriving the weights]({THEORY}#2-parallel-fusion)
""")

py("fusion_parameters", r"""
# Parameters you can edit (units U and U²). Rerun this cell and the cells below it.
X_EST = [10.0, 14.0]   # estimates of the same target
V_EST = [4.0, 9.0]     # their error variances
THETA = 12.0           # true target, used only by the simulation
SEED = 2026
N_SIM = 20000
""")

py("fusion", r"""
def fuse_independent(estimates, variances):
    # Inverse-variance fusion: unbiased estimates with uncorrelated errors.
    x = np.asarray(estimates, dtype=float)
    v = require_variances(variances)
    if x.shape != v.shape:
        raise ValueError("Give exactly one variance per estimate.")
    precision = 1.0 / v
    w = precision / precision.sum()
    return w, float(w @ x), float(1.0 / precision.sum())


# Fixed textbook check, independent of the parameters above.
w, est, var = fuse_independent([10, 14], [4, 9])
check_exact("weight on x=10 is 9/13", w[0], 9 / 13)
check_exact("weight on x=14 is 4/13", w[1], 4 / 13)
check_exact("fused estimate is 146/13", est, 146 / 13)
check_exact("fused variance is 36/13", var, 36 / 13)

# Your parameters.
w, est, var = fuse_independent(X_EST, V_EST)
print("\nYour inputs")
for xi, vi, wi in zip(X_EST, V_EST, w):
    print(f"  x = {xi:8.4g}  v = {vi:8.4g} U²  weight = {wi:.4f}")
print(f"  fused estimate = {est:.6g} U, fused variance = {var:.6g} U²"
      f" (best single variance {min(V_EST):.6g} U²)")

# Simulation: unbiased Gaussian errors with the stated variances.
rng = np.random.default_rng(SEED)
errors = rng.normal(0.0, np.sqrt(V_EST), size=(N_SIM, len(V_EST)))
fused_draws = (THETA + errors) @ w
mc_compare("fused estimator variance", fused_draws, var)
mc_compare("fused estimator mean (unbiased)", fused_draws, THETA, what="mean")
""")

py("fusion_sweep", r"""
# Move the weight away from the optimum (first two estimates only).
v1, v2 = require_variances(V_EST)[:2]
grid = np.linspace(0.0, 1.0, 201)
curve = grid ** 2 * v1 + (1 - grid) ** 2 * v2
w_opt = (1 / v1) / (1 / v1 + 1 / v2)
v_opt = 1 / (1 / v1 + 1 / v2)
assert np.all(curve >= v_opt - TOL), "no weight beats the analytic minimum"
print(f"Analytic minimum: w = {w_opt:.4f}, variance = {v_opt:.4f} U²; "
      f"equal weights give {0.25 * (v1 + v2):.4f} U²")

mplot([
    {"x": grid, "y": curve, "mode": "lines", "name": "Var(w·X₁ + (1−w)·X₂)"},
    {"x": [w_opt], "y": [v_opt], "mode": "markers", "name": "analytic minimum",
     "marker": {"size": 11}},
    {"x": [0, 1], "y": [min(v1, v2)] * 2, "mode": "lines", "name": "best single estimate",
     "line": {"dash": "dot"}},
], title="Fused variance<br>vs the weight on estimate 1",
   xlabel="weight w on estimate 1", ylabel="variance (U²)", layout=phone_layout())
""")

# ----------------------------------------------------- 3. break independence
md("break-independence", rf"""
## Investigation 3 — break independence

**Correlated errors.** Let Σ be the error covariance matrix and **1** the all-ones vector. For a known, positive definite Σ, minimising $w^\top\Sigma w$ subject to $\mathbf 1^\top w=1$ gives

$$
w=\frac{{\Sigma^{{-1}}\mathbf 1}}{{\mathbf 1^\top\Sigma^{{-1}}\mathbf 1}},\qquad
v_{{\text{{fused}}}}=\frac{{1}}{{\mathbf 1^\top\Sigma^{{-1}}\mathbf 1}}.
$$

We compute $\Sigma^{{-1}}\mathbf 1$ with a linear solve, never an explicit inverse. Weights **can be negative**; forcing them to be nonnegative is a different optimisation. A **singular** Σ (for example, duplicated noise) needs separate analysis, not a blind inverse or pseudoinverse.

For two equal variances v and correlation ρ, the equal-weight average has the exact variance

$$
\operatorname{{Var}}\!\left(\tfrac{{X_1+X_2}}{{2}}\right)=\frac{{v(1+\rho)}}{{2}},
$$

which is the optimum for −1 < ρ < 1. At ρ = 0 the variance halves; at ρ = 1 the duplicate noise gives no gain.

**A shared error floor.** If $X_i=\theta+B+\varepsilon_i$, where the shared error B has mean 0 and variance s², and the εᵢ are independent with variances tᵢ, then the best fused variance is $s^2+1/\sum_i(1/t_i)$. **No amount of averaging removes s².**

**A fixed shared bias** b survives every average whose weights sum to one and adds b² to the mean squared error: MSE = variance + bias². Smaller variance does not by itself mean a more accurate predictor.

**Predict.** Two estimates with equal variance 4 and correlation 0.5: is the variance of their average 2, 3 or 4?

[Theory: correlated errors, the floor and bias]({THEORY}#3-correlated-errors-shared-floors-and-bias)
""")

py("correlation_parameters", r"""
# Parameters you can edit.
V_EQ = 4.0           # common variance of two estimates (U²)
RHO = 0.5            # correlation of their errors, between -1 and 1
SHARED_S2 = 1.0      # variance s² of an error shared by every estimate (U²)
T_EACH = 4.0         # variance of each estimate's own error (U²)
BIAS = 0.5           # fixed shared bias b (U)
SEED = 2026
N_SIM = 20000
""")

py("correlated_fusion", r"""
def fuse_correlated(estimates, cov):
    # Minimum-variance weights summing to one, for a known positive definite covariance.
    x = np.asarray(estimates, dtype=float)
    S = np.asarray(cov, dtype=float)
    if S.shape != (x.size, x.size) or not np.allclose(S, S.T):
        raise ValueError("The covariance must be a symmetric n×n matrix.")
    eigenvalues = np.linalg.eigvalsh(S)
    if eigenvalues.min() <= 1e-12 * eigenvalues.max():
        raise ValueError("The covariance is singular or not positive definite; "
                         "analyse it separately instead of inverting it.")
    if eigenvalues.max() / eigenvalues.min() > 1e10:
        print("Warning: the covariance is nearly singular; the weights are unstable.")
    a = np.linalg.solve(S, np.ones(x.size))
    w = a / a.sum()
    return w, float(w @ x), float(1.0 / a.sum())


def equal_average_variance(v, rho):
    return v * (1 + require_correlation(rho)) / 2


def pair_covariance(v1, v2, rho):
    c = require_correlation(rho) * np.sqrt(v1 * v2)
    return np.array([[v1, c], [c, v2]])


# Fixed checks.
for rho, want in [(0.0, 2.0), (0.5, 3.0), (1.0, 4.0)]:
    check_exact(f"equal average, v = 4, rho = {rho}", equal_average_variance(4.0, rho), want)
w, _, var = fuse_correlated([0, 0], pair_covariance(4.0, 4.0, 0.5))
check_exact("optimal weights for equal variances are 1/2", w[0], 0.5)
check_exact("optimal variance at rho = 0.5", var, 3.0)
w, _, var = fuse_correlated([0, 0], pair_covariance(1.0, 4.0, 0.8))
check_exact("v = (1, 4), rho = 0.8: weight 4/3", w[0], 4 / 3)
check_exact("v = (1, 4), rho = 0.8: weight -1/3 (negative!)", w[1], -1 / 3)
check_exact("v = (1, 4), rho = 0.8: fused variance 0.8 < 1", var, 0.8)
try:
    fuse_correlated([0, 0], pair_covariance(4.0, 4.0, 1.0))
    raise AssertionError("a singular covariance was accepted")
except ValueError as error:
    print("PASS  rho = 1 is rejected:", error)

# Your parameters, with a simulation of correlated Gaussian errors.
exact = equal_average_variance(V_EQ, RHO)
print(f"\nYour inputs: v = {V_EQ}, rho = {RHO}. Average variance {exact:.4g} U²; "
      f"assuming independence would claim {V_EQ / 2:.4g} U².")
# Correlated errors without a matrix factorisation, so rho = ±1 works too.
rng = np.random.default_rng(SEED)
g1, g2 = rng.standard_normal((2, N_SIM))
e1 = np.sqrt(V_EQ) * g1
e2 = np.sqrt(V_EQ) * (RHO * g1 + np.sqrt(1 - RHO ** 2) * g2)
mc_compare("variance of the equal average", (e1 + e2) / 2, exact)

rhos = np.linspace(-0.95, 1.0, 79)
mplot([
    {"x": rhos, "y": V_EQ * (1 + rhos) / 2, "mode": "lines", "name": "true: v(1+ρ)/2"},
    {"x": rhos, "y": np.full_like(rhos, V_EQ / 2), "mode": "lines", "name": "assumes independence: v/2",
     "line": {"dash": "dash"}},
    {"x": rhos, "y": np.full_like(rhos, V_EQ), "mode": "lines", "name": "one estimate alone",
     "line": {"dash": "dot"}},
], title="Correlation erodes<br>the gain from averaging",
   xlabel="error correlation ρ", ylabel="variance of the average (U²)", layout=phone_layout())
""")

py("floor_and_bias", r"""
def shared_floor_variance(s2, own_variances):
    t = require_variances(own_variances)
    if s2 < 0:
        raise ValueError("A variance cannot be negative.")
    return s2 + 1.0 / np.sum(1.0 / t)


check_exact("shared floor: s² = 1, t = (4, 9) gives 1 + 36/13", shared_floor_variance(1.0, [4, 9]), 49 / 13)
check_exact("duplicate information: averaging two copies leaves v = 4", equal_average_variance(4.0, 1.0), 4.0)

# Averaging n estimates that share one error B: the variance stops at s².
counts = np.arange(1, 21)
actual = np.array([shared_floor_variance(SHARED_S2, [T_EACH] * n) for n in counts])
naive = T_EACH / counts
print(f"\nWith s² = {SHARED_S2} and t = {T_EACH}: n = 20 gives {actual[-1]:.4g} U², "
      f"never below the floor {SHARED_S2:g} U² (ignoring B would claim {naive[-1]:.4g}).")

# Simulation: X_i = theta + b + B + eps_i, averaged over 5 estimates.
rng = np.random.default_rng(SEED)
n_est = 5
theta = 0.0
B = rng.normal(0.0, np.sqrt(SHARED_S2), size=N_SIM)
eps = rng.normal(0.0, np.sqrt(T_EACH), size=(N_SIM, n_est))
fused = theta + BIAS + B + eps.mean(axis=1)
error = fused - theta
variance, bias = error.var(), error.mean()
mse = np.mean(error ** 2)
print(f"\nAverage of {n_est} estimates, n = {N_SIM} simulations:")
print(f"  variance {variance:.4f}   bias {bias:+.4f}   bias² {bias ** 2:.4f}   MSE {mse:.4f}")
print(f"  exact:   variance {shared_floor_variance(SHARED_S2, [T_EACH] * n_est):.4f}"
      f"   bias {BIAS:+.4f}   MSE {shared_floor_variance(SHARED_S2, [T_EACH] * n_est) + BIAS ** 2:.4f}")
assert abs(mse - (variance + bias ** 2)) < 1e-9, "MSE = variance + bias² in the sample too"
mc_compare("variance with a shared error", fused, shared_floor_variance(SHARED_S2, [T_EACH] * n_est))
mc_compare("mean with a fixed bias (theta + b)", fused, theta + BIAS, what="mean")

mplot([
    {"x": counts, "y": actual, "mode": "lines+markers", "name": "true: s² + t/n"},
    {"x": counts, "y": naive, "mode": "lines", "name": "ignores the shared error: t/n",
     "line": {"dash": "dash"}},
    {"x": counts, "y": np.full(counts.size, SHARED_S2), "mode": "lines", "name": "floor s²",
     "line": {"dash": "dot"}},
], title="A shared error<br>cannot be averaged away",
   xlabel="estimates averaged, n", ylabel="variance (U²)", layout=phone_layout())
""")

# ------------------------------------------------------- 4. series & products
md("series-products", rf"""
## Investigation 4 — series and products

**Sums give the exact series rule.** For a sum of *different* uncertain inputs,

$$
\operatorname{{Var}}(X+Y)=v_X+v_Y+2\operatorname{{Cov}}(X,Y).
$$

With independent inputs the covariance vanishes and variances add exactly. In a weighted sum each variance is multiplied by the square of its coefficient. Standard deviations combine in **quadrature**: SDs 2 and 3 give √13 ≈ 3.61, not 5. This is a different task from fusion: adding an input *increases* the total variance.

**Products: a small-error approximation.** For Z = XY, with means μ and covariance c, the first-order (delta) approximation is

$$
\operatorname{{Var}}(Z)\approx \mu_Y^2v_X+\mu_X^2v_Y+2\mu_X\mu_Yc .
$$

Dividing by the nominal product squared gives the relative form

$$
\frac{{\operatorname{{Var}}(Z)}}{{(\mu_X\mu_Y)^2}}\approx\frac{{v_X}}{{\mu_X^2}}+\frac{{v_Y}}{{\mu_Y^2}}+\frac{{2c}}{{\mu_X\mu_Y}}.
$$

With independent inputs, **relative variances play the role of resistance** and add (approximately). The relative form needs nonzero means and small relative fluctuations.

**Exact, for independent inputs** with finite second moments:

$$
\operatorname{{Var}}(XY)=\mu_Y^2v_X+\mu_X^2v_Y+v_Xv_Y ,
$$

and for any number of independent inputs

$$
\operatorname{{Var}}\Big(\prod_i X_i\Big)=\prod_i(\mu_i^2+v_i)-\prod_i\mu_i^2 .
$$

The delta approximation drops the final $v_Xv_Y$ term.

**The log route is exact only on the log scale.** For strictly positive inputs, $\log\prod_i X_i=\sum_i\log X_i$, so independent log-variances add exactly. Getting back to the original scale needs a distributional calculation: exponentiating a log-variance is **not** the variance of the product.

**Predict.** Means 2 and 3 with SDs 1 and 1: does the delta approximation over- or under-state the exact product variance?

[Theory: delta method and exact products]({THEORY}#4-series-sums-and-products)
""")

py("product_parameters", r"""
# Parameters you can edit.
MU = [2.0, 3.0]      # means of X and Y
SD = [0.1, 0.2]      # standard deviations of X and Y (independent)
LOG_SD = [0.3, 0.4]  # log route: X, Y lognormal with means MU; SDs of log X and log Y
SEED = 2026
N_SIM = 200000
""")

py("sums_and_products", r"""
def sum_variance(variances, coefficients=None):
    # Independent inputs: Var(sum a_i X_i) = sum a_i² v_i.
    v = require_variances(variances)
    a = np.ones_like(v) if coefficients is None else np.asarray(coefficients, dtype=float)
    return float(np.sum(a ** 2 * v))


def product_exact(means, variances):
    # Independent inputs: Var(prod X_i) = prod(mu² + v) - prod(mu²).
    mu = np.asarray(means, dtype=float)
    v = require_variances(variances)
    return float(np.prod(mu)), float(np.prod(mu ** 2 + v) - np.prod(mu ** 2))


def product_delta(means, variances, cov=0.0):
    (mx, my), (vx, vy) = np.asarray(means, dtype=float), require_variances(variances)
    return float(my ** 2 * vx + mx ** 2 * vy + 2 * mx * my * cov)


def warn_near_zero(means, sds, ratio=3.0):
    for i, (m, s) in enumerate(zip(means, sds)):
        if abs(m) < ratio * s:
            print(f"Warning: input {i + 1} has |mean| < {ratio:g} SD; relative variances are "
                  "unreliable here. Use absolute variances, and compare delta with exact.")


check_exact("independent sum, v = (4, 9): variance 13", sum_variance([4, 9]), 13)
check_exact("its SD is √13, not 5", np.sqrt(sum_variance([4, 9])), np.sqrt(13))
mean, var = product_exact([2, 3], [0.1 ** 2, 0.2 ** 2])
check_exact("product mean, means (2, 3)", mean, 6)
check_exact("exact product variance, SDs (0.1, 0.2)", var, 0.2504)
check_exact("delta product variance, SDs (0.1, 0.2)", product_delta([2, 3], [0.01, 0.04]), 0.25)
check_exact("exact product variance, SDs (1, 1)", product_exact([2, 3], [1, 1])[1], 14)
check_exact("delta product variance, SDs (1, 1)", product_delta([2, 3], [1, 1]), 13)

v = np.square(SD)
mean, exact = product_exact(MU, v)
delta = product_delta(MU, v)
print(f"\nYour inputs: product mean {mean:.6g}, exact variance {exact:.6g}, delta {delta:.6g}"
      + (f" (delta / exact = {delta / exact:.4f})" if exact > 0 else ""))
if all(m != 0 for m in MU):
    rel = v / np.square(MU)
    print("Relative variances " + " + ".join(f"{r:.4g}" for r in rel) + f" = {rel.sum():.4g}; "
          f"exact relative variance {exact / mean ** 2:.4g}")
else:
    print("A mean is 0, so relative variances v / μ² are undefined; the absolute variances above still hold.")
warn_near_zero(MU, SD)

rng = np.random.default_rng(SEED)
X = rng.normal(MU[0], SD[0], N_SIM)
Y = rng.normal(MU[1], SD[1], N_SIM)
mc_compare("product variance against the exact formula", X * Y, exact)
mc_compare("product mean", X * Y, mean, what="mean")
""")

py("product_sweeps", r"""
# 1) Grow both relative errors together: delta falls behind the exact value.
scale = np.linspace(0.1, 12, 60)
exact_curve = np.array([product_exact(MU, np.square(np.multiply(SD, k)))[1] for k in scale])
delta_curve = np.array([product_delta(MU, np.square(np.multiply(SD, k))) for k in scale])
mplot([
    {"x": scale, "y": exact_curve, "mode": "lines", "name": "exact (independent)"},
    {"x": scale, "y": delta_curve, "mode": "lines", "name": "delta approximation",
     "line": {"dash": "dash"}},
], title="Product variance<br>as relative errors grow",
   xlabel="multiplier on both SDs", ylabel="Var(XY)", layout=phone_layout())

# 2) Move the mean of X toward zero: the relative form blows up, the absolute one does not.
mx = np.linspace(2.0, 0.02, 100)
absolute = np.array([product_exact([m, MU[1]], np.square(SD))[1] for m in mx])
if MU[1] == 0 or absolute.min() <= 0:
    # Outside the relative form's domain: it divides by (μX μY)², or there is no variance at all.
    print("Skipped the relative-variance sweep: it needs a nonzero mean of Y and some variance. "
          "The absolute variances still apply.")
else:
    relative = absolute / (mx * MU[1]) ** 2
    print(f"Mean of X from 2 to 0.02: absolute variance {absolute[0]:.4g} → {absolute[-1]:.4g}; "
          f"relative variance {relative[0]:.4g} → {relative[-1]:.4g}.")
    mplot([
        {"x": mx, "y": relative, "mode": "lines", "name": "relative variance Var(XY)/(μXμY)²"},
        {"x": [3 * SD[0]] * 2, "y": [0, float(relative.max())], "mode": "lines",
         "name": "|μX| = 3 SD", "line": {"dash": "dot"}},
    ], title="Near zero, relative<br>uncertainty is meaningless",
       xlabel="mean of X", ylabel="relative variance",
       layout=phone_layout(yaxis={"type": "log", "dtick": 1, "automargin": True}))
""")

py("log_route", r"""
# Log route: log X and log Y independent normals, so X and Y are lognormal with means MU.
# A lognormal with mean mu and log-SD s has log-mean ln(mu) - s²/2 (its median is below its mean).
check_exact("log variances add: 0.3² + 0.4² = 0.25", float(np.sum(np.square([0.3, 0.4]))), 0.25)
s2 = np.square(LOG_SD)
log_var = float(s2.sum())                               # exact on the log scale
if min(MU) <= 0:
    print("Skipped the log route: logarithms need positive inputs, and a lognormal has a positive "
          "mean. Edit MU to positive means to run it.")
else:
    z_mean = float(np.prod(MU))                         # independent: E[XY] = E[X] E[Y]
    z_var = z_mean ** 2 * float(np.expm1(log_var))      # exact lognormal variance of Z
    print(f"Var(log Z) = {log_var:.4g}. Wrong shortcut exp(Var(log Z)) = {np.exp(log_var):.4g}; "
          f"actual Var(Z) = {z_var:.4g} for this lognormal model with mean {z_mean:.4g}.")

    rng = np.random.default_rng(SEED)
    LX = rng.normal(np.log(MU[0]) - s2[0] / 2, LOG_SD[0], N_SIM)
    LY = rng.normal(np.log(MU[1]) - s2[1] / 2, LOG_SD[1], N_SIM)
    mc_compare("variance of log Z", LX + LY, log_var)
    mc_compare("mean of Z (lognormal)", np.exp(LX + LY), z_mean, what="mean")
    mc_compare("variance of Z (lognormal)", np.exp(LX + LY), z_var)
""")

# ------------------------------------------------------- 5. events vs scores
md("events-vs-scores", rf"""
## Investigation 5 — events versus scores

**Event composition.** For *independent* success events Aᵢ with probabilities pᵢ, three different questions (all succeed; at least one fails; at least one succeeds) have three different answers:

$$
P(\text{{all succeed}})=\prod_i p_i ,
$$

$$
P(\text{{any fails}})=1-\prod_i p_i ,
$$

$$
P(\text{{any succeeds}})=1-\prod_i(1-p_i).
$$

In reliability engineering, "series" and "parallel" usually mean these event rules, **not** estimator variances. Without independence, keep the joint probabilities or state a dependence model.

**Two scores for one event are not two events.** If two models both estimate the probability of the *same* outcome, their outputs are two predictions of one event, and their training data, features and errors may overlap. Neither multiplying the scores nor one minus the product of their complements is justified just because there are two models.

**Duplicate evidence.** If 0.8 is the probability of the event given some information, a second copy of that same information leaves the probability at 0.8, not 0.64 or 0.96.

**Complements** keep variance exactly: $\operatorname{{Var}}(1-Z)=\operatorname{{Var}}(Z)$. That says nothing about independence between other estimates or events.

**Predict.** Two models each output 0.8 for the same event, from the same information. What is the probability of the event?

[Theory: events, duplicate evidence and odds]({THEORY}#5-events-versus-scores)
""")

py("event_parameters", r"""
# Parameters you can edit.
P = [0.8, 0.6]     # success probabilities of distinct events
PRIOR = 0.5        # prior probability for the optional odds example
SEED = 2026
N_SIM = 200000
""")

py("events", r"""
def all_succeed(p):
    return float(np.prod(p))


def any_fail(p):
    return 1.0 - float(np.prod(p))


def any_succeed(p):
    return 1.0 - float(np.prod(1.0 - np.asarray(p, dtype=float)))


check_exact("independent, p = (0.8, 0.6): all succeed", all_succeed([0.8, 0.6]), 0.48)
check_exact("at least one fails", any_fail([0.8, 0.6]), 0.52)
check_exact("at least one succeeds", any_succeed([0.8, 0.6]), 0.92)

p = np.asarray(P, dtype=float)
if np.any((p < 0) | (p > 1)):
    raise ValueError("Probabilities must lie between 0 and 1.")
rng = np.random.default_rng(SEED)
independent = rng.random((N_SIM, p.size)) < p
mc_compare("P(all succeed), independent events", independent.all(axis=1), all_succeed(p), what="mean")

# Dependent events: both driven by ONE uniform draw (the strongest positive dependence).
u = rng.random(N_SIM)
shared = u[:, None] < p
print(f"Driven by one shared cause: P(all succeed) ≈ {shared.all(axis=1).mean():.4f} "
      f"(exact {p.min():.4f}), not the independent {all_succeed(p):.4f}.")
""")

py("duplicate_scores", r"""
# Cases whose information gives P(event | information) = 0.8.
rng = np.random.default_rng(SEED)
outcome = rng.random(N_SIM) < 0.8
score_a = np.full(N_SIM, 0.8)   # model A sees the information
score_b = score_a.copy()        # model B sees the SAME information

check_exact("averaging identical scores leaves 0.8", np.mean([0.8, 0.8]), 0.8)
mc_compare("observed frequency of the event", outcome, 0.8, what="mean")
print(f"Product of the scores claims {0.8 * 0.8:.2f}; '1 - (0.2)²' claims {1 - 0.2 ** 2:.2f}. "
      "Both are wrong for duplicated information.")

# Complement: Var(1 - Z) = Var(Z) exactly (up to rounding).
Z = rng.beta(2.0, 5.0, 1000)
check_exact("Var(1 - Z) = Var(Z)", np.var(1 - Z), np.var(Z), tol=1e-10)


# Optional: combining posterior odds from conditionally independent evidence.
def odds(q):
    return q / (1 - q)


def combine_posteriors(p1, p2, prior):
    # Valid only if the two pieces of evidence are independent given the event AND
    # given its complement. Each posterior already contains the prior, so divide once.
    o = odds(p1) * odds(p2) / odds(prior)
    return o / (1 + o)


check_exact("independent evidence, prior 0.5, posteriors 0.8 and 0.8", combine_posteriors(0.8, 0.8, 0.5), 16 / 17)
print(f"With prior {PRIOR}: combined posterior {combine_posteriors(0.8, 0.8, PRIOR):.4f} "
      "if the evidence were independent; 0.8 if it is the same evidence.")
""")

# ------------------------------------------------------- 6. more circuits
md("more-circuits", rf"""
## Investigation 6 — more circuits

Investigations 2–4 used variance as resistance, and Investigation 5 found that raw event probabilities follow neither rule. Here are four other exact dictionaries between circuits and probability, each with its own assumptions: A–C below, and probability trees (D) after the random-walk cell.

**A. A noisy estimate is a voltage source with internal resistance.** Model estimate i as a source at potential $x_i$ behind a resistance $v_i$, and join all the sources at one node. Kirchhoff's current law, $\sum_i (x_i-V)/v_i=0$, puts the node at

$$
V=\frac{{\sum_i x_i/v_i}}{{\sum_i 1/v_i}},
$$

the inverse-variance estimate (Millman's theorem). The resistance seen from the node is $1/\sum_i(1/v_i)$, the fused variance. Together they are the Thévenin equivalent of the sources. So what sits *across* an element is the value of the random variable, and its uncertainty is the resistance. Assumptions: those of Investigation 2.

**B. Log probabilities make the event rules additive.** For independent parts that each work with probability p, define

$$
r=-\ln p,\qquad g=-\ln(1-p).
$$

A **series** system (every part must work) multiplies the $p_i$, so the r's add like resistances. A **parallel** system (any part will do) multiplies the failure probabilities, so the g's add like conductances. They are not reciprocals; instead they satisfy

$$
e^{{-r}}+e^{{-g}}=1,
$$

which is symmetric in r and g, just as $rg=1$ is for resistors. So the map from r to g, applied twice, returns r. Near p = 1, $r\approx 1-p$: adding failure probabilities in series is the union bound. A series–parallel network of independent parts therefore reduces bottom-up like resistors. A part that appears twice, or a bridge that is not series–parallel, needs enumeration or conditioning instead.

**Entropy during the reduction.** A part's state has binary entropy $h(p)=p\,r+(1-p)\,g$ nats, its expected surprisal. Each merge keeps the probability of the merged outcome exactly, so its entropy too, but forgets *which* parts failed. The amount forgotten is a conditional entropy, never negative, so reducing does lose entropy. The bookkeeping is exact:

$$
\sum_{{\text{{parts}}}} h(p_i)=h(P_{{\text{{system}}}})+\sum_{{\text{{merges}}}}\text{{lost}}.
$$

The reduction gives the entropy of the system's outcome exactly; it is not an approximation to the entropy of the whole network.

**C. Random walks: here the voltage is a probability.** On a network of conductances $g_{{ij}}$, let a walker step from node i to a neighbour j with probability $g_{{ij}}/C_i$, where $C_i$ is the total conductance at i. Hold node a at 1 V and node b at 0 V. Then:

- the voltage at a node is the probability that a walk from there reaches a before b;
- a walk leaving a reaches b before returning with probability $C_{{\text{{eff}}}}/C_a$;
- a Gaussian field with energy $\tfrac12\sum g_{{ij}}(x_i-x_j)^2$ and $x_b=0$ has $\operatorname{{Var}}(X_a)=R_{{\text{{eff}}}}(a,b)$. Here variance is literally resistance.

**Predict.** Two parts in series, p = 0.8 and 0.6, work together with probability 0.48. Is the entropy of "the system works or not" larger or smaller than the entropy of both parts' states?

[Theory: more circuits]({THEORY}#6-more-circuits)
""")

py("circuit_parameters", r"""
# Parameters you can edit.
# Reliability network: a number is one part's probability of working; ("series", [...]) needs
# every branch, ("parallel", [...]) needs any branch. All parts are independent.
NETWORK = ("series", [("parallel", [0.9, 0.7]), 0.95, ("parallel", [0.8, ("series", [0.6, 0.9])])])
# Random-walk network: (node, node, conductance). Node "a" is held at 1 V and node "b" at 0 V.
EDGES = [("a", "c", 1.0), ("a", "d", 2.0), ("c", "d", 1.0), ("c", "b", 2.0), ("d", "b", 1.0)]
START = "c"     # where the hitting-probability walks start
# Probability tree: a node is a list of (conditional probability, child); a leaf is a name.
TREE = [(0.5, "sunny"), (0.3, [(0.6, "light rain"), (0.4, "heavy rain")]), (0.2, "snow")]
SEED = 2026
N_SIM = 20000
""")

py("voltage_sources", r"""
def millman(potentials, resistances):
    # Node joined to sources at potentials x_i through internal resistances v_i.
    x = np.asarray(potentials, dtype=float)
    g = 1.0 / require_variances(resistances)
    if x.shape != g.shape:
        raise ValueError("Give exactly one resistance per source.")
    V = float(g @ x / g.sum())
    assert abs(g @ (x - V)) <= 1e-9 * max(1.0, float(np.abs(g * x).sum())), "Kirchhoff's current law"
    return V, float(1.0 / g.sum())   # Thévenin potential and resistance


V, R = millman([10, 14], [4, 9])
check_exact("node potential = fused estimate 146/13", V, 146 / 13)
check_exact("resistance seen = fused variance 36/13", R, 36 / 13)
# Thévenin equivalents combine like sources, so fusing in stages gives the same answer.
V12, R12 = millman([10, 14], [4, 9])
V_staged, R_staged = millman([V12, 11], [R12, 1])
V_once, R_once = millman([10, 14, 11], [4, 9, 1])
check_exact("staged fusion: same potential", V_staged, V_once)
check_exact("staged fusion: same resistance", R_staged, R_once)

V, R = millman(X_EST, V_EST)
_, est, var = fuse_independent(X_EST, V_EST)
print(f"\nYour Investigation 2 inputs: node at {V:.6g} U, resistance seen {R:.6g} U² "
      f"(fusion gave {est:.6g} U and {var:.6g} U²).")
""")

py("log_reliability", r"""
def require_probability(p):
    p = float(p)
    if not 0.0 < p < 1.0:
        raise ValueError("Each part's probability must lie strictly between 0 and 1.")
    return p


def resistance(p):        # r = -ln p: adds in series
    return float(-np.log(require_probability(p)))


def conductance(p):       # g = -ln(1 - p): adds in parallel
    return float(-np.log1p(-require_probability(p)))


def dual(x):              # r -> g and g -> r, because exp(-r) + exp(-g) = 1
    return float(-np.log(-np.expm1(-x)))


def entropy(p):           # binary entropy in nats
    return p * resistance(p) + (1 - p) * conductance(p)


def reduce_network(block, steps):
    # Bottom-up reduction; records the entropy each merge forgets.
    if not isinstance(block, tuple):
        return require_probability(block)
    kind, parts = block
    ps = [reduce_network(part, steps) for part in parts]
    if kind == "series":
        total = sum(resistance(p) for p in ps)
        p_out, rule = float(np.exp(-total)), f"r = {total:.4f}"
    elif kind == "parallel":
        total = sum(conductance(p) for p in ps)
        p_out, rule = float(-np.expm1(-total)), f"g = {total:.4f}"
    else:
        raise ValueError('Each block must be ("series", [...]) or ("parallel", [...]).')
    lost = sum(entropy(p) for p in ps) - entropy(p_out)
    steps.append({"kind": kind, "inputs": ps, "rule": rule, "p": p_out, "lost": lost})
    return p_out


def leaves(block):
    return [require_probability(block)] if not isinstance(block, tuple) else \
        [p for part in block[1] for p in leaves(part)]


def works(block, columns):
    # Structure function: does the block work, given an iterator over part states?
    if not isinstance(block, tuple):
        return next(columns)
    values = [works(part, columns) for part in block[1]]
    return np.logical_and.reduce(values) if block[0] == "series" else np.logical_or.reduce(values)


def enumerate_network(block):
    # Brute force over every combination of part states: P(system), H(parts | system).
    p = np.array(leaves(block))
    states = (np.arange(2 ** p.size)[:, None] >> np.arange(p.size)) & 1 == 1
    weight = np.prod(np.where(states, p, 1 - p), axis=1)
    up = works(block, iter(states.T))
    conditional = 0.0
    for outcome in (up, ~up):
        q = weight[outcome] / weight[outcome].sum()
        conditional -= weight[outcome].sum() * np.sum(q * np.log(q))
    return float(weight[up].sum()), float(conditional)


check_exact("series by resistances, p = (0.8, 0.6)", np.exp(-(resistance(0.8) + resistance(0.6))), 0.48)
check_exact("parallel by conductances, p = (0.8, 0.6)", -np.expm1(-(conductance(0.8) + conductance(0.6))), 0.92)
for x in (0.1, 1.0, 3.0):
    check_exact(f"dual(dual({x:g})) = {x:g}", dual(dual(x)), x, tol=1e-10)
check_exact("dual(r) = g for p = 0.8", dual(resistance(0.8)), conductance(0.8), tol=1e-10)
steps = []
P_sys = reduce_network(("series", [0.8, 0.6]), steps)
check_exact("two-part series: lost entropy = H(parts | outcome)", steps[0]["lost"],
            enumerate_network(("series", [0.8, 0.6]))[1])

# Your network, reduced bottom-up.
steps = []
P_sys = reduce_network(NETWORK, steps)
n_parts = len(leaves(NETWORK))
print(f"\nYour network has {n_parts} part{'s' * (n_parts != 1)}. Bottom-up reduction:"
      + ("" if steps else " nothing to merge, so no entropy is lost."))
for i, s in enumerate(steps, 1):
    print(f"  {i}. {s['kind']:<8} of " + ", ".join(f"{p:.4g}" for p in s["inputs"])
          + f": {s['rule']} → p = {s['p']:.6g}; entropy kept {entropy(s['p']):.4f}, lost {s['lost']:.4f}")
P_enum, H_given = enumerate_network(NETWORK)
total = sum(entropy(p) for p in leaves(NETWORK))
check_exact("reduction matches brute-force enumeration", P_sys, P_enum)
check_exact("total lost = H(parts | system outcome)", sum(s["lost"] for s in steps), H_given, tol=1e-10)
print(f"Entropy (nats): parts {total:.4f} = system outcome {entropy(P_sys):.4f} "
      f"+ forgotten {total - entropy(P_sys):.4f}")
if steps and steps[-1]["kind"] == "series":   # union bound over the top-level series branches
    print(f"Failure probability {1 - P_sys:.4f} ≤ {sum(1 - p for p in steps[-1]['inputs']):.4f}, "
          "the sum of the series branches' failure probabilities (the union bound).")

rng = np.random.default_rng(SEED)
p_parts = np.array(leaves(NETWORK))
simulated = rng.random((N_SIM, p_parts.size)) < p_parts
mc_compare("network works (simulated parts)", works(NETWORK, iter(simulated.T)), P_sys, what="mean")
""")

py("reliability_duality", r"""
# Two dualities: resistors (g = 1/r) and log probabilities (exp(-r) + exp(-g) = 1).
r = np.linspace(0.05, 4.0, 160)
g_log = np.array([dual(x) for x in r])
mplot([
    {"x": r, "y": g_log, "mode": "lines", "name": "g = −ln(1 − e⁻ʳ)"},
    {"x": r, "y": 1 / r, "mode": "lines", "name": "g = 1/r", "line": {"dash": "dash"}},
    {"x": [0, 4], "y": [0, 4], "mode": "lines", "name": "g = r (mirror line)", "line": {"dash": "dot"}},
], title="Two series–parallel<br>dualities",
   xlabel="series quantity r", ylabel="parallel quantity g",
   layout=phone_layout(yaxis={"range": [0, 4], "automargin": True}, xaxis={"range": [0, 4], "automargin": True}))
print("Both curves are mirror images of themselves in the dotted line: applying the map twice returns r.")
""")

py("random_walks", r"""
def network(edges):
    nodes = sorted({n for edge in edges for n in edge[:2]})
    if "a" not in nodes or "b" not in nodes:
        raise ValueError('The network needs nodes "a" and "b".')
    index = {n: i for i, n in enumerate(nodes)}
    L = np.zeros((len(nodes), len(nodes)))   # weighted graph Laplacian
    for u, v, c in edges:
        if not c > 0 or u == v:
            raise ValueError("Each edge joins two different nodes with a positive conductance.")
        i, j = index[u], index[v]
        L[i, i] += c; L[j, j] += c; L[i, j] -= c; L[j, i] -= c
    return nodes, index, L


def voltages(edges):
    # Kirchhoff's current law at every node except a (1 V) and b (0 V).
    nodes, index, L = network(edges)
    a, b = index["a"], index["b"]
    inner = [i for i in range(len(nodes)) if i not in (a, b)]
    V = np.zeros(len(nodes))
    V[a] = 1.0
    if inner:
        A = L[np.ix_(inner, inner)]
        if np.linalg.matrix_rank(A) < len(inner):
            raise ValueError("Every node must connect to a or b.")
        V[inner] = np.linalg.solve(A, -L[inner, a])
    C_eff = float(L[a] @ V)   # current out of a at 1 V
    return nodes, index, L, V, C_eff


def walk(L, start, absorbing, rng, n, first_step=False):
    # Walkers step to neighbours with probability proportional to conductance.
    P = np.where(np.eye(len(L)) == 1, 0.0, -L) / np.diag(L)[:, None]
    cumulative = np.cumsum(P, axis=1)
    pos = np.full(n, start)
    def step(at):
        u = rng.random(at.size)
        return np.minimum((u[:, None] > cumulative[at]).sum(axis=1), len(L) - 1)
    if first_step:
        pos = step(pos)
    active = ~np.isin(pos, absorbing)
    while active.any():
        pos[active] = step(pos[active])
        active = ~np.isin(pos, absorbing)
    return pos


# Fixed checks on the default bridge network.
BRIDGE = [("a", "c", 1.0), ("a", "d", 2.0), ("c", "d", 1.0), ("c", "b", 2.0), ("d", "b", 1.0)]
nodes, index, L, V, C_eff = voltages(BRIDGE)
check_exact("bridge: V(c) = 2/5", V[index["c"]], 2 / 5)
check_exact("bridge: V(d) = 3/5", V[index["d"]], 3 / 5)
check_exact("bridge: effective conductance 7/5", C_eff, 7 / 5)
check_exact("bridge: escape probability C_eff / C_a = 7/15", C_eff / L[index["a"], index["a"]], 7 / 15)
keep = [i for i in range(len(nodes)) if i != index["b"]]
G = np.linalg.inv(L[np.ix_(keep, keep)])   # Gaussian field covariance with x_b = 0
ka = keep.index(index["a"])
check_exact("Gaussian field: Var(X_a) = R_eff = 5/7", G[ka, ka], 5 / 7)
check_exact("Gaussian field: E[X_c | X_a = 1] = V(c)", G[keep.index(index["c"]), ka] / G[ka, ka], 2 / 5)

# Your network.
nodes, index, L, V, C_eff = voltages(EDGES)
a, b = index["a"], index["b"]
if START not in index:
    raise ValueError(f"START must be one of the nodes {nodes}.")
print("\nYour network: voltage = P(reach a before b)")
for n in nodes:
    print(f"  {n}: {V[index[n]]:.4f}")
print(f"Effective conductance {C_eff:.4f}, so R_eff(a, b) = {1 / C_eff:.4f}")

rng = np.random.default_rng(SEED)
end = walk(L, index[START], [a, b], rng, N_SIM)
mc_compare("hitting probability = voltage", end == a, V[index[START]], what="mean")
end = walk(L, a, [a, b], rng, N_SIM, first_step=True)
mc_compare("escape probability = C_eff / C_a", end == b, C_eff / L[a, a], what="mean")
keep = [i for i in range(len(nodes)) if i != b]
precision = L[np.ix_(keep, keep)]
field = np.linalg.solve(np.linalg.cholesky(precision).T, rng.standard_normal((len(keep), N_SIM)))
mc_compare("Gaussian field: Var(X_a) = R_eff", field[keep.index(a)], 1 / C_eff)
""")

md("probability-trees", rf"""
**D. Probability trees: a path is a series circuit.** In a probability tree each node is a question and each branch an answer. A branch carries the *conditional* probability of its answer given that you reached the node, so the branches leaving a node add to 1. Exactly one leaf happens.

{PROBABILITY_TREE_SVG}

A leaf's probability is the product of the branch probabilities along its path, so its surprisal is a sum:

$$
-\ln P(\text{{leaf}})=\sum_{{\text{{path}}}}\left(-\ln q\right).
$$

So a path is a series circuit of resistances $r=-\ln q$, and the entropy of the leaf is the expected resistance of the path taken. Grouping that average by node gives the chain rule:

$$
H(\text{{leaf}})=\sum_{{x}} P(\text{{reach }}x)\,H_x ,
$$

summing over the nodes x, where $H_x=-\sum q\ln q$ is the entropy of the branches at x: the information gained by answering the question at x, weighted by how often you get to ask it.

**How it differs from a reliability network.**

- In a reliability network (B), every part exists at once. The full outcome is the state of *every* part, and series or parallel says how the parts combine: all must work, or any will do.
- In a probability tree, the leaves are *alternatives*: exactly one happens. The tree records the order in which questions are asked.

**Where they meet.** Diagnosing a reliability network is a probability tree. Ask first "does the system work?", then "which parts failed?". The leaves are all the combinations of part states. The chain rule splits their entropy into the entropy of the system's outcome plus the entropy forgotten during the reduction in B. Opening one block at a time instead gives a deeper tree with the same total.

**Predict.** In the tree above, which leaf is most surprising, and is the entropy of the weather more or less than 2 bits?

[Theory: probability trees]({THEORY}#probability-trees)
""")

py("probability_tree", r"""
def tree_leaves(node, q=1.0, path=()):
    # Yields (leaf name, its probability, the conditional probabilities on its path).
    if isinstance(node, str):
        yield node, q, path
        return
    branches = [c for c, _ in node]
    if not node or any(not 0 < c <= 1 for c in branches) or abs(sum(branches) - 1) > 1e-9:
        raise ValueError("The branches leaving each node need probabilities in (0, 1] that add to 1.")
    for c, child in node:
        yield from tree_leaves(child, q * c, path + (c,))


def branch_entropy(probabilities):
    q = np.asarray(probabilities, dtype=float)
    return float(-np.sum(q * np.log(q)))


def chain_rule_entropy(node, reach=1.0):
    # Sum over nodes of P(reach node) × entropy of its branches.
    if isinstance(node, str):
        return 0.0
    return reach * branch_entropy([c for c, _ in node]) + \
        sum(chain_rule_entropy(child, reach * c) for c, child in node)


def diagnosis_tree(block):
    # Two questions: does the system work?  Then: which combination of part states?
    p = np.array(leaves(block))
    states = (np.arange(2 ** p.size)[:, None] >> np.arange(p.size)) & 1 == 1
    weight = np.prod(np.where(states, p, 1 - p), axis=1)
    up = works(block, iter(states.T))
    name = lambda s: "".join("W" if x else "F" for x in s)   # W works, F fails, one letter per part
    tree = []
    for outcome in (up, ~up):
        total = float(weight[outcome].sum())
        tree.append((total, [(float(w / total), name(s)) for w, s in zip(weight[outcome], states[outcome])]))
    return tree


# Fixed checks on the weather tree.
WEATHER = [(0.5, "sunny"), (0.3, [(0.6, "light rain"), (0.4, "heavy rain")]), (0.2, "snow")]
found = {name: (q, path) for name, q, path in tree_leaves(WEATHER)}
check_exact("P(heavy rain) = 0.3 × 0.4", found["heavy rain"][0], 0.12)
check_exact("surprisals add along the path", -np.log(0.3) - np.log(0.4), -np.log(0.12))
direct = branch_entropy([q for q, _ in found.values()])
check_exact("entropy by the chain rule = entropy of the leaves", chain_rule_entropy(WEATHER), direct)
check_exact("entropy = expected path resistance",
            sum(q * sum(-np.log(c) for c in path) for q, path in found.values()), direct)
pair = diagnosis_tree(("series", [0.8, 0.6]))
check_exact("diagnosis tree of the series pair: entropy = h(0.8) + h(0.6)",
            chain_rule_entropy(pair), entropy(0.8) + entropy(0.6), tol=1e-10)
try:
    list(tree_leaves([(0.5, "x"), (0.4, "y")]))
    raise AssertionError("branches adding to 0.9 were accepted")
except ValueError as error:
    print("PASS  branches must add to 1:", error)

# Your tree.
rows = list(tree_leaves(TREE))
H = chain_rule_entropy(TREE)
print(f"\nYour tree: {len(rows)} leaves, entropy {H:.4f} nats = {H / np.log(2):.4f} bits")
for name, q, path in rows:
    r = sum(-np.log(c) for c in path)
    print(f"  {name:<14} P = {q:.4f}  path " + " × ".join(f"{c:g}" for c in path)
          + f"  resistance {r:.4f} nats = {r / np.log(2):.3f} bits")

# Your reliability network, diagnosed: the same chain rule.
diag = diagnosis_tree(NETWORK)
print(f"\nDiagnosing your network: first question {entropy(P_sys) / np.log(2):.4f} bits, "
      f"then on average {(chain_rule_entropy(diag) - entropy(P_sys)) / np.log(2):.4f} bits more; "
      f"total {chain_rule_entropy(diag) / np.log(2):.4f} bits = all {len(leaves(NETWORK))} parts' entropy.")
for (q, children), label in zip(diag, ("works", "fails")):
    print(f"  if the system {label} (P = {q:.4f}): {len(children)} possible states, "
          f"{branch_entropy([c for c, _ in children]) / np.log(2):.4f} bits to learn which")

# Simulation: walk down the tree; the average surprisal of the leaf reached is the entropy.
rng = np.random.default_rng(SEED)
probabilities = np.array([q for _, q, _ in rows])
picked = rng.choice(len(rows), size=N_SIM, p=probabilities / probabilities.sum())
mc_compare("average surprisal of sampled leaves = entropy", -np.log(probabilities[picked]), H, what="mean")
""")

# ------------------------------------------------------- 7. application
md("application-intro", rf"""
## Investigation 7 — back to the application (synthetic data)

**Everything here is illustrative.** Two made-up predictors, in the style of the containment models CONT and jev, score the same yes/no outcome. They are generated below from a model you control; they are not outputs of the real models.

Data model, per case:

- a true logit $z$, and an outcome $Y\sim\text{{Bernoulli}}(\sigma(z))$, where σ is the logistic function;
- CONT-style score: $\sigma(z+S+E_1+\text{{shift}})$, which is systematically too high;
- jev-style score: $\sigma(k\,(z+S+E_2))$ with k > 1, which is too extreme (overconfident);
- $S$ is an error **both** predictors share (overlapping data or features); $E_1, E_2$ are their own errors.

We compare five ways of using the two scores: each score alone, the **naive product**, a **simple average**, **separately calibrated** scores averaged (Platt scaling), and a small **stacking** model (logistic regression on both logits). Calibration and stacking are fitted on one half of the cases; every metric is computed on the other, held-out half.

**Calibration and ranking are different questions.** *Discrimination* (here, AUC) asks whether higher scores go with the event. *Calibration* asks whether a score of 0.7 means 70 %. A common strictly increasing recalibration never changes the ranking of its input, so its AUC is unchanged. Isotonic calibration can create ties, and model-specific maps or a new stacked score need not keep the original cross-model ordering.

**Predict.** Will the naive product be well calibrated? Which method gives the lowest held-out Brier score?

[Theory: calibration, ranking and stacking]({THEORY}#7-application-calibration-ranking-and-stacking)
""")

py("application_parameters", r"""
# Parameters you can edit. All values are synthetic.
N_CASES = 8000
SHARED_NOISE = 0.8      # SD of the error both predictors share
OWN_NOISE = 0.6         # SD of each predictor's own error
CONT_SHIFT = 0.7        # CONT-style scores are shifted up on the logit scale
JEV_OVERCONFIDENCE = 1.8  # jev-style logits are stretched by this factor
SEED = 7
""")

py("application", r"""
def sigmoid(t):
    return 0.5 * (1.0 + np.tanh(0.5 * np.asarray(t, dtype=float)))


def logit(q):
    q = np.clip(np.asarray(q, dtype=float), 1e-12, 1 - 1e-12)
    return np.log(q) - np.log1p(-q)


def fit_logistic(features, y, ridge=1e-6, steps=100):
    # Newton's method for logistic regression with a tiny ridge on the slopes.
    X = np.column_stack([np.ones(len(y)), features])
    beta = np.zeros(X.shape[1])
    penalty = ridge * np.eye(X.shape[1])
    penalty[0, 0] = 0.0
    for _ in range(steps):
        q = sigmoid(X @ beta)
        H = X.T @ (X * (q * (1 - q))[:, None]) + penalty
        step = np.linalg.solve(H, X.T @ (y - q) - penalty @ beta)
        beta = beta + step
        if np.max(np.abs(step)) < 1e-10:
            break
    return beta


def auc(score, y):
    # Probability that a random event case outscores a random non-event case (ties count half).
    _, inverse, counts = np.unique(score, return_inverse=True, return_counts=True)
    ranks = (np.cumsum(counts) - (counts - 1) / 2.0)[inverse]
    n1 = int(y.sum())
    n0 = y.size - n1
    return float((ranks[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def metrics(q, y):
    q = np.clip(q, 1e-12, 1 - 1e-12)
    slope = fit_logistic(logit(q)[:, None], y)[1]
    return {"Brier": np.mean((q - y) ** 2),
            "log loss": -np.mean(y * np.log(q) + (1 - y) * np.log1p(-q)),
            "AUC": auc(q, y),
            "mean − rate": q.mean() - y.mean(),
            "cal. slope": slope}


rng = np.random.default_rng(SEED)
z = rng.normal(-0.4, 1.5, N_CASES)
y = (rng.random(N_CASES) < sigmoid(z)).astype(float)
shared = rng.normal(0.0, SHARED_NOISE, N_CASES)
cont = sigmoid(z + shared + rng.normal(0.0, OWN_NOISE, N_CASES) + CONT_SHIFT)
jev = sigmoid(JEV_OVERCONFIDENCE * (z + shared + rng.normal(0.0, OWN_NOISE, N_CASES)))

fit, test = np.arange(N_CASES) < N_CASES // 2, np.arange(N_CASES) >= N_CASES // 2
platt_cont = fit_logistic(logit(cont[fit])[:, None], y[fit])
platt_jev = fit_logistic(logit(jev[fit])[:, None], y[fit])
stack = fit_logistic(np.column_stack([logit(cont[fit]), logit(jev[fit])]), y[fit])

cal_cont_logit = platt_cont[0] + platt_cont[1] * logit(cont[test])
cal_jev_logit = platt_jev[0] + platt_jev[1] * logit(jev[test])
methods = {
    "CONT-style alone": cont[test],
    "jev-style alone": jev[test],
    "naive product": cont[test] * jev[test],
    "simple average": (cont[test] + jev[test]) / 2,
    "calibrated, averaged": (sigmoid(cal_cont_logit) + sigmoid(cal_jev_logit)) / 2,
    "stacked": sigmoid(stack[0] + stack[1] * logit(cont[test]) + stack[2] * logit(jev[test])),
}
yt = y[test]
results = {name: metrics(q, yt) for name, q in methods.items()}

print(f"Held-out cases: {int(test.sum())}; event rate {yt.mean():.3f}. Synthetic data only.\n")
print(f"{'method':<22}" + "".join(f"{k:>12}" for k in next(iter(results.values()))))
for name, r in results.items():
    print(f"{name:<22}" + "".join(f"{v:12.4f}" for v in r.values()))
print("\nBrier and log loss: lower is better. Calibration slope 1 and 'mean − rate' 0 are ideal.")
print(f"Correlation of the two scores' logits: {np.corrcoef(logit(cont), logit(jev))[0, 1]:.3f} "
      "(shared error makes them partly duplicate evidence).")

# Deterministic invariant: a strictly increasing recalibration keeps the ranking, so the AUC.
assert platt_cont[1] > 0 and platt_jev[1] > 0, "fitted calibration maps are increasing here"
check_exact("Platt calibration keeps CONT-style AUC", auc(cal_cont_logit, yt), auc(cont[test], yt))
check_exact("Platt calibration keeps jev-style AUC", auc(cal_jev_logit, yt), auc(jev[test], yt))
""")

py("reliability_plot", r"""
# Reliability diagram on the held-out half: mean predicted probability against observed frequency.
edges = np.linspace(0.0, 1.0, 11)
traces = [{"x": [0, 1], "y": [0, 1], "mode": "lines", "name": "perfect calibration",
           "line": {"dash": "dot"}}]
for name in ("CONT-style alone", "naive product", "stacked"):
    q = methods[name]
    bins = np.clip(np.digitize(q, edges) - 1, 0, 9)
    used = [b for b in range(10) if np.sum(bins == b) >= 20]
    traces.append({"x": [float(q[bins == b].mean()) for b in used],
                   "y": [float(yt[bins == b].mean()) for b in used],
                   "mode": "lines+markers", "name": name})
mplot(traces, title="Held-out reliability<br>(synthetic; bins of ≥ 20 cases)",
      xlabel="mean predicted probability", ylabel="observed frequency", layout=phone_layout())
""")

# ------------------------------------------------------- 8. beyond trees
md("beyond-trees", rf"""
## Investigation 8 — beyond trees

Trees are the easiest networks to understand. Which circuit methods still work when the network has loops, or when paths merge again? It depends on the dictionary.

**Random walks and Gaussian fields: any network.** Kirchhoff's laws hold on any connected graph, loops included; the bridge in Investigation 6 already needed them. The requirement is a symmetric conductance $g_{{ij}}=g_{{ji}}$ on each link. For a random walk this means the walk is **reversible**: with stationary probabilities π, it satisfies $\pi_iP_{{ij}}=\pi_jP_{{ji}}$. A one-way chain, such as a cycle walked in one direction only, still has hitting probabilities that solve the linear equations $h=Ph$, but no network of resistors produces it.

**Merging paths: a different parallel rule.** In a Markov chain run for several steps, many routes end in the same state. Along a route the probabilities multiply, so surprisals add in **series**. Different routes to the same end are alternatives, so their *probabilities* add. In surprisal terms, routes with surprisals $r_k$ combine in **parallel** as

$$
r=-\ln\sum_k e^{{-r_k}},
$$

a *soft minimum*, not $1/\sum_k(1/r_k)$. It lies between $\min_k r_k-\ln K$ and $\min_k r_k$ for K routes. Keeping only the most likely route, the minimum, is the idea behind shortest-path and Viterbi decoding. The forward algorithm applies this series–parallel reduction one time step at a time.

**Reliability networks: no.** A bridge of independent parts has no series–parallel reduction, and Kirchhoff's laws do not give its reliability. Instead **condition** on the middle part e:

$$
P=p_e\,P_1+(1-p_e)\,P_0 ,
$$

where $P_1$ and $P_0$ are the probabilities that the system works given that e works or fails. Each conditional network *is* series–parallel, so Investigation 6's log rules finish the job.

**Predict.** Two routes to the same state have surprisals 1.0 and 1.2 nats. Is the combined surprisal above or below 1.0?

[Theory: beyond trees]({THEORY}#8-beyond-trees)
""")

py("beyond_parameters", r"""
# Parameters you can edit.
# One-way chain on states a, x, y, z, b: each row lists where a step can go (rows add to 1).
ONE_WAY = {"x": {"y": 0.7, "a": 0.3}, "y": {"z": 0.7, "b": 0.3}, "z": {"x": 0.7, "a": 0.3}}
# Two-state Markov chain run for STEPS steps: start distribution and transition matrix.
INIT = [0.6, 0.4]
TRANSITION = [[0.7, 0.3], [0.2, 0.8]]
STEPS = 3
# Bridge reliability: parts 1 s–c, 2 s–d, 3 c–d (the bridge), 4 c–t, 5 d–t.
BRIDGE_P = [0.9, 0.8, 0.7, 0.85, 0.75]
SEED = 2026
N_SIM = 20000
""")

py("beyond_trees", r"""
def hitting_probabilities(chain, one="a", zero="b"):
    # Solve h = P h with h(one) = 1, h(zero) = 0: first-step analysis, no circuit needed.
    inner = sorted(chain)
    for state, row in chain.items():
        if abs(sum(row.values()) - 1) > 1e-9 or any(q < 0 for q in row.values()):
            raise ValueError(f"Row {state} must hold probabilities that add to 1.")
    A = np.eye(len(inner))
    rhs = np.zeros(len(inner))
    for i, state in enumerate(inner):
        for target, q in chain[state].items():
            if target == one:
                rhs[i] += q
            elif target != zero:
                A[i, inner.index(target)] -= q
    return dict(zip(inner, np.linalg.solve(A, rhs)))


def is_reversible(P, tol=1e-12):
    # Detailed balance with the stationary distribution: pi_i P_ij = pi_j P_ji.
    values, vectors = np.linalg.eig(np.asarray(P).T)
    pi = np.real(vectors[:, np.argmin(np.abs(values - 1))])
    pi = pi / pi.sum()
    flow = pi[:, None] * np.asarray(P)
    return bool(np.allclose(flow, flow.T, atol=tol))


def soft_min(r):
    # Parallel rule for surprisals of alternative routes: -ln sum exp(-r).
    # Impossible routes have surprisal ∞; if every route is impossible, so is the merge.
    r = np.asarray(r, dtype=float)
    m = r.min() if r.size else np.inf
    if np.isinf(m):
        return float(np.inf)
    return float(m - np.log(np.sum(np.exp(-(r - m)))))


def surprisal(q):
    # -ln q, with -ln 0 = ∞ (a zero-probability step) and no warning.
    with np.errstate(divide="ignore"):
        return -np.log(np.asarray(q, dtype=float))


def require_chain(init, transition):
    init, T = np.asarray(init, dtype=float), np.asarray(transition, dtype=float)
    if T.shape != (init.size, init.size):
        raise ValueError("TRANSITION must be a square matrix with one row per state in INIT.")
    for name, rows in (("INIT", init[None, :]), ("each TRANSITION row", T)):
        if np.any(rows < 0) or not np.allclose(rows.sum(axis=1), 1):
            raise ValueError(f"{name} must hold probabilities that add to 1.")
    return init, T


def route_surprisals(init, transition, steps):
    # Every route, enumerated: its end state and its surprisal (a series sum).
    init, T = require_chain(init, transition)
    routes = []
    for path in np.ndindex(*([len(init)] * (steps + 1))):
        q = init[path[0]] * np.prod([T[i, j] for i, j in zip(path, path[1:])])
        if q > 0:
            routes.append((path[-1], float(-np.log(q))))
    return routes


def forward_surprisal(init, transition, steps, best=False):
    # Series along each step, parallel (soft-min, or min for the best route) across merging routes.
    init, T = require_chain(init, transition)
    r, R = surprisal(init), surprisal(T)
    for _ in range(steps):
        r = np.array([(min if best else soft_min)(r + R[:, j]) for j in range(R.shape[1])])
    return r


def bridge_reliability(p):
    # Condition on the bridge part 3; both conditional networks are series–parallel.
    p1, p2, p3, p4, p5 = (require_probability(q) for q in p)
    works = reduce_network(("series", [("parallel", [p1, p2]), ("parallel", [p4, p5])]), [])
    fails = reduce_network(("parallel", [("series", [p1, p4]), ("series", [p2, p5])]), [])
    return p3 * works + (1 - p3) * fails


def bridge_works(state):
    s1, s2, s3, s4, s5 = state
    return (s1 & s4) | (s2 & s5) | (s1 & s3 & s5) | (s2 & s3 & s4)


# Fixed checks.
h = hitting_probabilities({"x": {"y": 0.7, "a": 0.3}, "y": {"z": 0.7, "b": 0.3}, "z": {"x": 0.7, "a": 0.3}})
check_exact("one-way cycle: P(reach a first from x) = 149/219", h["x"], 149 / 219)
_, _, bridge_L, _, _ = voltages(BRIDGE)
bridge_walk = np.where(np.eye(4) == 1, 0.0, -bridge_L) / np.diag(bridge_L)[:, None]
one_way = np.array([[0, 1, 0], [0, 0, 1], [1, 0, 0]], dtype=float)
print("PASS  the bridge walk is reversible:", is_reversible(bridge_walk))
print("PASS  a one-way cycle is not:", not is_reversible(one_way))
assert is_reversible(bridge_walk) and not is_reversible(one_way)
check_exact("two routes, r = (1, 1.2): soft minimum", soft_min([1.0, 1.2]), -np.log(np.exp(-1.0) + np.exp(-1.2)))
check_exact("symmetric bridge, every p = 1/2, works with probability 1/2", bridge_reliability([0.5] * 5), 0.5)

# 1) Your one-way chain: first-step equations, then simulation.
h = hitting_probabilities(ONE_WAY)
print("\nOne-way chain, P(reach a before b): " + ", ".join(f"{k} {v:.4f}" for k, v in h.items()))
rng = np.random.default_rng(SEED)
pos = np.array(["x"] * N_SIM, dtype=object)
active = np.ones(N_SIM, dtype=bool)
while active.any():
    for state in ONE_WAY:
        here = active & (pos == state)
        if here.any():
            targets, probs = zip(*ONE_WAY[state].items())
            pos[here] = rng.choice(targets, size=int(here.sum()), p=probs)
    active = ~np.isin(pos, ["a", "b"])
mc_compare("one-way chain: hitting probability from x", pos == "a", h["x"], what="mean")

# 2) Your Markov chain: merging routes, exact by enumeration, by soft-min reduction, and best route.
routes = route_surprisals(INIT, TRANSITION, STEPS)
r_forward = forward_surprisal(INIT, TRANSITION, STEPS)
r_best = forward_surprisal(INIT, TRANSITION, STEPS, best=True)
distribution = np.asarray(INIT) @ np.linalg.matrix_power(np.asarray(TRANSITION), STEPS)
print(f"\nAfter {STEPS} steps:")
for j in range(len(INIT)):
    mine = [r for end, r in routes if end == j]
    if not mine:   # no route reaches this state: probability 0, surprisal ∞
        assert np.isinf(r_forward[j]) and np.isinf(r_best[j]) and distribution[j] == 0
        print(f"PASS  state {j}: no route reaches it; P = 0 and surprisal ∞ by every method")
        continue
    check_exact(f"state {j}: soft-min reduction = all {len(mine)} routes", r_forward[j], soft_min(mine), tol=1e-10)
    check_exact(f"state {j}: matches the matrix power", np.exp(-r_forward[j]), distribution[j], tol=1e-10)
    check_exact(f"state {j}: best route = smallest route surprisal", r_best[j], min(mine), tol=1e-10)
    assert min(mine) - np.log(len(mine)) - 1e-12 <= r_forward[j] <= r_best[j] + 1e-12, "soft-min bounds"
    print(f"  state {j}: P = {np.exp(-r_forward[j]):.4f}; best single route alone gives "
          f"{np.exp(-r_best[j]):.4f} ({len(mine)} routes merge here)")
state = rng.choice(len(INIT), size=N_SIM, p=INIT)
T = np.asarray(TRANSITION)
for _ in range(STEPS):
    state = (rng.random(N_SIM)[:, None] > np.cumsum(T[state], axis=1)).sum(axis=1).clip(0, len(INIT) - 1)
mc_compare("Markov chain: P(end in state 0)", state == 0, np.exp(-r_forward[0]), what="mean")

# 3) Your bridge: conditioning against enumeration of all 32 states, and a simulation.
pb = np.array(BRIDGE_P, dtype=float)
states = (np.arange(32)[:, None] >> np.arange(5)) & 1 == 1
weights = np.prod(np.where(states, pb, 1 - pb), axis=1)
exact_bridge = float(weights[bridge_works(states.T)].sum())
check_exact("bridge: conditioning = enumeration", bridge_reliability(BRIDGE_P), exact_bridge, tol=1e-10)
sim = rng.random((N_SIM, 5)) < pb
mc_compare("bridge network works", bridge_works(sim.T), exact_bridge, what="mean")

# Two parallel routes: the soft minimum against the minimum, as the gap between them grows.
gap = np.linspace(0.0, 4.0, 81)
mplot([
    {"x": gap, "y": [soft_min([1.0, 1.0 + d]) for d in gap], "mode": "lines", "name": "soft minimum (exact)"},
    {"x": gap, "y": np.ones_like(gap), "mode": "lines", "name": "best route only", "line": {"dash": "dash"}},
    {"x": gap, "y": np.full_like(gap, 1 - np.log(2)), "mode": "lines", "name": "lower bound: min − ln 2",
     "line": {"dash": "dot"}},
], title="Parallel routes:<br>a soft minimum",
   xlabel="extra surprisal of route 2 (nats)", ylabel="combined surprisal (nats)", layout=phone_layout())
""")

# ------------------------------------------------------- wrap-up
md("checks", r"""
## Check your understanding

<details><summary>1. Why does adding an independent estimate <em>reduce</em> the fused variance, while adding an independent uncertain quantity <em>increases</em> the total variance?</summary>

Fusion averages several readings of **one** target: their precisions add (parallel), so another independent reading can only add precision. A sum combines **different** quantities: each brings its own variance, and those add (series).
</details>

<details><summary>2. Which formula changes when errors correlate?</summary>

Both. Fusion needs the full covariance, w ∝ Σ⁻¹1. With equal variances, positive correlation shrinks the gain, to none at ρ = 1. With unequal variances the gain need not shrink: at ρ = 1 one error is a multiple of the other, and weights with one negative can cancel it. The sum picks up the 2 Cov(X, Y) term. A shared error sets a floor s² that averaging cannot remove.
</details>

<details><summary>3. What plays the role of resistance for a product approximation?</summary>

Relative variance, vᵢ/μᵢ², for independent inputs with small relative errors. It is a first-order approximation; the exact independent formula adds the v_X v_Y term.
</details>

<details><summary>4. Why can two identical 0.8 scores not be treated as two independent chances?</summary>

They are two predictions of one event, built from the same information. Duplicating information adds no evidence, so the probability stays 0.8. Multiplying (0.64) or using 1 − 0.2² (0.96) treats them as distinct, independent events.
</details>

<details><summary>5. What breaks when a mean is near zero?</summary>

Relative variance divides by μ², so it explodes, and the small-error expansion behind the delta method no longer holds. Use the absolute or exact formula, or the full distribution.
</details>

<details><summary>6. Does reducing a reliability network lose entropy?</summary>

Yes, by exactly what it forgets. Each merge keeps the probability, and so the entropy, of the merged outcome, but forgets which parts failed: the conditional entropy of the parts given that outcome. The parts' total entropy equals the system outcome's entropy plus all those losses, so the reduction is exact for the system's outcome, not an estimate of the whole network's entropy.
</details>

<details><summary>7. In a probability tree, why do the branches leaving a node add to 1, and what plays the role of resistance?</summary>

Each branch is a conditional probability given that you reached the node, and exactly one answer happens there, so they add to 1. A leaf's probability is the product along its path, so its surprisal, −ln P, is the sum of the branch surprisals −ln q: the path is a series circuit. The entropy is the expected resistance of the path taken.
</details>

<details><summary>8. Which circuit methods still work beyond trees?</summary>

Kirchhoff's laws work on any network for random walks and Gaussian fields, if each link is symmetric (a reversible walk). When routes merge, surprisals still add in series, but alternative routes combine by a soft minimum, −ln Σ e^(−r), not the resistor rule. Reliability of a bridge has no series–parallel reduction: condition on one part, or enumerate.
</details>
""")

py("validation_summary", r"""
# Rerun every fixed check from the handoff in one place, independent of your parameter edits.
w, est, var = fuse_independent([10, 14], [4, 9])
_, bridge_index, bridge_L, bridge_V, bridge_C = voltages(BRIDGE)
fixtures = [
    ("fusion weights", w[0], 9 / 13), ("fusion weights", w[1], 4 / 13),
    ("fusion estimate", est, 146 / 13), ("fusion variance", var, 36 / 13),
    ("equal variance, rho 0", equal_average_variance(4, 0.0), 2),
    ("equal variance, rho 0.5", equal_average_variance(4, 0.5), 3),
    ("equal variance, rho 1", equal_average_variance(4, 1.0), 4),
    ("independent sum", sum_variance([4, 9]), 13),
    ("product mean", product_exact([2, 3], [0.01, 0.04])[0], 6),
    ("product exact, SD 0.1/0.2", product_exact([2, 3], [0.01, 0.04])[1], 0.2504),
    ("product delta, SD 0.1/0.2", product_delta([2, 3], [0.01, 0.04]), 0.25),
    ("product exact, SD 1/1", product_exact([2, 3], [1, 1])[1], 14),
    ("product delta, SD 1/1", product_delta([2, 3], [1, 1]), 13),
    ("all succeed", all_succeed([0.8, 0.6]), 0.48),
    ("any fails", any_fail([0.8, 0.6]), 0.52),
    ("any succeeds", any_succeed([0.8, 0.6]), 0.92),
    ("duplicate 0.8", np.mean([0.8, 0.8]), 0.8),
    ("Millman node potential", millman([10, 14], [4, 9])[0], 146 / 13),
    ("Millman resistance seen", millman([10, 14], [4, 9])[1], 36 / 13),
    ("series by resistances", np.exp(-(resistance(0.8) + resistance(0.6))), 0.48),
    ("parallel by conductances", -np.expm1(-(conductance(0.8) + conductance(0.6))), 0.92),
    ("default network", reduce_network(("series", [("parallel", [0.9, 0.7]), 0.95,
                                                   ("parallel", [0.8, ("series", [0.6, 0.9])])]), []), 0.836722),
    ("bridge V(c)", bridge_V[bridge_index["c"]], 2 / 5),
    ("bridge escape probability", bridge_C / bridge_L[bridge_index["a"], bridge_index["a"]], 7 / 15),
    ("weather tree: chain rule", chain_rule_entropy(WEATHER),
     -sum(q * np.log(q) for q in (0.5, 0.18, 0.12, 0.2))),
    ("diagnosis tree of the series pair", chain_rule_entropy(diagnosis_tree(("series", [0.8, 0.6]))),
     entropy(0.8) + entropy(0.6)),
    ("one-way cycle hitting probability", hitting_probabilities(
        {"x": {"y": 0.7, "a": 0.3}, "y": {"z": 0.7, "b": 0.3}, "z": {"x": 0.7, "a": 0.3}})["x"], 149 / 219),
    ("Markov chain, 3 steps, state 0", np.exp(-forward_surprisal([0.6, 0.4], [[0.7, 0.3], [0.2, 0.8]], 3)[0]), 0.425),
    ("symmetric bridge reliability", bridge_reliability([0.5] * 5), 0.5),
]
for label, got, want in fixtures:
    check_exact(label, got, want)
print(f"\n{len(fixtures)} deterministic checks passed.")
worst = max(MC_LOG.values(), key=lambda r: abs(r["z"]))
print(f"{len(MC_LOG)} simulation comparisons run; largest |z| = {abs(worst['z']):.2f} "
      f"({worst['label']}). Agreement means |z| < {Z_LIMIT:g}; one larger value is a "
      "prompt to rerun with more samples, not a failed formula.")
""")


def build():
    names = [cell["name"] for cell in CELLS]
    assert len(names) == len(set(names)), "duplicate cell names"
    book = {"format": "srwb", "version": "1.0", "notebook": {"name": TITLE, "cells": CELLS}}
    return json.dumps(book, indent=2, ensure_ascii=False) + "\n"


if __name__ == "__main__":
    text = build()
    if sys.argv[1:] == ["--check"]:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            sys.exit(f"{OUT.relative_to(REPO)} is stale: run tools/build-resistor-analogy.py")
        print("Resistor-analogy draft is up to date.")
    elif sys.argv[1:]:
        sys.exit("Usage: build-resistor-analogy.py [--check]")
    else:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(text, encoding="utf-8")
        print(f"Wrote {OUT.relative_to(REPO)} ({len(CELLS)} cells)")
