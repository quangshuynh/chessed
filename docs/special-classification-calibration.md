# Special-classification calibration

This calibration interval attempts to falsify Chessed's Great, Brilliant, and
Miss policy. It does not treat a human annotation or another site's label as
ground truth. The repository corpus records a FEN, legal move, provenance, and
the chess property under examination; it deliberately contains no expected
special label.

## Corpus and harness

`calibration/special-position-corpus.ts` contains 14 positions. Two are
reconstructed from public historical game scores (the Opera Game queen offer
and a Légal-trap teaching line); the other 12 are purpose-built controls. They
cover queen and piece offers, a losing offer, immediate recovery,
pseudo-sacrifice, routine recapture and development, a forced move, promotion
and underpromotion, mate in one and retained mate, a quiet ending, multiple
reasonable moves, material gain, and an already-winning position.

`calibration/special-calibration.ts` converts normalized engine observations
into machine-readable rows. Each row retains evaluations, candidate order and
PVs, outcome loss, material projection, separation, terminal evidence, the
ordinary/special results, and deterministic acceptance or rejection reasons.
The optional real-browser command is:

```text
npm run build
npm run test:calibration
```

It runs the checked-in Stockfish 18 lite Web Worker, writes
`calibration/results/stockfish-18-lite.json`, and attaches the same JSON to the
Playwright result. This developer harness is separate from the product UI and
normal CI. The committed result is a reproducible observation, not a golden
label file.

## September 2026 findings

The depth-12/MultiPV-3 baseline produced three Great results (the Opera Game
queen offer and two immediate hanging-queen captures), one Miss (an
underpromotion that immediately draws instead of preserving a large material
win), no Brilliant results, and no special label for the remaining ten cases.

### Brilliant

The losing queen offer, promotion, pseudo-sacrifice, and immediately recovered
material controls did not become Brilliant. The Opera Game queen offer became
Great rather than Brilliant because both the before and best evaluations were
mate values; the Brilliant compensation gates intentionally require numeric
outcome expectation. The bounded PV showed the full nine-point queen exposure
as sustained. This is a conservative false-negative tradeoff, not evidence for
turning mate into fake centipawns or removing compensation gates.

The Légal line did not show a three-point sustained loss at depth 12: the PV's
minimum balance was only two points down and ended one point ahead. That is a
useful material-horizon warning—human sacrifice vocabulary and bounded-PV
material evidence are not equivalent—but not evidence for weakening the
three-point exposure rule.

### Great

The opening controls and quiet ending stayed below the 0.04 separation gate.
The Opera move was stable as Great at every tested depth and MultiPV count.
However, two constructed hanging-queen captures were also Great because the
alternatives lose decisive material. This repeatedly demonstrates that the
current definition measures objective contextual importance, not human
difficulty or surprise. Excluding all large root captures would also suppress
legitimate unique tactics, so the corpus does not yet support a safe semantic
change.

The Légal case exposes a real threshold/depth cliff: candidate separation was
approximately 0.035 at depth 10, 0.038 at depth 12, 0.047 at depth 14, and
0.059 at depth 16. Its label changes from none to Great above depth 12. The
0.04 gate is coherent for the stable controls, but depth-12 evidence near the
boundary is not stable enough to support strong claims. A future policy may
need an uncertainty band or deeper confirmation near the boundary; one case is
not enough to choose that band.

### Miss

The underpromotion-to-knight control immediately produced insufficient
material and was correctly recognized as a missed material win. A deliberately
unplayed mate-in-one retained another mate-in-one, so it was correctly not a
Miss. The losing queen offer was an ordinary Blunder but had no concrete missed
mate, five-point best-line gain, or qualifying forcing resource, so it was not
renamed Miss. These cases support Miss as opportunity evidence rather than a
generic inferior-move label.

The small corpus does not yet cover a credible deep defensive resource. That is
the largest Miss false-negative gap remaining.

## Depth, MultiPV, and threshold sensitivity

Four cases were compared at depths 10, 12, 14, and 16. The Opera move and label
were stable. The Légal move stayed rank one but crossed the Great threshold.
The mate control changed ordering among equivalent mates without changing its
label. The quiet ending changed rank-one moves repeatedly while all candidates
remained essentially equal and no special label appeared.

Three cases were compared at MultiPV 2, 3, 4, and 5. Labels were stable. The
quiet ending's ordering changed and the initial position's separation varied
from roughly 0.010 to 0.013, safely below the Great boundary. No evidence in
this bounded sample supports increasing production MultiPV beyond three.

Synthetic boundary tests retain exact below/at/above behavior for the policy
constants. Real-engine evidence shows that the larger risk is search variance
around 0.04, not numerical comparison correctness. The thresholds also remain
conceptually separate: 0.025 gates Brilliant/material Miss evidence, 0.04
gates Great, and 0.075 jointly gates narrow forcing Miss evidence.

## Decision and limitations

No classification constant or semantic rule changed. The methodology remains
`chessed-review-v2`. The evidence supports keeping the conservative Brilliant
and concrete-opportunity Miss controls. It supports Great's objective
separation concept, but falsifies any stronger interpretation that every Great
move is difficult or surprising and shows that depth-12 boundary cases can be
unstable.

The corpus is intentionally small, contains only two historical positions,
and does not model human difficulty. Stockfish results can vary with build and
browser. Bounded PVs are horizon-limited, MultiPV does not prove uniqueness,
and a three-candidate view cannot describe every legal alternative. The next
calibration interval should add several independently sourced defensive
resources and routine unique captures, then test a documented uncertainty band
or deeper confirmation rule without changing production depth globally.
