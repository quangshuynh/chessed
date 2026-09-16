# Special-classification calibration

This interval falsifies Chessed's Great policy with objective engine, legal
board, and material evidence. Human or commercial labels are not goldens.

## Corpus and harness

The corpus contains 29 positions. Eight defensive cases come from published
game scores or studies: Réti 1921, Yates–Marshall 1929, Lasker–Tarrasch 1914,
Hamppe–Meitner 1872, Leko–Kramnik 2008, Fischer–Tal 1960, Matulović–Minev
1956, and Rhine 2006. Every case records provenance, FEN, move, objective
property, and falsification value, but no expected Chessed label. Chess.js legal
reconstruction verifies every move independently of source prose.

`npm run test:calibration` runs Stockfish 18 lite in Chromium and writes 104 raw
rows to `calibration/results/stockfish-18-lite.json`. Defensive probes compare
depths 10/12/14/16/18 and selected MultiPV 2/3/4/5. Rows retain rank, ordering,
scores, PVs, mate/material evidence, ordinary/special output, routine-capture
state, confirmation trigger/result, and reason identifiers.

## Earlier confidence findings

Routine queen, rook, and minor-piece pickups previously reproduced false Great
results. The v3 guard identifies an immediate capture of at least three points
whose bounded PV retains at least three net points and whose result is at least
0.60 expectation or favorable mate. Narrow-result defensive captures remain
eligible. Synthetic tests cover exact 0.03/0.04/0.05 confirmation boundaries.

The Légal line remains the real boundary probe: separation measured
0.036/0.038/0.047/0.034 at depths 10/12/14/16. It keeps rank one but crosses the
Great threshold at shallow depths, validating bounded confirmation.

## Defensive findings

Six sourced resources were ordinary Best and Great at every measured depth:
Réti's quiet drawing king move, Yates–Marshall's quiet drawing defense,
Lasker–Tarrasch's pawn intermezzo, and the Hamppe–Meitner, Leko–Kramnik, and
Fischer–Tal perpetual checks. The played move stayed rank one. Alternative
ordering sometimes changed, but not the objective result or Great eligibility.

Rhine's complex stalemate study remained ordinary Best because its bounded PV
did not establish sufficient compensation. Matulović–Minev's sole drawing rook
capture remained ordinary Best because the routine-capture guard fired at every
depth and MultiPV. That is a known false-negative candidate: material projection
does not understand the later stalemate mechanism. It is one sourced case, not
the recurring defect required for policy change. Weakening the guard now would
reintroduce demonstrated routine-pickup false positives.

No defensive recapture was inflated, forced-only legality remained excluded,
and no partial Great appeared. MultiPV 2/3/4/5 produced the same selected
defensive classifications. Depth 18 changed some alternative ordering but did
not reveal a repeated depth-16 defect. The inclusive 0.03–0.05 band, depth 16,
MultiPV 3, guard, and all classification semantics therefore remain unchanged.

## Lifecycle and performance

The opt-in browser soak uses an 83-position Fischer–Spassky game and a confirmed
custom-FEN fixture. Under a 390x844 viewport and 4x CPU throttle, the confirmed
fixture took 1.49 s, cancellation 51 ms, and the longer run 10.55 s. The long
run performed 54 enrichments and one confirmation. See
`browser-confirmation-soak.md` for repeated-run, worker, heap, mobile-like, and
physical-device details.

## Freeze decision

`chessed-review-v3` is stable enough to freeze as the move-classification
foundation for the first accuracy-scoring interval: there is no known recurring
correctness defect requiring redesign, semantics and provenance are documented,
defensive resources were reasonably falsified, and confirmation lifecycle
behavior was operationally validated. Freeze does not mean immutable. The
Matulović–Minev false-negative candidate, bounded-PV limitations, small corpus,
browser variability, and missing physical-device run remain documented.
