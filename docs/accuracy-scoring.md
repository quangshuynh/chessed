# Chessed Accuracy methodology

Methodology identifier: `chessed-accuracy-v1`.

## Definition and scope

Chessed Accuracy measures how consistently a player's moves preserved the
objective quality of that player's position relative to strong engine
alternatives. It is an engine-based preservation score on a 0–100 scale.

It is not a literal win probability, Elo or performance rating, a percentage
of best moves, a classification average, evidence of engine use, or Chess.com
Accuracy. Chessed neither reproduces nor claims equivalence with a proprietary
algorithm.

## Evidence

Accuracy is derived after the `chessed-review-v3` review has normalized every
engine score to White-relative form and then converted it once to the mover's
perspective. It consumes only:

- the mover-relative evaluation before and objective outcome after a move;
- first-class favorable/unfavorable mate state;
- terminal win, loss, or draw; and
- explicit evidence availability.

It does not consume classification labels, Great/Brilliant/Miss, best-move
identity, board orientation, UI state, or player identity. No extra Stockfish
pass is required.

## Formula

For a finite centipawn score `c`, reuse Chessed's documented symmetric outcome
expectation proxy:

```text
E(c) = 1 / (1 + exp(-c / 410))
d = max(0, E(before) - E(after))
A_move = (1 - d)^4
```

`d` and `A_move` are in `[0, 1]`. Apparent finite-depth improvement has `d = 0`
and therefore scores 1, never more than 1. Calculations retain full floating
point precision; a UI may later display one decimal place.

The fourth power is a parameter-light nonlinear loss curve. It has exact,
interpretable endpoints, needs no fitted offset or clipping, and makes material
outcome damage visible while the expectation transform already compresses
noise in lopsided positions. The exponent is methodology policy, not an
empirical claim about human win probability.

| Outcome drop | Linear | Selected `(1-d)^4` | `exp(-4d)` |
| -----------: | -----: | -----------------: | ---------: |
|            0 |  100.0 |              100.0 |      100.0 |
|        0.005 |   99.5 |               98.0 |       98.0 |
|        0.010 |   99.0 |               96.1 |       96.1 |
|        0.025 |   97.5 |               90.4 |       90.5 |
|        0.050 |   95.0 |               81.5 |       81.9 |
|        0.075 |   92.5 |               73.2 |       74.1 |
|        0.100 |   90.0 |               65.6 |       67.0 |
|        0.150 |   85.0 |               52.2 |       54.9 |
|        0.200 |   80.0 |               41.0 |       44.9 |
|        0.300 |   70.0 |               24.0 |       30.1 |
|        0.500 |   50.0 |                6.3 |       13.5 |
|        1.000 |    0.0 |                0.0 |        1.8 |

Linear preservation was rejected because even a 0.15 outcome drop retained an
85 score. Exponential decay behaved similarly through the ordinary range, but
could not represent complete destruction as exactly zero without an arbitrary
offset and clamp. Logistic-like curves add location and steepness constants
without better semantics. Direct classification-to-percentage maps were
rejected because they are discontinuous and erase within-label severity.

## Mate and terminal semantics

Mate remains first-class; it is never converted to centipawns. For the sole
purpose of objective-result preservation, favorable forced mate has expectation
1 and unfavorable forced mate has expectation 0. A terminal win, draw, and loss
have expectation 1, 0.5, and 0 respectively.

Consequently, creating or retaining favorable mate, escaping unfavorable mate,
delivering checkmate, and reaching a draw from a losing/mated state receive no
penalty. Throwing away favorable mate is scored continuously against the actual
post-move centipawn or draw state. Newly allowing mate and reversing favorable
mate to unfavorable mate are severe. Retaining the same mate direction is fully
accurate regardless of reported distance: shallow engine mate distance is not
stable enough to support a calibrated continuous penalty. Being checkmated
while already under a forced mate also preserves the prior objective result and
is not retrospectively blamed; the earlier move that allowed mate bears the
drop.

Draw reasons—including stalemate, insufficient material, repetition, the
fifty-move rule, and generic chess.js draws—share the objective value 0.5. Thus
a draw from equality or a losing position is unpenalized, while a winning-to-
draw transition loses accuracy. No post-terminal engine score is fabricated.

