#!/usr/bin/env node
// English review candidate only. Register no catalogue entries until the
// frozen source has passed the existing 13-locale translation/review gates.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cells = [];
const md = (name, code) => cells.push({ type: 'markdown', language: 'markdown', name,
  code: code.trim().replaceAll('\\`', '`') });
const py = (name, file) => cells.push({ type: 'code', language: 'python', name,
  code: readFileSync(path.join(root, 'tools/spectral-mixing', file), 'utf8').trimEnd() });

md('intro', String.raw`
# Markov Graphs: Spectral Mixing and Convergence

**English review draft.** This is a fictional routing experiment, not a fleet planner or a claim about real delivery traffic. It needs only SciREPL's Python kernel, NumPy and built-in plotting; no package installation, API key or downloaded data.

**Level: Advanced mathematics.** The intended reading pace is first-year graduate study in applied probability or applied mathematics. The practical preparation is normally third-year undergraduate linear algebra (eigenvalues and orthogonality) and probability (conditioning, expectation and variance); some familiarity with Markov chains helps. These are readiness guidelines, not enrollment requirements.

**Running is easier than understanding every derivation.** You can run the workbook unchanged with basic SciREPL skills. Reading and modifying the code is easier if you know Python functions, loops, NumPy indexing and matrix multiplication. Allow additional background-study time if these mathematical or programming ideas are new to you.

We start with **one delivery truck**, then follow **two labelled trucks, A and B**. Their joint positions give a two-dimensional heatmap, echoing the two-sticker example in **Markov Groups**. The rules differ: these trucks move one at a time, and two trucks cannot occupy the same loading bay. Cube moves carry both stickers together and obey cube geometry.

Run named code cells in order, or use the cell menu's **Run all below** action. The default record is 10,000 steps, seed 314159. Helper cells are longer than the experiments; their docstrings explain the conventions. You can read the pictures first.

**Three questions, not one:** Where is the system after exactly $t$ moves? How accurate is a histogram of visits collected over $n$ moves? How much of its error is expected because consecutive visits are correlated? A spatially speckled picture alone answers none of these reliably.

The first plots need only probabilities and matrices. The spectral explanations are optional deeper reading, but run their helper cells if you want the later plots. The final two-state example separates periodicity from convergence.
`);

md('routing_bridge', String.raw`
## 1 · Two neighbourhoods and one bottleneck

Stops **0–5** form the west cycle; **6–11** form the east cycle. Stop 0 connects to stop 6. Each stop is a single loading bay, not a whole depot. A truck can move only along an edge or wait at its current stop.

Every within-neighbourhood edge has weight 1. We compare bridge weights $w=0.15$ (weak) and $w=1$ (strong), using the **same clock** in both cases. An edge of weight $a$ gives move probability $a/6$ in either direction; the leftover probability is waiting. This deliberately balanced routing is **not** the usual random walk that chooses uniformly among neighbours. The bridge weight is an imposed crossing probability, not congestion calculated from road traffic.

Let $A$ be the symmetric edge-weight matrix, $D$ the diagonal matrix of weighted degrees, and $L=D-A$ the graph Laplacian. Then

$$P=I-\frac{1}{6}L,\qquad P[d,j]=\Pr(X_{t+1}=d\mid X_t=j).$$

Columns are source stops; rows are destination stops. At stop 0, two local moves each have probability $1/6$, crossing the bridge has probability $w/6$, and waiting has probability $1-(2+w)/6$. Waiting is at least $1/2$ everywhere. Positive moves connect the graph; waiting prevents forced alternation. The stationary probability is $\pi_j=1/12$, because $P$ is symmetric and stochastic.

Run \`route_graph\` to build both models, then \`draw_routes\` for the picture. Labels are stop indices throughout; west/east names refer to neighbourhoods, not to truck A/B.
`);
py('route_graph', 'setup.py');
py('draw_routes', 'graph_picture.py');

