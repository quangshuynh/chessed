# Estimated single-game performance calibration v2

Status: **rejected; not frozen and not a product feature**. No
`chessed-performance-v1` methodology, production contract, integration, or UI
exists. The richer preregistered model did not materially outperform an
honestly fitted `chessed-accuracy-v1` baseline.

## Audit and preregistration

The prior 12-game research commit was merged to `main` as PR 19 before this
interval. `chessed-review-v3` and `chessed-accuracy-v1` remained frozen. The
latest base-branch CI run was green. The v2 design in
`calibration/performance/experiment-v2.json` was committed before engine
analysis or fitting; its selection hash is reproducible and validation fitting
reproduces byte-identical results and lock artifacts.

The specification fixed 480 games, four equal mean-rating strata, a 60/20/20
game-level split, source/eligibility rules, candidate features and models,
metrics, synthetic cases, and rejection thresholds. Both players from a game
remain in the same partition. Actual/player/opponent rating, result, identity,
band, and time control are calibration context only and never enter candidate
feature extraction.

## Source and selection

The source is the [Lichess January 2013 standard rated database](https://database.lichess.org/standard/lichess_db_standard_rated_2013-01.pgn.zst),
released under CC0. The compressed SHA-256 is
`aa40b3671fa3cf1072eb182892cd90b0e1e003a4a5943492f64b77e7f3fd1635`.
`WhiteElo` and `BlackElo` are the pre-game ratings recorded with the game;
separate rating-difference tags describe the subsequent change. The archive
provides result, numeric clock, termination, opening metadata, and movetext.
Retrieval, verification, decompression, and selection commands are documented
in `calibration/performance/README.md`.

Eligibility required a rated standard game, normal termination, a decisive or
draw result, both integer ratings, a numeric `initial+increment` clock with an
estimated duration of at least 30 seconds, a legal chess.js reconstruction, and
20-160 plies. Variants, correspondence/non-numeric clocks, ultrabullet-like
controls, aborted/unterminated or malformed games, out-of-band ratings, and
games outside the length range were excluded deterministically.

Game identity is the normalized lowercase Lichess ID. Within each band, games
were ordered by SHA-256 of `performance-calibration-v2`, a NUL byte, and the ID;
the first 120 eligible legal games were selected. The first 72/next 24/final 24
per band became train/validation/holdout. A clean selector rerun produced the
same selected-artifact hash,
`b7e7df52ffa52af73577a8ba91c8eefe5e95e457a0dd38b30c2fad24d47e8836`.

## Corpus

- 480 games and 960 player-games; 120 games in each 1000-1399, 1400-1699,
  1700-1999, and 2000-3000 mean-rating band.
- 288/96/96 games and 576/192/192 player-games in train/validation/holdout.
- 480 White and 480 Black player-games.
- 237 White wins, 219 Black wins, and 24 draws; equivalently 456 win, 456 loss,
  and 48 draw player-games.
- 128 bullet, 197 blitz, 143 rapid, and 12 classical games, using Lichess clock
  semantics `initial + 40 * increment` with 180/480/1500-second boundaries.
- 131 short (20-49 plies), 266 medium (50-100), and 83 long (101-160) games.

The expert stratum had almost no rapid and no eligible classical source games;
time control was therefore diagnostic rather than quota-controlled. This is a
material generalization limitation.

## Engine evidence and runtime

Every game used the shipped Stockfish 18 lite browser worker at production
depth 12. Existing `chessed-review-v3` MultiPV enrichment and depth-16 Great
boundary confirmation semantics were retained. Performance added no engine
pass and did not change review or accuracy constants. The JSONL checkpoint is
append-only, hash-validated per game, resumable by ID, and safe to shard by a
fixed list index. Raw UCI logs are not stored.

Four shards completed in about 20.5 minutes wall time. Summed per-game elapsed
time was 5,035 seconds and the median game took 9.79 seconds. The analyzed
artifact is 3.27 MB. A first parallel wrapper run had a post-collection
Playwright trace-directory collision; separate per-shard output directories
fixed the harness defect, and all four resumable verification runs then passed
without recomputation.

## Candidates and validation

All candidates were ordinary least squares fitted on training player-games.
Bounds (`unconstrained` or 400-3000 clipping) and minimum evidence thresholds
(2, 5, 10, 15, 20) were selected only on validation. Candidates were the
training mean; accuracy-only; accuracy plus severe-error rate; a distribution
model using accuracy, lower quartile, severe-error rate, and near-perfect rate;
and a meaningful-choice model using accuracy, lower quartile, severe-error
rate, and count after excluding only positions with exactly one legal move.

The best validation configuration for every family used a 10-move minimum and
400-3000 clipping. Validation MAE/median error were: constant 259.76/259.16,
accuracy-only 241.56/230.71, accuracy+severe 240.77/227.71, distribution
239.01/234.06, and meaningful-choice 238.43/226.54. The selected richer model
improved paired MAE by only 3.13 units (1.29%). That missed the frozen minimum
of 25 units and 3%, so the immutable lock is `validation-rejected`. No parameter
was revised afterward.

## One-time holdout result

On all 192 holdout player-games, meaningful-choice versus accuracy-only was:

| Metric                | Meaningful choice | Accuracy only |
| --------------------- | ----------------: | ------------: |
| MAE                   |            221.28 |        221.33 |
| Median absolute error |            201.89 |        202.47 |
| RMSE                  |            270.16 |        270.71 |
| Pearson               |             0.362 |         0.357 |
| Spearman              |             0.371 |         0.357 |
| Mean signed error     |             -5.63 |         -4.38 |
| Within ±100           |             25.5% |         26.0% |
| Within ±200           |             49.5% |         49.0% |
| Within ±400           |             87.5% |         86.5% |

The richer-model MAE improvement was **0.05 rating units (0.024%)**. The
deterministic 10,000-replicate game-cluster bootstrap 95% interval for
`richer MAE - accuracy MAE` was **[-2.48, 2.38]**. The training-mean constant
holdout MAE was 247.34. Both learned models beat the constant, but the richer
model was practically indistinguishable from accuracy-only.

## Holdout residual diagnostics

The richer model showed severe regression to the mean by rating band:

| Group     |   n |    MAE | Signed bias |
| --------- | --: | -----: | ----------: |
| 1000-1399 |  48 | 281.21 |     +281.21 |
| 1400-1699 |  48 | 135.25 |     +107.18 |
| 1700-1999 |  48 | 131.36 |      -73.59 |
| 2000-3000 |  48 | 337.30 |     -337.30 |

It beat accuracy-only MAE in only the lower band; it regressed in the other
three. By length, MAE was 242.66 short, 213.79 medium, and 211.33 long. White
and Black MAE were 220.43 and 222.12, with biases -21.66 and +10.41: no severe
color defect was visible. Win/loss/draw MAE was 220.25/227.87/157.37, though
the draw group had only eight holdout player-games.

Time-control MAE/bias was bullet 262.15/-168.61, blitz 226.96/-35.50, rapid
185.49/+144.11, and classical 192.79/+192.79. Classical contained only two
holdout player-games and is not interpretable. The bullet/rapid direction
change and large band biases fail the universal-scope stability criteria.

## Falsification

At related distribution profiles, meaningful-choice assigned 1798 to 19
perfect moves plus one catastrophe, 1437 to repeated moderate errors, 1754 to
consistent small errors, and 1837 to accurate play with several critical
positions. A profile containing only legal moves was unavailable. These
differences are explainable, but holdout data did not validate them as useful
rating information.

Adding 20 only-legal perfect moves to the repeated-moderate profile changed the
meaningful-choice estimate by 0, while accuracy-only rose about 243 units. This
passed the padding falsification. Identical-quality profiles of 3/5/10/20/40
moves produced raw richer predictions of 1600/1602/1606/1614/1630, but the
selected 10-move threshold makes the 3- and 5-move product result unavailable.
The count coefficient still introduces modest sample-size drift. The
one-catastrophe versus repeated-moderate behavior is defensible but does not
rescue the missing incremental holdout signal.

## Decision and limitations

Do **not** freeze `chessed-performance-v1`. Validation failed before holdout;
holdout then showed effectively zero incremental MAE improvement, a confidence
interval spanning harm and benefit, severe rating-band regression to the mean,
and unstable time-control bias. No production parameters, bounds, threshold,
types, or computation are adopted from the rejected lock. No UI was added.

The corpus is much larger than the probe but still one historical Lichess
month, uses source ratings rather than an independent demonstrated-level label,
has few draws and classical games, and inherits depth-12 browser-engine noise.
Actual rating is itself a noisy single-game target. Those limitations do not
justify shipping a disguised accuracy transformation.

Drop rating-like Estimated Performance from the roadmap. Revisit only with a
materially different, independently justified evidence source or target—not
another feature search on this holdout. Prefer the frozen accuracy score and
transparent move-distribution diagnostics without calling them Elo or
performance rating.
