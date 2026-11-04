# Resistor analogy: theory notes

Companion to the draft workbook *Resistor Analogy: When Uncertainties Add in Series or Parallel*
(`drafts/resistor-analogy/en/resistor-analogy.srwb`). The workbook states each rule with its
assumptions and lets you test it numerically; these notes give the derivations and the reasons
the rules fail when their assumptions do.

Everything here is about **synthetic** examples. The motivating application, two containment
predictors called CONT and jev, is used only as a pattern; no result below is evidence about
those real models.

## 1. Three operations

The analogy is tempting because two rules look like circuit laws:

| Circuit | Statistics | Operation |
|---|---|---|
| Resistance $R$ | Variance $v$ (units U²) | — |
| Conductance $1/R$ | Precision $\tau = 1/v$ (units U⁻²) | — |
| Series: $R = R_1 + R_2$ | $\operatorname{Var}(X+Y) = v_X + v_Y$ | uncertainty propagation through a sum |
| Parallel: $1/R = 1/R_1 + 1/R_2$ | $1/v_{\text{fused}} = 1/v_1 + 1/v_2$ | fusion of estimates of one target |
| Series, relative | $\operatorname{Var}(XY)/(\mu_X\mu_Y)^2 \approx v_X/\mu_X^2 + v_Y/\mu_Y^2$ | propagation through a product (approximate) |

It is an analogy of algebra, not of physics: variance is not measured in ohms, and nothing
flows. The two rules answer **different questions**, and a third kind of question, about
probabilities of events, follows neither rule:

1. **Estimate fusion** combines several noisy estimates of the *same* target into one better
   estimate. More independent estimates mean *less* uncertainty.
2. **Uncertainty propagation** computes the uncertainty of a *function* of several different
   uncertain inputs. More uncertain inputs mean *more* uncertainty.
3. **Event composition** computes the probability of a compound event, such as "all succeed",
   from the probabilities of distinct events. It needs a dependence model.

Standard deviations obey neither circuit law. They combine in quadrature: for independent
inputs, $\sigma_{X+Y} = \sqrt{\sigma_X^2 + \sigma_Y^2}$, never $\sigma_X + \sigma_Y$.

## 2. Parallel fusion

**Setting.** Estimators $X_1, \dots, X_n$ of a fixed target θ, each unbiased
($\mathbb E X_i = \theta$) with known finite variance $v_i > 0$ and pairwise uncorrelated errors.
Consider linear estimators $\hat\theta = \sum_i w_i X_i$.

**Unbiasedness forces the constraint.** $\mathbb E\hat\theta = \theta \sum_i w_i$, so the
estimator is unbiased for every θ exactly when $\sum_i w_i = 1$.

**Variance.** With uncorrelated errors, $\operatorname{Var}(\hat\theta) = \sum_i w_i^2 v_i$.

**Minimising with a Lagrange multiplier.** Stationarity of
$\sum_i w_i^2 v_i - \lambda(\sum_i w_i - 1)$ gives $2 w_i v_i = \lambda$, so
$w_i \propto 1/v_i$. Normalising,

$$
w_i = \frac{1/v_i}{\sum_j 1/v_j}, \qquad
v_{\text{fused}} = \sum_i w_i^2 v_i = \frac{\sum_i 1/v_i}{\left(\sum_j 1/v_j\right)^2}
= \frac{1}{\sum_i 1/v_i}.
$$

**A proof that it is the minimum (Cauchy–Schwarz).** For any weights summing to one,

$$
1 = \Big(\sum_i w_i\Big)^2 = \Big(\sum_i w_i\sqrt{v_i}\cdot\frac{1}{\sqrt{v_i}}\Big)^2
\le \Big(\sum_i w_i^2 v_i\Big)\Big(\sum_i \frac{1}{v_i}\Big),
$$

so $\operatorname{Var}(\hat\theta) \ge 1/\sum_i(1/v_i)$, with equality exactly when
$w_i\sqrt{v_i} \propto 1/\sqrt{v_i}$, which is the inverse-variance choice.

**What was and was not assumed.** Only means, variances and zero covariances were used: the
errors need not be Gaussian. The result is optimal among *linear unbiased* estimators; a
nonlinear estimator can do better for some error distributions (for example, heavy tails). If the
$v_i$ are themselves estimated, the plug-in weights are random and lose some of this optimality,
a caution the NIST handbook also makes [1].