md('single_bridge', String.raw`
## 2 · Endpoint probability is not a visit histogram

The one-truck experiment starts at **stop 3**. Its one-hot column vector is $e_3$: entry 3 is 1 and every other entry is 0. After exactly $t$ moves,

$$q_t=P^t e_3.$$

Entry $d$ of $q_t$ is the probability that the truck is at stop $d$ **at that time**. It is not the fraction of earlier visits to $d$. The following code propagates the probability vector directly, without sampling a route.

We measure distance from stationarity with **total variation**:

$$\mathrm{TV}(q,\pi)=\frac12\sum_j|q_j-\pi_j|.$$

Zero means the distributions match. The stronger bridge speeds exchange between neighbourhoods. The bar chart at $t=100$ shows the actual endpoint distributions, not a running average. A single truck's eventual target is $1/12$ per stop.
`);
py('single_endpoints', 'single_picture.py');

md('joint_bridge', String.raw`
## 3 · Two trucks make a 12 × 12 map

A state is the **ordered pair** $(a,b)$: truck A at stop $a$, truck B at stop $b$. Swapping the two labels gives a different state. At each step:

1. Choose A or B with probability $1/2$.
2. Propose a move using that truck's source column of the one-truck matrix $P$.
3. If its proposed bay is occupied by the other truck, **stay instead**. Keep this probability; do not discard it and renormalize the remaining moves.

The other truck stays put. Ordinary waiting and rejected moves both count as full time steps. A rejected proposal is **not rerouted immediately**: the truck waits until a later step.

**What are the routing rules?** The road graph is fixed, but a truck's route is a fresh sequence of random choices. Trucks have no delivery list, preferred destination, timetable or memory of earlier stops. They do not optimize a route or try to visit every stop once: this is **not a travelling-salesman problem**. A reverse move on the next step is allowed.

**Are closer routes preferred? Is there a warehouse?** Each move goes only to an adjacent stop, so the model is local. Both within-neighbourhood directions have equal probability; no distances or travel times are supplied, and the picture's spacing is only a drawing. There is no designated warehouse or scheduled return. All bays have the same role. A future warehouse-return experiment would need to distinguish elapsed abstract steps, actual moves, and completed stops: waiting at the warehouse would otherwise count as an immediate return.

**Only bay congestion is modeled:** each bay holds one truck. Roads have no queues, travel times, lane capacities or occupancy, and trucks do not learn to avoid traffic. A narrow-looking bridge stands for an externally chosen low crossing probability. Interacting trucks are still described by a fixed matrix on the full pair state; their joint law evolves linearly as $q_{t+1}=P_{\rm pair}q_t$. A traffic model that changes routing probabilities with an evolving aggregate congestion distribution would be a different, generally nonlinear model.

There are $12\times11=132$ legal ordered pairs. The code discovers them by breadth-first search and verifies that every pair with $a\ne b$ is reachable. The resulting $132\times132$ transition matrix $P_{\rm pair}$ remains symmetric and lazy, with stationary probability $1/132$ per legal pair.

**Read the heatmap by its axes, not by colour changes:** horizontal position is **truck A's stop (0–11)**; vertical position is **truck B's stop (0–11)**. There are 12 tiles per axis, bounded by 13 grid lines. The 12 dark diagonal tiles are forbidden shared bays. Every off-diagonal tile is legal—even if a finite route has not visited it. A legal zero has the colour-scale's zero colour, not the dark forbidden background.

**A legal tile is a legal snapshot, not necessarily a one-step destination.** Both $(0,6)$ and $(6,0)$ are legal arrangements, but one step cannot move between them: only one truck moves, and a proposed move into an occupied bay becomes a stay. These restrictions are already encoded in $P_{\rm pair}$. The current pair contains everything the blocking rule needs; no memory of earlier steps is required. Given a starting pair, a route's probability is the product of its one-step transition entries, so any forbidden transition makes that route impossible.

Over several steps the trucks can exchange their starting bays **without passing through each other**. On the west loop, start with A at 3 and B at 4. A moves $3\to2\to1\to0\to5$, then B moves $4\to3$ and A moves $5\to4$: six legal moves into empty bays. Swapped endpoints therefore do not prove overtaking. This example establishes a possible route, not its expected waiting time.

This is an exclusion model chosen for teaching. Separate loading bays at a real depot, traffic queues, route schedules and vehicle capacities would need different rules.
`);
py('joint_kernel', 'joint_model.py');