## Aggregation and coverage

Each player's score is the uniform arithmetic mean of only that player's
scoreable move accuracies, multiplied by 100. White and Black are independent.
Uniform weighting is transparent and does not make an uncertain-position model
silently decide which moves count. Volatility weighting was rejected because
it introduces window and position-importance policy; harmonic/geometric means
were rejected because a single near-zero move can dominate the entire game.

Missing evidence is neither zero nor perfect. It increments
`unavailableMoveCount` and is excluded from the partial mean. If a player has no
scoreable moves, `value` is `null`. `scoredMoveCount` communicates sample size;
there is no invented confidence statistic or minimum-game threshold. A
one-move score is mathematically valid but much less representative than a
40-move score.

## Calibration and falsification

Deterministic fixtures cover the curve, apparent improvement, equal/winning/
losing positions, all mate directions, checkmate, stalemate, partial evidence,
short games, per-player aggregation, perspective symmetry, custom-FEN review
integration, and values immediately across classification boundaries. Labels
and special classifications cannot alter the calculation.

One catastrophic move among 19 perfect moves scores 95 under uniform averaging;
20 moves each losing 0.075 outcome expectation score about 73.2. This is a
deliberate statement of consistency: the game score is a mean across decisions,
while per-move evidence still exposes the catastrophe. Perfect-move padding and
many trivial moves in decided endings remain known limitations. Position-
sensitive weighting was not adopted without evidence that its extra policy
improves those cases consistently.

The opt-in real-engine calibration (`npm run test:accuracy-calibration`) uses
the shipped Stockfish 18 lite at depth 12 and writes its reproducible report to
`calibration/results/accuracy-stockfish-18-lite.json`. The frozen run observed:

| Public game                 | White | Black | Scored moves | Notable evidence                |
| --------------------------- | ----: | ----: | -----------: | ------------------------------- |
| Fischer–Spassky 1972 game 6 |  96.9 |  94.3 |      41 / 40 | one 0.077 outcome drop          |
| Morphy Opera Game           |  94.1 |  85.8 |      17 / 16 | tactical swings and forced mate |
| Fool's Mate                 |  43.7 | 100.0 |        2 / 2 | explicit newly allowed mate     |

These are behavioral observations, not accuracy ground truth. The two-move
Fool's Mate score also illustrates why the count must accompany a short-game
percentage. The Opera Game exposed a depth-12 horizon fluctuation on a tactical
sacrifice; this is input-engine uncertainty, and the methodology preserves it
rather than overriding a continuous observation with a historical reputation.

Large equal-position swings are penalized more than equal centipawn swings in
already won or lost positions. Moves in lost positions are not automatically
perfect: any remaining expectation drop still reduces accuracy. Small opening
fluctuations are naturally compressed; no move-number exception exists.

## Public methodology reviewed

- [Stockfish's public WDL model](https://github.com/official-stockfish/WDL_model)
  models win/draw/loss rates from engine evaluation and notes material-dependent
  calibration. It supports transformed outcome semantics, but Chessed retains
  its already frozen, simpler symmetric expectation proxy rather than claiming
  Stockfish WDL probabilities.
- [Lichess's documented Accuracy metric](https://lichess.org/page/accuracy)
  transforms centipawns to winning chances, exponentially maps per-move loss,
  and combines volatility-weighted and harmonic means. It demonstrates why raw
  centipawn loss is position-dependent. Chessed deliberately uses its own
  expectation scale, endpoint-exact power curve, and uniform arithmetic mean.
- [Stockfish evaluation documentation](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html#interpretation-of-the-stockfish-evaluation)
  explains that displayed evaluations are engine-model values and not universal
  human probabilities. Chessed therefore calls `E` an expectation proxy and
  documents engine/depth dependence.

## Provenance and limitations

The domain result records `chessed-accuracy-v1`, scale 410, the fourth-power
transform, aggregation choice, scoreable count, and unavailable count. Browser
Stockfish depth, horizon effects, mate discovery, and evaluation instability
affect the inputs. The formula does not model move difficulty, time pressure,
rating, opening theory, or human findability. Accuracy is cheap pure arithmetic
compared with engine analysis and adds no worker, cache, storage, or network
work.