**Numbers.** Estimates 10 and 14 with variances 4 and 9: precisions 1/4 and 1/9 sum to 13/36,
so $v_{\text{fused}} = 36/13 \approx 2.769$, the weights are $9/13$ and $4/13$, and the estimate is
$(9\cdot 10 + 4\cdot 14)/13 = 146/13 \approx 11.231$.

## 3. Correlated errors, shared floors and bias

**General covariance.** Let the errors have a known positive definite covariance Σ. Then
$\operatorname{Var}(w^\top X) = w^\top\Sigma w$. Stationarity of
$w^\top\Sigma w - \lambda(\mathbf 1^\top w - 1)$ gives $2\Sigma w = \lambda\mathbf 1$, so

$$
w = \frac{\Sigma^{-1}\mathbf 1}{\mathbf 1^\top\Sigma^{-1}\mathbf 1}, \qquad
v_{\text{fused}} = w^\top\Sigma w = \frac{1}{\mathbf 1^\top\Sigma^{-1}\mathbf 1}.
$$

This is the generalised-least-squares (best linear unbiased) estimate of a common mean.
Numerically, solve $\Sigma a = \mathbf 1$ instead of forming $\Sigma^{-1}$. The workbook first
checks that Σ is positive definite from its eigenvalues (an exact-zero test such as a failed
Cholesky factorisation is not portable: rounding can let a singular matrix through).

**Two equal variances.** With $v_1 = v_2 = v$ and correlation ρ,
$\operatorname{Var}\big(\tfrac{X_1+X_2}{2}\big) = \tfrac14(v + v + 2\rho v) = \tfrac{v(1+\rho)}{2}$.
For $-1 < \rho < 1$, **1** is an eigenvector of Σ, so $\Sigma^{-1}\mathbf 1 \propto \mathbf 1$ and the
equal average is optimal. At ρ = 0 the variance halves; at ρ = 1 the second estimate repeats the
first one's noise and adds nothing.

**Negative weights.** For two estimates with covariance $c = \rho\sigma_1\sigma_2$,
$\Sigma^{-1}\mathbf 1 \propto (v_2 - c,\ v_1 - c)$. The weight on the noisier estimate (say $v_2 > v_1$)
is negative exactly when $c > v_1$, that is when $\rho > \sigma_1/\sigma_2$. Then the second estimate's
error mostly echoes the first one's, scaled up, and subtracting a little of it cancels shared noise.
Example: $v = (1, 4)$, $\rho = 0.8 > 1/2$, so $c = 1.6$, weights $(4/3, -1/3)$ and
$v_{\text{fused}} = 0.8$, below the better estimate's variance of 1. Requiring nonnegative weights
is a different, constrained optimisation with a different answer.

**Singular covariance needs separate analysis.** At ρ = ±1, Σ is singular and the formula does not
apply. With ρ = 1 and $\sigma_1 \ne \sigma_2$, the errors satisfy $e_2 = (\sigma_2/\sigma_1)e_1$, so the
weights solving $w_1 + w_2 = 1$ and $w_1\sigma_1 + w_2\sigma_2 = 0$ give an estimate with **zero**
variance. That is mathematically correct for the model and almost never physically believable,
which is why a singular or near-singular Σ is a reason to question the model, not to reach for a
pseudoinverse.

**A shared error floor.** Suppose $X_i = \theta + B + \varepsilon_i$, with B of mean 0 and variance
$s^2$ shared by every estimate, and $\varepsilon_i$ independent of each other and of B, with
variances $t_i$. For weights summing to one, $\hat\theta - \theta = B + \sum_i w_i\varepsilon_i$, so

$$
\operatorname{Var}(\hat\theta) = s^2 + \sum_i w_i^2 t_i \;\ge\; s^2 + \frac{1}{\sum_i 1/t_i},
$$

with equality for inverse-$t$ weights. (The same answer follows from
$\Sigma = s^2\mathbf 1\mathbf 1^\top + \operatorname{diag}(t)$ and the Sherman–Morrison formula.)
However many estimates you average, the variance never falls below $s^2$. With $s^2 = 1$ and
$t = (4, 9)$ the best variance is $1 + 36/13 = 49/13$.

**Fixed bias is a different quantity.** If every estimate is shifted by the same constant b, then
$\mathbb E\hat\theta = \theta + b\sum_i w_i = \theta + b$ for every weighting that sums to one, and

$$
\operatorname{MSE}(\hat\theta) = \mathbb E(\hat\theta - \theta)^2 = \operatorname{Var}(\hat\theta) + b^2 .
$$