md('spectrum_bridge', String.raw`
## 4 · Slow graph patterns, not ordinary image frequencies

A heatmap's nearby pixels need not be nearby **states of the routing graph**. Relabelling the stops rearranges the picture without changing the chain. Graph eigenvectors give patterns adapted to allowed transitions, including the forbidden diagonal.

For either model, let $M$ be its number of states (12 or 132). A nonconstant mode satisfies

$$P u_k=\rho_k u_k,\qquad \mu_k=1-\rho_k.$$

Here $\mu_k$ is an eigenvalue of $I-P$; for the one-truck model, $I-P=L/6$. Our lazy symmetric matrices have $0\le\rho_k<1$ for nonconstant modes. After $t$ moves, an endpoint coefficient is multiplied by $\rho_k^t$. A small $\mu_k$ therefore means slow decay. The **spectral gap** is the smallest nonzero $\mu_k$; its reciprocal is a relaxation-time scale, not a guarantee of a particular total-variation tolerance.

The next helper cell diagonalizes both models. It uses $\phi_k=\sqrt M\,u_k$, so nonconstant modes have mean zero and variance one under the uniform stationary distribution. This normalization matters for the later uncertainty formulas.

**Separate the clock effect from the exclusion effect:** a pair step selects only one truck, so each label receives a proposal on average once every two steps. In these two graphs, the second nonconstant pair mode has decay rate exactly half the one-truck spectral gap: about **0.003620** (weak) or **0.013147** (strong). That pooled-density mode reflects the per-truck clock alone.

The slowest pair mode changes sign when A and B are swapped. Its decay rate is about **0.002802** (weak) or **0.008242** (strong)—respectively **23%** and **37%** below the half-speed reference. That additional slowness comes from tracking which truck is where under exclusion, not just from selecting one truck per step. These percentages compare decay rates, not convergence times. Weak-versus-strong comparisons within either model keep the same clock.

Within the pair model, keeping track of **which truck** crossed the bottleneck can be slower than balancing their combined stop counts. These are graph modes; we do not estimate graph dimensionality from this tiny example.
`);
py('spectral_tools', 'spectral_tools.py');
py('spectral_picture', 'spectrum_picture.py');

md('endpoint_bridge', String.raw`
## 5 · Balanced pooled visits can hide an unmixed pair

Start at $(3,9)$: A west of the bridge and B east of it, at opposite points of their cycles. The two heatmaps show the **exact endpoint law at step 100**, computed from $P_{\rm pair}^{100}$ rather than a sampled route. Both use the same colour scale. At stationarity every off-diagonal tile would have probability $1/132\approx0.00758$.

For each heatmap, summing a column gives A's marginal probability and summing a row gives B's. **Pooling** averages these two marginals and deliberately forgets the truck label:

$$q_{\rm pooled}(j)=\frac12\{\Pr(A=j)+\Pr(B=j)\}.$$

At step 100, joint distance from $1/132$ is about **0.521** (weak) or **0.291** (strong), and A alone is still west with probability about **0.89** or **0.72**. Yet pooled distance from $1/12$ is about **0.000111** for *both* bridges. This matching value is not a coincidence, and the west/east cancellation is exact rather than approximate.

For this symmetric routing rule, the pooled law from **any starting pair** $(a,b)$ is exactly a half-speed one-truck walk:

$$Q=\frac{I+P}{2},\qquad q_{\rm pooled}(t)=Q^t\frac{e_a+e_b}{2}.$$

The occupied-bay terms cancel in the pooled update: a hypothetical exchange of A and B would leave the unlabelled pair unchanged, just like a blocked proposal. This explains the identity; it does **not** mean the trucks actually swap in one step. Pooled visits can show one-truck modes but cannot retain all labelled-pair information.

Our start $(3,9)$ gives a west/east-symmetric pooled law. Its west mass is exactly $1/2$ at every step, with equal probabilities at bridge endpoints 0 and 6. The **net pooled probability flow** across the bridge is therefore zero, and changing the bridge weight has no effect on this pooled law. Individual routes still cross in both directions. The small distance **0.000111** is remaining unevenness within each loop. **Neither individual truck's marginal is thereby proven uniform.**

The curve plot compares joint and pooled endpoint distances over time. A balanced aggregate statistic can miss a slowly relaxing pattern. This is why a white-looking heatmap, or a good one-dimensional marginal, is not a general mixing test.

**Fast locally, slow globally:** probability can redistribute within each neighbourhood before much crosses the bridge. Removing a neighbourhood imbalance requires enough probability flow across that cut—not that every individual route has crossed by a particular time. Late error is dominated by slow modes only if the initial distribution excites them. Pooling A/B can cancel the slow labelled-exchange pattern and hide it.
`);
py('joint_endpoints', 'joint_picture.py');

