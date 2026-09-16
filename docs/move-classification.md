# Ordinary move-classification methodology

Chessed defines five ordinary move classifications: **Best**, **Good**,
**Inaccuracy**, **Mistake**, and **Blunder**. This is Chessed's deterministic
methodology. It is not Chess.com's Game Review algorithm and does not claim to
reproduce it.

The pure review-domain pipeline is:

`normalized analysis -> move-quality observation -> ordinary classification`

It uses only mover-relative before and after evaluations, raw centipawn loss,
exact best-move matching, semantic mate transitions, and terminal outcomes. It
does not infer tactical difficulty, uniqueness, sacrifice quality, human
findability, or missed tactical opportunities.

## Why transformed outcome expectation

Raw centipawn loss is retained as evidence but is not the primary ordinary
threshold signal. A 100 cp swing around equality generally changes practical
outlook more than a 100 cp swing in a position that remains overwhelmingly won
or lost.

Chessed maps a mover-relative centipawn value `cp` to a bounded
outcome-expectation proxy:

```text
expectation(cp) = 1 / (1 + exp(-cp / 410))
outcome drop = max(0, expectation(before) - expectation(after))
```

The scale constant is named `OUTCOME_EXPECTATION_SCALE_CENTIPAWNS`. The mapping
is monotonic, symmetric (`E(cp) + E(-cp) = 1`), bounded from zero to one, and
safe for finite extreme evaluations. It is an engine-evaluation proxy, not a
literal probability that a particular human will win.

This design is informed by:

- [Stockfish's WDL model](https://github.com/official-stockfish/WDL_model), which
  fits logistic evaluation-to-result models and explains that accurate WDL
  estimates also depend on position material.
- [Stockfish NNUE training documentation](https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md),
  which describes a sigmoid CP-to-WDL-space mapping and gives 410 as an example
  scale while warning that the scale depends on engine and data.
- [Lichess's public accuracy methodology](https://lichess.org/page/accuracy),
  which explains why equal raw centipawn losses have different significance in
  equal and lopsided positions and uses a separately fitted logistic mapping.

Chessed deliberately uses its own simple, fixed transform and thresholds. It
does not copy another site's classification or accuracy formula. Stockfish's
material-aware WDL output could be a future input, but the current normalized
analysis contract does not expose it and classification should remain stable
across engine adapters.

## Numeric policy

All constants live in `ORDINARY_CLASSIFICATION_THRESHOLDS`.

| Result     | Rule                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Best       | exact legal engine-best match, or a non-best move with nonnegative raw loss no greater than 15 cp and outcome drop no greater than 0.01 |
| Good       | outcome drop less than 0.025                                                                                                            |
| Inaccuracy | outcome drop at least 0.025 and less than 0.075                                                                                         |
| Mistake    | outcome drop at least 0.075 and less than 0.15                                                                                          |
| Blunder    | outcome drop at least 0.15                                                                                                              |

The three ordinary error boundaries represent losses of 2.5, 7.5, and 15
percentage points on this proxy scale. Around equality, they correspond to
approximately 41, 124, and 254 cp of deterioration, respectively; away from
equality, the centipawn amount needed to cross a boundary grows. These are
explicit Chessed policy choices, not empirically calibrated claims about human
play. They create separated sensitivity bands while reserving Blunder for a
large change in expected outcome.

Exact boundaries enter the more severe category. Apparent improvement from
independent searches is clamped to zero outcome drop, as centipawn loss already
does. It is Good unless the move independently qualifies as an exact or
equivalent Best; a large apparent improvement alone is not enough to award Best.

### Best

An exact `playedBestMove === true` is Best for ordinary centipawn observations,
even if independent analysis after the move disagrees slightly. This preserves
the strongest direct evidence without requiring two searches to return identical
numbers.

Exact PV identity is not the only route to Best. A non-best move is Best when
the measured loss is from 0 through 15 cp and the transformed outcome drop is at
most 0.01. The dual guard prevents a broad saturated expectation curve from
making materially different winning-position moves Best. Zero-loss alternatives
qualify because the available analysis cannot objectively distinguish them;
larger apparent improvements do not, because they indicate search disagreement.

## Mate policy

Mate scores are never converted to centipawns or passed through the sigmoid.

| Transition                                           | Classification |
| ---------------------------------------------------- | -------------- |
| creates forced mate                                  | Best           |
| escapes forced mate                                  | Best           |
| reverses to favorable mate                           | Best           |
| newly allows forced mate                             | Blunder        |
| throws away forced mate                              | Blunder        |
| reverses to unfavorable mate                         | Blunder        |
| retains favorable mate at an equal/shorter distance  | Best           |
| retains unfavorable mate at an equal/longer distance | Best           |
| retains favorable mate at a longer distance          | Good           |
| retains unfavorable mate at a shorter distance       | Good           |

An exact best-move match also makes a retained-mate move Best. Retained mate with
a worse distance is only Good: mate distances can shift at limited depth, and
the evidence does not justify calling a still-forced result an ordinary error.

## Terminal policy

No post-terminal engine evaluation is fabricated.

- Delivering checkmate (a terminal win) is Best.
- Being checkmated (a terminal loss) is Blunder.
- A draw replaces the post-move expectation with the objective draw value 0.5.
  A centipawn pre-evaluation is classified by the ordinary outcome-drop
  thresholds, unless the played move exactly matched the engine best move.
- Drawing while holding favorable mate is Blunder; drawing while facing
  unfavorable mate is Best.

These draw rules apply uniformly to stalemate, insufficient material, threefold
repetition, the fifty-move rule, and the generic represented draw. The terminal
reason is retained in classification evidence. The terminal result alone does
not decide whether a draw was good or bad; the pre-move evaluation does.

## Unavailable evidence

Classification returns an explicit unavailable result for missing before or
after analysis. It also returns `inconsistent-observation` when the discriminated
loss type, before/after values, best-move identity, terminal result, or recomputed
centipawn loss disagree. It never silently maps incomplete or malformed evidence
to Good.

## Limitations

- The transform is intentionally fixed and is not calibrated to player rating,
  time control, game phase, material, or human game results.
- Results inherit engine, depth, and independent-search uncertainty.
- Mate distance at shallow depth is unstable, so retained-mate rules are
  conservative.
- The policy does not measure how difficult a move was to find.
- Great, Brilliant, Miss, accuracy, Elo/performance estimates, and coaching are
  outside this policy.

## Falsification focus

Tests deliberately compare equal raw losses in equal and lopsided positions,
non-PV moves with equivalent outcomes, exact best matches with small search
disagreement, mediocre moves in hopeless positions, forced-mate abandonment,
newly allowed mate, and stalemate from a forced win. Boundary tests exercise
immediately below, exactly at, and immediately above every ordinary threshold.
These cases prevent a raw-CP-only policy, PV-identity-only Best policy, silent
missing-data fallback, or fake mate arithmetic from passing unnoticed.