Averaging reduces only the variance term. A predictor can have smaller variance and larger
mean squared error, which is why the workbook prints variance, bias and MSE separately.

**Duplicate information** is the extreme case ρ = 1 with equal variances: $X_2 = X_1$. Averaging
the copies returns $X_1$, with variance $v$, not $v/2$.

## 4. Series: sums and products

**Sums (exact).** By bilinearity of covariance,

$$
\operatorname{Var}(aX + bY) = a^2 v_X + b^2 v_Y + 2ab\operatorname{Cov}(X, Y).
$$

With independent (or merely uncorrelated) inputs, variances add: the series rule. Each extra input
adds its own variance, so propagation through a sum makes the total *more* uncertain, the opposite
of fusion. Standard deviations add in quadrature: SDs 2 and 3 give $\sqrt{13} \approx 3.61$, not 5.

**Products: first-order (delta) approximation.** Expand $Z = XY$ around the means:
$Z \approx \mu_X\mu_Y + \mu_Y(X - \mu_X) + \mu_X(Y - \mu_Y)$. The variance of this linear part is

$$
\operatorname{Var}(Z) \approx \mu_Y^2 v_X + \mu_X^2 v_Y + 2\mu_X\mu_Y c, \qquad
\frac{\operatorname{Var}(Z)}{(\mu_X\mu_Y)^2} \approx \frac{v_X}{\mu_X^2} + \frac{v_Y}{\mu_Y^2}
+ \frac{2c}{\mu_X\mu_Y},
$$

where $c = \operatorname{Cov}(X, Y)$ [2]. For independent inputs, **relative variances add**: they
play the role of resistance. The normalisation uses the nominal product $\mu_X\mu_Y$; the actual
mean is $\mathbb E[XY] = \mu_X\mu_Y + c$.

**Products: exact for independent inputs.** Independence gives
$\mathbb E[(XY)^2] = \mathbb E[X^2]\,\mathbb E[Y^2] = (\mu_X^2 + v_X)(\mu_Y^2 + v_Y)$, so

$$
\operatorname{Var}(XY) = \mu_Y^2 v_X + \mu_X^2 v_Y + v_X v_Y,
\qquad
\operatorname{Var}\Big(\prod_i X_i\Big) = \prod_i(\mu_i^2 + v_i) - \prod_i \mu_i^2 .
$$

The delta method drops $v_Xv_Y$. Relative to $(\mu_X\mu_Y)^2$ that term is the product of the two
relative variances, second order when both are small. Means 2 and 3 with SDs 0.1 and 0.2 give
exact 0.2504 against delta 0.25; with SDs 1 and 1, exact 14 against delta 13.

**Near a zero mean** the relative form divides by $\mu^2$ and explodes, so relative variances stop
meaning anything. The absolute delta formula does not automatically fail: for independent inputs
its error is always exactly $v_Xv_Y$. With $\mu_X = 0$ it gives $\mu_Y^2 v_X$ against the exact
$\mu_Y^2 v_X + v_X v_Y$, which is close while $v_Y \ll \mu_Y^2$. It fails when the dropped term is
comparable to the kept ones, for example when both means are near zero. When in doubt, use the
absolute exact formula, or the full distribution. The workbook warns when $|\mu| < 3\sigma$; that
threshold is a rule of thumb, not a theorem.

**The log route.** For strictly positive inputs, $\log\prod_i X_i = \sum_i \log X_i$, so

$$
\operatorname{Var}\Big(\log\prod_i X_i\Big) = \sum_i \operatorname{Var}(\log X_i)
+ 2\sum_{i<j}\operatorname{Cov}(\log X_i, \log X_j),
$$

exactly, whenever those moments exist. Returning to the original scale needs the distribution.
If $\log Z \sim N(m, S)$, then $\mathbb E Z = e^{m + S/2}$ and
$\operatorname{Var}(Z) = e^{2m + S}(e^S - 1) = (\mathbb E Z)^2(e^S - 1)$. The workbook's lognormal
inputs have *means* 2 and 3, so $\mathbb E Z = 6$ (their medians, $e^{m}$, sit below the means).
With $S = 0.25$, $\operatorname{Var}(Z) = 36(e^{0.25} - 1) \approx 10.22$, whereas the tempting shortcut $e^{S} \approx 1.28$ is not a variance of anything here. For small S,
$\operatorname{Var}(Z)/(\mathbb E Z)^2 = e^S - 1 \approx S$: relative variance on the original scale is
approximately log-variance, which is another way to see why relative variances add approximately.

