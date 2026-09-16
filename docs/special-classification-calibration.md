# Special-classification calibration

This interval falsifies Chessed's Great policy with objective engine, legal
board, and material evidence. Human or commercial labels are not goldens.

## Corpus and harness

The corpus now contains 21 positions: two public historical game/teaching
positions and 19 constructed controls. Seven additions cover hanging queen,
rook, and minor-piece captures, multiple material choices, a checking capture,
a defensive capture, and a quiet defensive move. Every case records FEN, legal
move, provenance, and properties but no expected special label.

`npm run test:calibration` runs Stockfish 18 lite in Chromium and writes 60 raw
rows to `calibration/results/stockfish-18-lite.json`. The expanded study uses
depths 10, 12, 14, and 16 for ten positions and retains rank, ordering, scores,
PVs, material projection, ordinary/special output, and rejection reasons.

## Findings

The original routine queen capture and recovery became Great because they were
rank 1, ordinarily Best, and far above rank 2. Great did not consult forcing or
material-gain evidence. New undefended queen, rook, and minor-piece controls
reproduced the issue. The accepted guard identifies an immediate capture of at
least three points whose bounded PV retains at least three net points and whose
result is at least 0.60 expectation or favorable mate. It does not use a human
difficulty guess. Narrow-result defensive captures remain eligible.

The real separations nearest the requested probes were 0.019, 0.034, 0.036,
0.038, and 0.047. The corpus did not naturally produce a 0.06 case; synthetic
tests cover the exact 0.03/0.04/0.05 edges without tuning a board position to a
desired engine number. This is a limitation, not statistical evidence.

The Légal line measured 0.036/0.038/0.047/0.034 at depths 10/12/14/16. Thus
depth 12 disagreed with depth 14 once around the boundary and agreed with depth
16; rank 1 remained stable. Across the ten four-depth probes, several unrelated
endgame/material controls changed candidate order, reinforcing that shallow
rank and mate discovery can vary. Raw counts are reported rather than a
confidence claim.

## Decision

Great now requires authoritative depth-16/MultiPV-3 confirmation when the
normal separation lies in the inclusive 0.03-0.05 uncertainty band. Depth-12
evidence is retained. A changed ordering is honored. Failed confirmation yields
ordinary Best with unavailable confirmation; cancellation aborts the review.
No global depth increase or parallel worker was added.

Great now means a uniquely important rank-1 ordinary Best whose alternatives
materially worsen the objective result, excluding routine immediate stable
material pickups unless the move preserves a narrow result. Brilliant and Miss
rules and precedence are unchanged. This semantic change increments the
methodology from `chessed-review-v2` to `chessed-review-v3`.

## Performance and limitations

No-confirmation 5/17/31-position fixtures measured 1.55/3.65/5.22 seconds;
interaction was 69-78 ms and cancellation 76 ms. These are one-machine browser
observations. One confirmation adds one serial deeper search; several add one
each. The 21-position corpus remains small, defensive examples are mostly
constructed, bounded PV material can miss tactics, and Stockfish/browser builds
can vary. A future interval should add independently sourced defensive studies
and longer real-device confirmation workloads without weakening conservative
failure semantics.
