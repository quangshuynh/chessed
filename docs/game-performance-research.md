# Estimated single-game performance research

Status: **not frozen and not a product feature**. No `chessed-performance-v1`
methodology exists.

## Proposed definition

Chessed Estimated Game Performance would be a bounded, approximate,
rating-like summary of the move quality demonstrated by one player in one
analyzed game. It would not be the player's actual rating, a prediction of
future rating, FIDE or tournament performance rating, a skill diagnosis, or
evidence of cheating or engine use.

Traditional performance rating derives from opponent ratings and game results.
The proposed Chessed concept instead derives from engine-assessed decisions.
Opponent rating, player rating, and result must remain calibration labels or
stratification context, not production inputs. A manual PGN without ratings
must remain eligible. A single game is a noisy sample and can differ greatly
from a player's long-term strength.

## Existing production evidence audit

`chessed-review-v3` already retains mover-relative before/after outcomes,
continuous outcome drop, first-class mate transitions, explicit terminal and
missing states, exact-best agreement, up to three ranked candidates on selected
positions, classification evidence, and game/color/ply identity.
`chessed-accuracy-v1` supplies per-move preservation and a uniform game mean.
These signals require no new production Stockfish pass.

Plausible primary signals are the distribution of continuous per-move outcome
drops or accuracies: robust center, lower tail, severe-loss frequency, and
evidence count. Exact-best agreement may add information only when candidate
values are near-equivalent. Candidate separation measures objective
alternative quality, not human cognitive difficulty. Mate and terminal states
must retain their existing semantic endpoints rather than fake centipawns.

The following are circular or misleading as primary inputs: classification
labels, bonuses for Great/Brilliant, penalties for Miss, game result, source or
opponent rating, player identity, and direct mappings from aggregate accuracy
to a rating. Raw centipawn loss is also position-dependent and cannot casually
replace outcome evidence in decided positions.

## Candidate models to test

All candidates must be fitted on calibration player-games and evaluated once
on a disjoint holdout.

1. Accuracy-only linear baseline. This is deliberately included to test whether
   anything richer earns its complexity; it is not an acceptable conclusion by
   assumption.
2. Accuracy plus severe-error rate.
3. A compact distribution model: median per-move accuracy, lower quartile,
   severe-error rate, and scored-move count.
4. Candidate 3 with objectively meaningful-choice weighting, only if MultiPV
   coverage and holdout results justify it.

Models must remain deterministic and explainable. Neural networks, tree
ensembles, result bonuses, opening-book adjustments, and rating-conditioned
production estimates are rejected for this interval. Bounds cannot be chosen
until fitted predictions and residuals are observed; `400-3000` is only a
hypothesis.

## Synthetic falsification requirements

Before selection, candidates must compare equal/similar-mean profiles:

- many perfect decisions plus one catastrophe;
- repeated moderate errors;
- consistently small losses;
- mostly forced or only-legal moves;
- several objectively separated critical choices played accurately; and
- a very short perfect sample.

Mean accuracy can rank the first profile above the more consistent profiles
because perfect moves pad an arithmetic mean. Median alone can hide the
catastrophe. A lower quantile plus severe-error rate can distinguish them, but
that distinction is useful only if holdout calibration shows independent
rating signal. One blunder must not dominate a long game merely by policy.
Only-legal moves should contribute little or no strength evidence; other
forcing positions cannot be excluded without an objective criterion and
calibration. The current review contract does not retain legal-move count, so a
forced/trivial adjustment would require additional cheap chess.js derivation or
new evidence—not another Stockfish pass.

## Public research

- The [Lichess open database](https://database.lichess.org/) releases standard
  rated-game PGNs under CC0 and provides ratings, results, time controls, and
  both colors. It is suitable calibration context, not a production dependency.
- Stockfish's [evaluation documentation](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html#interpretation-of-the-stockfish-evaluation)
  explains that normalized evaluations model engine-vs-engine play under stated
  conditions and that a human-scale Stockfish Elo is not directly measurable.
  It also warns that MultiPV divides search resources.
- Di Fatta, Haworth, and Regan, [Skill Rating by Bayesian
  Inference](https://cse.buffalo.edu/~regan/papers/pdf/DFHR09.pdf), models move
  choices against engine-ranked alternatives and demonstrates that decision
  evidence can discriminate rating bands. Its likelihood model needs broader
  candidate coverage than Chessed currently has and does not validate a simple
  one-game formula here.
- Ferreira, [Determining the Strength of Chess Players Based on Actual
  Play](https://web.tecnico.ulisboa.pt/diogo.ferreira/papers/ferreira12strength.pdf),
  estimates perceived strength from move-gain distributions, but explicitly
  cautions that results depend on an uncertain engine-strength anchor. Chessed
  should not import that anchor as if it were human Elo.
- Lichess's [accuracy documentation](https://lichess.org/page/accuracy)
  illustrates why move loss is position-dependent. Chessed retains its own
  frozen accuracy methodology rather than copying that metric.

## Reproducible dataset probe

`calibration/select-performance-sample.mjs` selects from the January 2013
Lichess standard rated export (CC0), whose compressed SHA-256 is recorded in
the generated artifact. It deterministically takes the first three normal-
finish rated games with 10-60 full moves in each mean-rating band: 1000-1399,
1400-1699, 1700-1999, and 2000-3000. The artifact retains PGN, ratings, result,
time control, source game ID, and a SHA-256-ID split.

The probe contains 12 games and 24 player-games across both colors, varied
outcomes, lengths, and controls. Only two games fall in the predeclared holdout.
That is insufficient to estimate median/mean absolute error, correlation, or
bias by band, length, outcome, and color without presenting unstable numbers as
evidence. No model was fitted and no holdout metrics were computed.

To reproduce the selection after downloading the source export:

```text
node calibration/select-performance-sample.mjs <path-to-2013-01.pgn>
```

The source archive itself is not committed. The small selected CC0 artifact is
committed so the selection can be audited without a 93 MB decompressed file.

## Stop decision

The evidence does **not** support freezing `chessed-performance-v1`. The
available real-game calibration is too small, especially its holdout, and the
current three famous accuracy fixtures are behavioral sanity checks rather than
rating ground truth. Therefore there is no production result contract, no
whole-game integration, no output bounds or fitted parameters, no UI, and no
additional Stockfish work. Frozen `chessed-review-v3` and
`chessed-accuracy-v1` remain unchanged.

A next interval should predeclare a larger deterministic stratified sample
(hundreds of games, with enough holdout player-games per band), analyze it with
the shipped engine/settings, compare the four candidates against the
accuracy-only baseline, and report residuals by rating band, game length,
color, outcome, and time control. Freeze only if a richer candidate has a
material and stable holdout improvement, sensible synthetic/trivial-padding
behavior, color symmetry, and explicit minimum evidence. Otherwise prefer a
non-rating move-quality profile in a later separately authorized interval.