## 5. Events versus scores

**Independent events.** For independent events $A_i$ with $P(A_i) = p_i$:

$$
P\Big(\bigcap_i A_i\Big) = \prod_i p_i, \qquad
P\Big(\bigcup_i A_i^c\Big) = 1 - \prod_i p_i, \qquad
P\Big(\bigcup_i A_i\Big) = 1 - \prod_i(1 - p_i),
$$

the last two by De Morgan's laws. For $p = (0.8, 0.6)$: 0.48, 0.52 and 0.92. Reliability
engineering calls a system that needs every part a *series* system and one that needs any part a
*parallel* system, so "series" and "parallel" there refer to these event rules, not to variances.

**Without independence** only bounds follow from the marginals. The Fréchet bounds give
$\max(0, p_1 + p_2 - 1) \le P(A_1 \cap A_2) \le \min(p_1, p_2)$, here between 0.4 and 0.6. The
workbook's shared-cause simulation, where one uniform draw drives both events, reaches the upper
bound 0.6. Knowing the dependence, or the joint probability, is part of the question.

**Two scores for one event are not two events.** Let Y be the outcome and I the information a
model sees. Suppose a model reports the exact conditional probability $s = P(Y = 1 \mid I)$. That is
stronger than calibration: a model that always says 0.5 when half the cases are events is
calibrated, and so is one that says 0.2 or 0.8 and is right at those rates, but only the second
uses I. A second model that also reports the exact conditional probability given the same I
must report the same number, since $P(Y = 1 \mid I, I) = P(Y = 1 \mid I)$.
Multiplying the two scores computes the probability that two *distinct independent* events both
happen; $1 - (1 - s_1)(1 - s_2)$ computes the probability that at least one of them happens.
Neither is the probability of Y. With two identical 0.8 scores these give 0.64 and 0.96; the
correct answer is 0.8.

**Outcome variance is not estimation uncertainty.** For a Bernoulli outcome with probability p,
$p(1-p)$ is the variance of Y itself. It says nothing about how precisely p was estimated, so it is
not an inverse-variance weight for fusing two probability estimates. Squared residuals of single
cases are not variance estimates for those weights either.

**Complements.** $\operatorname{Var}(a + bZ) = b^2\operatorname{Var}(Z)$; with $a = 1$ and
$b = -1$, $\operatorname{Var}(1 - Z) = \operatorname{Var}(Z)$. This identity does not make two
estimates, or two events, independent.

**Combining evidence with odds.** Write $O(\cdot) = P(\cdot)/(1 - P(\cdot))$. Bayes' rule in odds
form is $O(Y \mid E) = O(Y)\,\mathrm{LR}(E)$, where LR is the likelihood ratio
$P(E \mid Y)/P(E \mid \lnot Y)$. If $E_1$ and $E_2$ are independent **given Y and given ¬Y**,
the likelihood ratios multiply, and

$$
O(Y \mid E_1, E_2) = O(Y)\,\mathrm{LR}_1\,\mathrm{LR}_2 = \frac{O(Y \mid E_1)\, O(Y \mid E_2)}{O(Y)} .
$$

Each posterior already contains the prior, so the prior odds are divided out once. With prior 0.5
and posteriors 0.8 and 0.8, the combined odds are $4 \cdot 4 / 1 = 16$, a probability of
$16/17 \approx 0.941$. If both posteriors came from the *same* evidence, conditional independence
fails: given $E_1$, the copy $E_2$ has likelihood ratio 1, and the answer stays 0.8. This is an
evidence model, not a licence to multiply arbitrary model scores.

## 6. More circuits

Sections 2–4 use one dictionary: variance as resistance. Four others are exact under their own
assumptions, and they answer a natural question: if variance is the resistance, what is the
voltage?

### Estimates as voltage sources

Model estimate $i$ as an ideal source at potential $x_i$ in series with an internal resistance
$v_i$, and join the sources at one node. With no external load, Kirchhoff's current law gives
$\sum_i (x_i - V)/v_i = 0$, so

$$
V = \frac{\sum_i x_i / v_i}{\sum_i 1/v_i}, \qquad R_{\text{seen}} = \frac{1}{\sum_i 1/v_i}.
$$