md('entropy_bridge', String.raw`
### 5a · Counting effective possibilities

Both bridge cases have the same legal states and allowed routes, but different route probabilities. A raw count treats very unlikely outcomes like likely ones. For the **exact endpoint distribution** $q_t$, entropy provides a probability-weighted effective count:

$$H_t=-\sum_s q_t(s)\log_2 q_t(s),\qquad N_{\rm eff}(t)=2^{H_t}.$$

Terms with zero probability contribute zero. If $K$ outcomes are equally likely, $N_{\rm eff}=K$. Two outcomes with probabilities 99% and 1% give $N_{\rm eff}\approx1.06$, not 2. Rare outcomes are not deleted; many rare outcomes together can still carry important probability.

From the known starting pair, $H_0=0$. After one move, **five** endpoint pairs are possible, but their effective count is only **three**: waiting has probability $2/3$, and each of four neighbouring pairs has probability $1/12$. At uniform equilibrium, $H=\log_2 132\approx7.044$ bits and $N_{\rm eff}=132$.

For this uniform target, the entropy deficit is exactly KL divergence in bits:

$$D_{\rm KL,2}(q_t\|\pi)=\log_2 132-H_t.$$

Thus every endpoint-entropy increase is an equal decrease in that distance from equilibrium. Its rate of increase is progress, not a fixed mixing-rate constant; close to equilibrium there is little deficit left to remove. For a **nonuniform** stationary target, use KL divergence to that target instead: Shannon entropy alone need not increase toward equilibrium.

**State possibilities are not route histories.** New next-state choices can keep adding histories after the current-state distribution is already stationary. Their conditional entropy $H(X_{t+1}\mid X_t)$ is not the same as the gain $H_{t+1}-H_t$: different histories merge at the same endpoint. Here a history records the pair state after each step, not hidden dispatcher decisions. Different truck selections or blocked proposals that produce the same stay are combined into one next-state outcome. Exactly,

$$H_{t+1}-H_t=H(X_{t+1}\mid X_t)-H(X_t\mid X_{t+1}).$$

The first chart plots effective current-state possibilities. The second compares endpoint gain with new-choice entropy, both in bits per step. New choices remain uncertain after endpoint gain approaches zero. Both use propagated endpoint laws, **not entropy estimated from the noisy visit histogram**. [Entropy-rate background](https://onlinelibrary.wiley.com/doi/abs/10.1002/047174882X.ch4)

**Same edges, different speeds:** both models have identical allowed edges and uniform stationary visits, yet their mixing rates differ. The weight on the bottleneck matters, not just which links exist.
`);
py('entropy_picture', 'entropy_picture.py');

md('clustering_bridge', String.raw`
### 5b · What does the pair map tell us about clustering?

The heatmap tells us the probability of each pair of stops. To summarize **clustering**, specify what "near" means: sharing a neighbourhood, occupying adjacent stops, or having a small graph distance. Joint total variation alone is not a clustering statistic.

The next cell uses **unweighted shortest-path distance**: each road counts as one hop, including the bridge. This is connectivity distance, not travel time or a distance penalized by the bridge's low crossing probability. Same-neighbourhood membership is a separate summary; stops 0 and 6 are adjacent even though they are in different neighbourhoods.

Compare with the uniform distribution on the **132 legal ordered pairs**, not independent draws that would allow forbidden shared bays. At this equilibrium, 60 pairs share a neighbourhood, 26 are adjacent, and mean graph distance is 3:

$$\Pr(\text{same neighbourhood})=\frac{60}{132}=\frac5{11},\qquad
\Pr(\text{adjacent})=\frac{26}{132}=\frac{13}{66}.$$

Starting at $(3,9)$, the trucks initially occupy opposite neighbourhoods. At step 100, the same-neighbourhood probabilities are approximately **19.8%** (weak bridge) and **41.0%** (strong bridge), versus **45.5%** at equilibrium. These examples retain separation rather than demonstrating attraction or a traffic jam. They approach their baseline as the labelled pair mixes.

Real congestion could add road occupancy, queues, destinations and route adaptation. Those variables are absent here. A fixed routing rule on an enlarged full state can still give a linear Markov update; rules depending on an evolving aggregate distribution can produce nonlinear equations. Pipe-flow and traffic models would be separate applications, not alternate interpretations of these toy probabilities.
`);
py('clustering_picture', 'clustering_picture.py');