This is Millman's theorem, and $(V, R_{\text{seen}})$ is the Thévenin equivalent of the sources.
It is term for term the inverse-variance estimate and its variance from §2. The potential is the
value of the random variable; the resistance is its variance. Since a Thévenin equivalent is
itself a source, fusing in stages (fuse two estimates, then fuse the result with a third) gives
the same answer as fusing all three at once. That is the static form of the Kalman update. The
dictionary needs the assumptions of §2: unbiased estimates, known variances, uncorrelated errors.
Correlated errors correspond to coupled sources and need the matrix form of §3.

### Log probabilities: an exact series–parallel duality

For independent parts that work with probabilities $p_i$, define $r_i = -\ln p_i$ and
$g_i = -\ln(1 - p_i)$, both in nats. A series system works only if every part works, so

$$
P_{\text{series}} = \prod_i p_i = e^{-\sum_i r_i},
$$

and the $r_i$ add like resistances. A parallel system fails only if every part fails, so

$$
1 - P_{\text{parallel}} = \prod_i (1 - p_i) = e^{-\sum_i g_i},
$$

and the $g_i$ add like conductances. For one part, $p + (1 - p) = 1$ becomes

$$
e^{-r} + e^{-g} = 1 .
$$

The relation is symmetric in $r$ and $g$, so the map $r \mapsto g = -\ln(1 - e^{-r})$ is its own
inverse, as $r \mapsto 1/r$ is for resistors (where $rg = 1$). Both maps are decreasing and
mirror-symmetric in the line $g = r$. They are different maps, so the two analogies cannot be
mixed in one circuit: a reliability network reduces with the log rules, a variance network with
the reciprocal rules.

**Approximations.** For $p$ near 1, $r = -\ln p \approx 1 - p$, so in a series system the failure
probabilities add approximately. The exact statement is the union bound,
$1 - \prod_i p_i \le \sum_i (1 - p_i)$. Symmetrically, for small $p$, $g \approx p$: rare
successes in parallel add approximately.

**Limits.** The rules need independent parts, each appearing once. A series–parallel network
then reduces bottom-up exactly. A part shared by two branches breaks independence between the
branches. A bridge is not series–parallel at all; condition on one part $e$ (pivotal
decomposition), $P = p_e P(\text{system} \mid e \text{ works}) + (1 - p_e) P(\text{system} \mid e
\text{ fails})$, or enumerate the states. Kirchhoff's laws do not compute reliability.

### Entropy during the reduction

A part with probability $p$ has binary entropy

$$
h(p) = -p \ln p - (1 - p)\ln(1 - p) = p\,r + (1 - p)\,g ,
$$

its expected surprisal. Let blocks $A$ and $B$ have independent binary outcomes (they are
functions of disjoint, independent sets of parts), and let $C = f(A, B)$ be the merged outcome:
"both" for series, "either" for parallel. Because $C$ is a function of $(A, B)$,

$$
h(A) + h(B) = H(A, B) = H(C) + H(A, B \mid C) .
$$

So each merge keeps the entropy of the merged outcome exactly and discards
$H(A, B \mid C) \ge 0$: the uncertainty about which block failed, given whether the merged block
works. Summed over the whole reduction tree the terms telescope (each inner block is the output
of one merge and an input to the next), giving

$$
\sum_{\text{parts}} h(p_i) = h(P_{\text{system}}) + \sum_{\text{merges}} H(\text{inputs} \mid \text{output})
= h(P_{\text{system}}) + H(\text{parts} \mid \text{system outcome}) .
$$

Reducing a network is a deterministic coarse-graining, so it cannot increase entropy, and in
general it lowers it: the intuition that simplifying loses entropy is right. But nothing is
approximated. The bottom-up result is the exact entropy of the system's outcome, and the
discarded terms add up exactly to what is no longer tracked. The entropy of all the parts
together needs no network at all, because independent entropies simply add. The workbook checks
the sum of the losses against a brute-force conditional entropy over every combination of part
states.

### Random walks and Gaussian fields

Take a connected network with conductances $g_{ij}$, and let $C_i = \sum_j g_{ij}$. A random walk
steps from $i$ to $j$ with probability $g_{ij}/C_i$. Hold node $a$ at 1 V and node $b$ at 0 V.