md('occupation_bridge', String.raw`
## 6 · A running average measures the whole record

Now sample a single seeded pair route. After each move, count its current pair—including waits and blocked proposals. The record contains $X_1,\ldots,X_n$; the starting state $X_0$ is **not** counted. For pair $s$,

$$\widehat\pi_n(s)=\frac1n\sum_{t=1}^{n}\mathbf1\{X_t=s\}.$$

Equivalently, update the running histogram recursively:

$$\widehat\pi_n=\widehat\pi_{n-1}+\frac{e_{X_n}-\widehat\pi_{n-1}}{n}.$$

The code stores integer counts and divides at checkpoints 100, 1,000 and 10,000; it computes the same estimator. The two heatmaps below use **10,000 visits**, with a common colour scale. They are not the endpoint laws above.

Early biased visits remain part of this average even after the endpoint law is close to stationary. Its deterministic expectation is

$$\mathbb E[\widehat\pi_n]=\frac1n\sum_{t=1}^{n}P_{\rm pair}^{t}e_{(3,9)}.$$

The following distance plot separates the sampled histogram, this **expected histogram**, and the exact endpoint law. The expectation describes initialization bias, not a particular noisy route. Total variation is nonlinear: distance of the expected histogram is not the expected distance of a sampled histogram. A seeded route's error need not decrease at every checkpoint.
`);
py('sample_walks', 'simulation.py');
py('occupation_picture', 'occupation_picture.py');

md('noise_bridge', String.raw`
## 7 · Expected noise depends on each mode's persistence

Project the histogram error onto a nonconstant, unit-variance graph mode:

$$a_k=\sum_s(\widehat\pi_n(s)-\pi_s)\phi_k(s)
     =\frac1n\sum_{t=1}^{n}\phi_k(X_t).$$

The stationary term vanishes because $\sum_s\pi_s\phi_k(s)=0$. **If the route starts in stationarity**, then $\mathbb E[a_k]=0$ and

$$\operatorname{Var}(a_k)=\frac{\tau_k(n)}n,\qquad
\tau_k(n)=1+2\sum_{h=1}^{n-1}(1-h/n)\rho_k^h.$$

Nearby observations along a persistent mode contain less independent information. For a long record,

$$\tau_k(\infty)=\frac{1+\rho_k}{1-\rho_k}
 =\frac{2-\mu_k}{\mu_k}.$$

For a slow mode with $n\mu_k\gg1$, its standard error is approximately $\sqrt{2/(n\mu_k)}$—**not** $1/(\sqrt n\,\mu_k)$. The first plot uses the exact finite-record formula, so it does not assume this long-record condition. These covariance ideas are developed in [Aldous and Fill's treatment of reversible walks](https://www.stat.berkeley.edu/~aldous/RWG/Book_Ralph/Ch4.S4.html).

Normalize each mode's squared error by its stationary variance and average:

$$W_n=\frac{1}{M-1}\sum_{k=1}^{M-1}\frac{n a_k^2}{\tau_k(n)}.$$

For a stationary start, $\mathbb E[W_n]=1$ exactly; the pair model uses denominator **131**. This is a **noise-adjusted occupation score**, not proof that the endpoint mixed, not a calibrated confidence interval, and not an exact chi-square test. It downweights naturally noisy slow modes. Report raw histogram distance alongside it.

Our main route starts at a fixed pair, not in stationarity. It can have nonzero mode means and different covariance, so **1 is only a stationary reference for its W**, not its exact expected value. In fact,

$$\mathbb E_{x}[a_k]=\phi_k(x)\frac{\rho_k(1-\rho_k^n)}{n(1-\rho_k)}.$$

The leading $\rho_k$ comes from counting after the first move. A burn-in can reduce this bias but does not make the stationary formulas automatically exact. Repeated eigenvalues admit different eigenvector bases; the plot groups equal-eigenvalue bands and averages their energies, preserving the interpretation across such basis changes.
`);
py('noise_picture', 'noise_picture.py');