**Voltage is a hitting probability.** Let $h(x)$ be the probability that the walk from $x$
reaches $a$ before $b$. Conditioning on the first step gives $h(x) = \sum_y (g_{xy}/C_x)\,h(y)$
at every other node, with $h(a) = 1$ and $h(b) = 0$. Multiplying by $C_x$ turns this into
Kirchhoff's current law $\sum_y g_{xy}(h(y) - h(x)) = 0$. Voltages satisfy the same equations with
the same boundary values, and the solution is unique, so $h = V$ [4].

**Escape probability.** A walk leaving $a$ reaches $b$ before returning to $a$ with probability
$\sum_y (g_{ay}/C_a)(1 - V_y) = I/C_a = C_{\text{eff}}/C_a$, where $I$ is the current out of $a$
at 1 V. On the workbook's bridge (edges a–c 1, a–d 2, c–d 1, c–b 2, d–b 1),
$V_c = 2/5$, $V_d = 3/5$, $C_{\text{eff}} = 7/5$, and the escape probability is
$(7/5)/3 = 7/15$. The bridge is not series–parallel, but Kirchhoff's laws handle it directly.

**Variance is resistance in a Gaussian field.** Give the network the Gaussian density
$\propto \exp(-\tfrac12 \sum_{i<j} g_{ij}(x_i - x_j)^2)$ with $x_b = 0$. Its precision matrix
is the graph Laplacian with $b$'s row and column removed, so its covariance $G$ is the inverse of
that matrix: the network's Green's function. Injecting a unit current at $a$ with $b$ grounded
produces voltages $G e_a$, so $G_{aa}$ is the voltage at $a$ per unit current:

$$
\operatorname{Var}(X_a) = G_{aa} = R_{\text{eff}}(a, b) .
$$

Conditioning on $X_a = 1$ gives $\mathbb E[X \mid X_a = 1] = G e_a / G_{aa}$, again the voltages
with $a$ at 1 V and $b$ at 0 V [5]. On the bridge, $\operatorname{Var}(X_a) = 5/7$ and
$\mathbb E[X_c \mid X_a = 1] = 2/5$. One linear system thus gives hitting probabilities,
conditional means, and variances.

### Probability trees

A probability tree asks questions in order. Each node is a question, and each branch leaving it
carries the conditional probability $q$ of that answer *given that the node was reached*. Exactly
one answer happens at a node, so its branches add to 1. Exactly one leaf happens overall, and its
probability is the product of the $q$'s on its path. Taking logs,

$$
-\ln P(\text{leaf}) = \sum_{\text{path}} (-\ln q),
$$

so surprisals add along a path, as resistances $r = -\ln q$ add in series. The entropy of the leaf
is its expected surprisal, $H = \sum_{\text{leaves}} P(\ell)\,(-\ln P(\ell))$: the expected
resistance of the path taken. Expanding each leaf's surprisal into its branches and collecting the
terms that pass through the same node $x$ gives the chain rule (Shannon's grouping property):

$$
H(\text{leaf}) = \sum_{\text{nodes } x} P(\text{reach } x)\, H(\text{branches at } x),
$$

where $H(\text{branches at } x) = -\sum_{\text{branches}} q \ln q$ is the information gained by
answering the question at $x$. In the workbook's weather tree (sunny 0.5; rain 0.3, split 0.6 /
0.4 into light and heavy; snow 0.2), the leaves have probabilities 0.5, 0.18, 0.12 and 0.2, and
$H = H(0.5, 0.3, 0.2) + 0.3\,H(0.6, 0.4) \approx 1.23$ nats, about 1.78 bits.

**How this differs from a reliability network.** In a reliability network all the parts exist at
once; the full outcome is the vector of every part's state, and series or parallel says how the
parts' states combine into the system's (all must work; any will do). In a probability tree the
leaves are mutually exclusive alternatives and the tree records an order of questions. The
reliability rules multiply probabilities of independent events that all happen together; the
tree multiplies conditional probabilities of successive answers on one path.

**Where they meet.** Diagnosing a reliability network is a probability tree. The first question
is "does the system work?" (entropy $h(P_{\text{system}})$); the second, "which combination of
part states?", asked separately under each answer. The leaves are the $2^n$ joint states, so the
tree's entropy is $\sum_i h(p_i)$, and the chain rule reproduces the bookkeeping above: the second
level's weighted entropy is $H(\text{parts} \mid \text{system outcome})$, the total forgotten by
the reduction. How much the second question tells you depends on the first answer. For a plain
series system that works, every part worked, so the second question has one answer and tells you
nothing. The workbook's network has parallel blocks, so a working system still leaves 15 possible
states (2.99 bits) and a failed one 49 (4.03 bits). The first question is worth 0.64 bits and the
second 3.16 on average, 3.80 bits in all. Opening the reduction's blocks one at a time instead builds a
deeper tree whose node terms are the per-merge losses; the total is the same.