md('stationary_bridge', String.raw`
## 8 · Check the stationary reference in a separate experiment

The next picture uses **128 independent simulated routes of 2,048 moves each**, initialized uniformly over the 132 legal pairs. This is a different experiment from extending the one fixed-start route.

For each equal-eigenvalue band, compare empirical variance across these routes with $\tau_k(n)/n$. Band averages avoid choosing a privileged basis within repeated modes. Ratios should fluctuate around 1; 128 replications do not produce an exact match. The printed mean W and its Monte Carlo standard error also check the reference $\mathbb E[W]=1$.

Zero stationary covariance between different normalized modes does **not** establish independence. We use these replications as a numerical illustration, not a calibrated hypothesis test or real-world validation. The model's routing and exclusion assumptions remain the main limitations.
`);
py('stationary_check', 'stationary_picture.py');

md('periodic_bridge', String.raw`
## 9 · A periodic endpoint can have a balanced time average

Consider two states. With stay probability $s$,

$$P_s=\begin{pmatrix}s&1-s\\1-s&s\end{pmatrix},\qquad\rho_1=2s-1.$$

For $s=0$, the system alternates forever. Starting at state 0, the endpoint probability never converges to $(1/2,1/2)$, but visits collected over an even number of moves are exactly balanced. With $s=1/2$, the endpoint becomes uniform after one move. Its **expected** visit histogram is uniform too, but a particular finite sampled route need not have exactly balanced counts. The next plot averages endpoint laws to show this expected record; it does not simulate such a route.

This is **periodicity of a finite Markov chain**, not a nonlinear dynamical-system limit cycle. The delivery kernels contain waiting, so they avoid this forced alternation. The next short code cell handles the negative periodic eigenvalue directly; the earlier lazy-kernel helpers intentionally assumed eigenvalues in $[0,1]$.
`);
py('periodic_example', 'periodic_picture.py');

md('takeaways', String.raw`
## What to keep—and what to try next

- An endpoint law and an occupation histogram are different distributions.
- Endpoint entropy counts effective current-state possibilities; route-history entropy can keep growing after the endpoint distribution has mixed.
- Two labelled trucks can look balanced after pooling while their joint law retains a slow label pattern.
- Clustering requires a stated proximity measure and an exclusion-aware baseline. Our trucks wander randomly; they do not solve delivery routes or reroute around road congestion.
- Forbidden states belong to the state graph, not to a missing-data interpolation problem. Relabelling heatmap axes cannot change the transition spectrum.
- Noise in a correlated record depends on both sample length and mode persistence. W near 1 can coexist with substantial raw histogram error.
- Waiting, connectivity, initialization and normalization are assumptions to check, not optional decoration.

**Experiments:** change the seed; increase the checkpoints to 30,000; compare fixed-start bias with the endpoint curve; or give each stop two bays and rebuild the state rules. Do not simply fill the forbidden diagonal without changing the model. More realistic dispatch would require schedules, asymmetric traffic, service times and capacity information.

**Related reading:** the existing **Markov Groups** workbook supplies the cube permutation example. [Aldous and Fill, spectral representation](https://www.stat.berkeley.edu/~aldous/RWG/Book_Ralph/Ch3.S4.html) develops reversible-chain modes and relaxation. [Glynn, simulation bias and variance](https://web.stanford.edu/~glynn/papers/1984/G84.html) discusses sample averages. [Shuman et al., graph signal processing](https://arxiv.org/abs/1211.0053) motivates graph-adapted rather than rectangular-image spectra. Spatial error spectra, spectral dimension and nonlinear limit cycles could each be a separate follow-up; this workbook does not claim to solve those topics.
`);

const workbook = { format: 'srwb', version: '1.0', notebook: {
  name: 'Markov Graphs: Spectral Mixing and Convergence', cells,
} };
const destination = path.join(root, 'drafts/markov-spectral-mixing/en/markov-spectral-mixing.srwb');
const content = JSON.stringify(workbook, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== content) throw Error('English candidate differs from its inspected builder sources');
  console.log('English candidate matches: ' + cells.length + ' cells');
} else {
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content);
  console.log('Built English review candidate: ' + cells.length + ' cells');
}