## 7. Application: calibration, ranking and stacking

**Two questions.** *Discrimination* asks whether higher scores go with the event. The AUC, the
probability that a random event case outscores a random non-event case (ties counting half), is
the Mann–Whitney statistic and depends only on the ranking. *Calibration* asks whether scores
mean what they say: among cases scored 0.7, about 70 % should be events. A model can rank well
and be badly calibrated, or the reverse [3].

**Recalibration and ranking.** Platt scaling fits $P(Y = 1 \mid s) = \sigma(a + b\operatorname{logit}s)$.
When $b > 0$ the map is strictly increasing, so it keeps the ranking and the AUC exactly; the
workbook checks this. Isotonic calibration is only nondecreasing, so it can merge scores into ties
and change the AUC. Separate maps for two models, or a new stacked score, need not preserve the
original *cross-model* ordering.

**Why the naive product fails.** $s_1 s_2 \le \min(s_1, s_2)$, so the product is systematically too
low. It is increasing in each score, so it can still rank reasonably. In the workbook's synthetic
data its AUC is close to the others' while its mean prediction falls well below the event rate.

**Stacking and the odds rule.** Logistic regression on both logits,
$\sigma(\beta_0 + \beta_1\operatorname{logit}s_1 + \beta_2\operatorname{logit}s_2)$, contains the
conditional-independence odds rule of §5 as a special case: $\beta_1 = \beta_2 = 1$ and
$\beta_0 = -\operatorname{logit}(\text{prior})$, for calibrated inputs. When the two predictors share
error, part of the second score duplicates the first, and the fit discounts it: typically the
coefficients shrink below 1. That is not a rule. A coefficient can be negative, when one score
mostly corrects the shared error of the other, or above 1, when an input is underconfident.
Stacking learns the discount from data instead of assuming independence.

**Avoiding leakage.** Calibration maps and stacking weights must be fitted on predictions the base
models did not train on: a held-out split or out-of-fold predictions. In-sample scores are usually
overconfident, so a stacker fitted on them learns the wrong discount. Evaluation then needs a third,
untouched set; the workbook fits on one half of the synthetic cases and evaluates on the other half
(its base predictors are given, not trained).

**Metrics.** The Brier score and log loss are proper scoring rules, rewarding both calibration and
discrimination. The workbook also reports calibration-in-the-large (mean prediction minus event
rate, ideally 0) and the calibration slope (ideally 1; below 1 means overconfident scores).

## 8. Beyond trees

Trees are the easiest networks to reason about, because every combination is a series or parallel
step. Whether the circuit methods survive loops and merging paths depends on the dictionary.

**Random walks and Gaussian fields work on any network.** The arguments of §6 never used the
tree shape: first-step analysis gives Kirchhoff's current law at every inner node of any
connected graph, and the Gaussian-field identities hold for any graph Laplacian. What they need
is a symmetric conductance on each link. For a walk with transition probabilities $P_{ij}$ and
stationary distribution $\pi$, a conductance model $g_{ij} = \pi_i P_{ij}$ exists exactly when
$g_{ij} = g_{ji}$, i.e. detailed balance, $\pi_i P_{ij} = \pi_j P_{ji}$: the walk is
*reversible*. The walk built from a network is reversible with $\pi_i \propto C_i$. A walk that
goes round a cycle in one direction is not, since $P_{xy} > 0$ while $P_{yx} = 0$. Its hitting
probabilities still solve the first-step equations $h = Ph$ with the boundary values, a linear
system like Kirchhoff's, but no resistor network produces them, and results that rely on energy
(Thomson's principle, Rayleigh monotonicity) no longer apply. The workbook's one-way cycle
($x \to y \to z \to x$ with probability 0.7, exits 0.3 to a, b, a) gives
$h_x = 0.447/0.657 = 149/219 \approx 0.680$.

**Merging paths change the parallel rule.** Consider a Markov chain run for several steps, or
any probability graph in which different routes reach the same node. Along one route the
probabilities multiply, so surprisals add: series is unchanged. But the routes into a node are
mutually exclusive alternatives, so their probabilities add, and in surprisal terms

$$
r = -\ln \sum_{k=1}^{K} e^{-r_k}, \qquad \min_k r_k - \ln K \;\le\; r \;\le\; \min_k r_k .
$$

This log-sum-exp, a *soft minimum*, is the parallel rule here; the resistor rule
$1/\sum_k (1/r_k)$ does not apply. The bounds follow from
$e^{-\min r} \le \sum_k e^{-r_k} \le K e^{-\min r}$. The forward algorithm is this series–parallel
reduction applied one time step at a time:
$r_j(t+1) = \operatorname{softmin}_i\,[\,r_i(t) - \ln P_{ij}\,]$, so its cost grows linearly with
the number of steps, though the number of routes grows exponentially. Replacing the soft minimum by
the minimum keeps only the most likely route: the shortest path in surprisal, which is what the
Viterbi algorithm computes. In probability terms the two operations are (sum, product) and
(max, product); in surprisal terms (soft-min, +) and (min, +). Both are semirings, which is why
the same dynamic programme works for each. The best route is a good stand-in only when one route
dominates. In the workbook's two-state chain (start 0.6 / 0.4, transitions 0.7 / 0.3 and
0.2 / 0.8, three steps), eight comparable routes merge into state 0; the exact probability is
0.425, but the single best route carries only 0.206.

**Reliability networks need conditioning.** The log rules of §6 reduce only series–parallel
networks of independent parts. A bridge (parts 1: s–c, 2: s–d, 3: c–d, 4: c–t, 5: d–t, working
if some path joins s and t) has no such reduction. Kirchhoff's laws do not help either: they
describe currents, not whether a connecting path exists. Conditioning on the bridge part does
work (the *pivotal decomposition*):

$$
P = p_3\,P(\text{works} \mid 3 \text{ works}) + (1 - p_3)\,P(\text{works} \mid 3 \text{ fails}).
$$

If part 3 works, c and d merge, giving $(1 \parallel 2)$ in series with $(4 \parallel 5)$; if it
fails, the network is $(1 \text{ series } 4) \parallel (2 \text{ series } 5)$. Both are
series–parallel. With every $p = 1/2$ the result is exactly $1/2$, by the self-duality of the
bridge. Larger networks may need several conditionings; in general, network reliability is
#P-hard to compute exactly, so there is no shortcut that works for every network.

**Summary.**

- *Variance as resistance* (§§2–4): exact for fusion and sums with independent errors; with
  correlation, the full covariance matrix is needed.
- *Random walks and Gaussian fields*: exact on any network with symmetric conductances.
- *Probability trees and graphs*: series is always exact; parallel is a sum of probabilities (a
  soft minimum of surprisals), which reduces to a minimum only approximately.
- *Reliability*: exact for series–parallel networks of independent parts; otherwise condition
  or enumerate.

## References

1. NIST/SEMATECH *e-Handbook of Statistical Methods*, discussion of weighting by inverse variance,
   including the caution that estimated weights do not inherit all known-weight optimality
   properties. <https://www.itl.nist.gov/div898/handbook/>
2. B. N. Taylor and C. E. Kuyatt, *Guidelines for Evaluating and Expressing the Uncertainty of NIST
   Measurement Results*, NIST Technical Note 1297: the first-order propagation law, covariance
   terms, and relative uncertainty of products. <https://www.nist.gov/pml/nist-technical-note-1297>
3. scikit-learn user guide, *Probability calibration*: calibration versus ranking and the ties
   introduced by isotonic regression. Background only; the workbook does not use scikit-learn.
   <https://scikit-learn.org/stable/modules/calibration.html>
4. P. G. Doyle and J. L. Snell, *Random Walks and Electric Networks*, Mathematical Association of
   America, 1984: hitting probabilities as voltages and escape probabilities from effective
   conductance. <https://arxiv.org/abs/math/0001057>
5. R. Lyons and Y. Peres, *Probability on Trees and Networks*, Cambridge University Press, 2016,
   chapter 2: electrical networks, Green's functions and effective resistance.
   <https://rdlyons.pages.iu.edu/prbtree/>
6. L. R. Rabiner, "A tutorial on hidden Markov models and selected applications in speech
   recognition", *Proceedings of the IEEE* 77(2), 1989: the forward and Viterbi algorithms.
   <https://doi.org/10.1109/5.18626>
7. L. G. Valiant, "The complexity of enumeration and reliability problems", *SIAM Journal on
   Computing* 8(3), 1979: network reliability is #P-complete. <https://doi.org/10.1137/0208032>
