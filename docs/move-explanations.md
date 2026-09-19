# Deterministic move explanations

Game Review renders a short, human-readable explanation of why the selected move
received its review outcome. The explanation layer is a presentation of evidence
Chessed already computed. It adds no Stockfish pass, no extra depth, no extra
MultiPV, no additional worker, and no network request.

## Philosophy

> Explain the evidence Chessed already has; do not invent chess understanding.

An explanation is **not** a classifier, an accuracy methodology, a coach, a
tactical engine, a strategic evaluator, an opening database, or a performance
estimate. It is a rendering of authoritative review evidence, and nothing it
says may exceed what that evidence establishes.

The layer is deterministic: no randomness, no synonym rotation, no temperature,
no language model, and no network call. Identical evidence always produces
identical text, which is what makes the wording testable, screenshotable, and
auditable.

`chessed-review-v3` and `chessed-accuracy-v1` are unchanged. The explanation
layer consumes their results; it never reinterprets them.

## Architecture

The derivation is pure and lives in `src/lib/review/move-explanation.ts`,
independent of React:

```text
ReviewMove
   -> deriveExplanationEvidence   (facts only, nothing invented)
   -> selectPrimaryExplanation    (one reason, deterministic priority)
   -> formatExplanation           (Chessed's own wording)
   -> MoveExplanation
```

```ts
type MoveExplanation = {
  reason: ExplanationReason;
  summary: string;
  details?: string[];
  evidence: ExplanationEvidence[];
};
```

`evidence` is the structured audit trail for the rendered text: classification,
evaluation, centipawn loss, outcome drop, mate transition and distance, terminal
outcome, played-move material, best-line material, candidate separation, and the
bounded principal variation. Each entry is a fact the review already retained.

The React layer only renders the result. `explainReviewMoves` runs once per
completed review, memoized alongside the evaluation graph, so navigation and
board flips never recompute anything.

## Evidence sources

Per move, the layer reads only:

| Source                                             | Availability                      |
| -------------------------------------------------- | --------------------------------- |
| `classification` (ordinary + evidence)             | always, may be `unavailable`      |
| `specialClassification` (+ its evidence)           | only Great / Brilliant / Miss     |
| `evaluationBefore` / `evaluationAfter`             | requires analyzed positions       |
| `playerEvaluationBefore` / `playerOutcomeAfter`    | requires analyzed positions       |
| `centipawnLoss`                                    | centipawn-to-centipawn moves      |
| `mateTransition`                                   | mate is involved on either side   |
| `terminalOutcome`                                  | the game ended at this position   |
| `bestMoveUci`, `principalVariationUci`             | requires before-position analysis |
| `analysisAfter.principalVariationUci`              | requires after-position analysis  |
| legal board state (`fenBefore`, `fenAfter`, `uci`) | always                            |

Nothing else is consulted, and no field was added to the review contract for
this feature.

### Legal-board-state derivation

`derivePlayedMoveMaterial` replays the played move with chess.js to observe
capture identity, en passant, promotion, and the immediate material swing. It
then projects the **already-retained** line after the move to obtain the
mover-relative net swing over that continuation. This is board arithmetic over
evidence that already exists; it is not a search and it never calls the engine.

## Reason taxonomy

| Reason                         | Required evidence                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `terminal-checkmate-delivered` | recorded terminal win by checkmate                                                                      |
| `terminal-loss`                | recorded terminal loss                                                                                  |
| `terminal-draw`                | recorded terminal draw (stalemate, repetition, insufficient material, fifty-move, draw)                 |
| `allowed-mate`                 | `newly-allows-forced-mate` or `reverses-to-unfavorable-mate`                                            |
| `missed-mate`                  | Miss rule `missed-forced-mate`, or `throws-away-forced-mate`                                            |
| `found-mate`                   | `creates-forced-mate`                                                                                   |
| `escaped-mate`                 | `escapes-forced-mate` or `reverses-to-favorable-mate`                                                   |
| `retained-mate`                | `retains-favorable-mate`                                                                                |
| `retained-mate-against`        | `retains-unfavorable-mate`                                                                              |
| `brilliant-sacrifice`          | Brilliant, rule `exceptional-sacrifice`                                                                 |
| `critical-best-move`           | Great, rule `narrow-critical-move`                                                                      |
| `missed-material-win`          | Miss, rule `missed-material-win`                                                                        |
| `missed-forcing-resource`      | Miss, rule `missed-forcing-resource`                                                                    |
| `lost-material`                | projected net swing at most −3 points **and** an error classification **and** no special classification |
| `large-eval-drop`              | Blunder                                                                                                 |
| `moderate-eval-drop`           | Mistake                                                                                                 |
| `slight-eval-drop`             | Inaccuracy                                                                                              |
| `preserved-winning-position`   | Best, with the mover winning before and after                                                           |
| `best-move`                    | Best by exact engine-best identity                                                                      |
| `near-best-move`               | Best by the `equivalent-best` rule                                                                      |
| `sound-move`                   | Good                                                                                                    |
| `unavailable`                  | no classified evidence                                                                                  |

## Priority order

A move can satisfy several reasons. Exactly one primary reason is chosen, by the
first match in `EXPLANATION_REASON_PRIORITY`, which is the table order above.
The shape of that order is:

```text
terminal result
  > mate event
  > special classification (Brilliant / Great / Miss)
  > concrete material loss
  > objective evaluation movement
  > ordinary best / near-best / sound behavior
  > unavailable
```

Terminal outcomes outrank mate events because a terminal position and a mate
transition are mutually exclusive in the review contract, and a game that has
actually ended is the more concrete fact. Within the mate group, error reasons
precede non-error reasons so the explanation justifies the classification rather
than restating it.

At most **two** details are rendered, so one move stays readable.

## Behavior by category

### Mate

Wording follows the existing before/after mate semantics exactly: creates,
keeps, misses, allows, escapes, or still stands against. Mate distance is
preserved as `M3` / `-M2` where useful. The layer never claims a player "saw",
"calculated", or "found a combination"; it reports the transition the evidence
records.

### Material

Only the retained continuation can support a material claim, and a claim also
requires the objective assessment to agree the move was an error. A sacrifice
the engine still endorses is therefore never described as losing material.

A specific piece is named only when the opponent's first retained reply captures
a piece whose value equals the whole net swing. Otherwise the swing is stated in
points. Capture identity, promotion, and en passant come from the legal move and
are always safe to state.

### Best and near-best

Exact engine-best agreement is reported plainly. A move that differs from the
top choice by negligible objective value is called "nearly equivalent", never
meaningfully inferior. Chessed does not treat exact best-move agreement as
impressive on its own.

### Critical positions

Great is explained as candidate separation among the **analyzed candidates**,
stated as such. The layer never says "only move" unless the analyzed candidate
set or legal-move evidence supports it, and it never equates separation with
human difficulty.

### Evaluation swings

Generic deterioration is explained with mover-relative evidence, preferring a
display-only state transition and falling back to the centipawn loss in pawns.
The display bands are documented and tested:

| Mover-relative magnitude | Band             |
| ------------------------ | ---------------- |
| below 50 cp              | roughly equal    |
| 50 to 149 cp             | slight advantage |
| 150 to 399 cp            | clear advantage  |
| 400 cp and above         | winning / losing |

These bands exist only for wording. They are not a new evaluation taxonomy, they
never touch canonical evaluation, and they never feed classification or accuracy.

### Terminal

Checkmate, stalemate, repetition, insufficient material, the fifty-move rule,
and the generic draw each have their own sentence. No post-terminal analysis is
invented.

### Principal variation

The bounded retained line is quoted only for `missed-mate` and
`missed-forcing-resource`, where the concrete missed sequence _is_ the
explanation. It is capped at 4 plies, uses canonical SAN, and is omitted
entirely when SAN conversion fails. When the line is shown it replaces the
redundant "Best was …" detail, because the line already opens with that move.
No new engine work is performed to produce it.

### Notation

Played moves, engine-best moves, and continuation moves are shown in SAN,
generated by chess.js from the actual position. Custom FEN starts and
Black-to-move numbering stay correct. If SAN conversion fails the explanation
degrades safely: it omits the notation rather than printing raw UCI or
fabricating a move.

### Missing evidence

When the classification is unavailable the explanation is a single restrained
sentence: _"Detailed engine explanation unavailable for this move."_ Partial
evidence never becomes a strong conclusion, and an unknown evaluation is never
described as equal.

## Accuracy is not an explanation

Move explanations never restate Chessed Accuracy, a percentage, a rating, or a
game-level aggregate. Accuracy remains visible in the player identity rows and
is documented separately in [the accuracy methodology](accuracy-scoring.md).

## Classification relationship

The classification label stays where it is. The explanation sits beneath it and
justifies it from evidence:

```text
Miss
This move misses a forced mate.
The missed mate was M2.
Best line: 1. d4 e5 2. dxe5
```

Tautologies such as "this is a blunder because it was classified as a blunder"
are not produced.

## Unsupported concepts, intentionally omitted

Chessed has no objective evidence for these, so the layer never claims them:

- human difficulty: "hard to find", "deep", "GM-level", "difficult tactic";
- praise: "brilliant", "amazing", "creative", "spectacular";
- positional language: weak squares, king safety, central control, tempo,
  development, initiative, long-term pressure, positional ideas;
- opening names and opening theory;
- threat creation for the played move, which the retained evidence cannot
  establish;
- any rating-like or Estimated Performance claim.

Negative tests in `src/lib/review/move-explanation.test.ts` assert that this
vocabulary never appears.

## UI placement and navigation

The explanation is rendered inside the existing Game Review analysis card, after
the evaluation and best-move details and before the raw principal variation, as
a labeled region:

```text
classification
evaluation / best move
deterministic explanation
principal variation
```

It follows the canonical selected ply. Graph selection, move-list selection,
Previous/Next, and keyboard arrows all update it through the same navigation
path. Position 0 has no move, so it shows an explicit starting-position state
instead of an explanation.

Flipping the board changes nothing: the explanation is a pure function of the
review move, so evidence, SAN, evaluation semantics, and reason are identical
before and after a flip, with no recalculation.

Explanations exist only for a completed review. They are absent before analysis,
while analysis runs, and after cancellation or failure, and a game switch clears
them with the rest of the review state. No partial explanation is ever retained.

Manual PGN works without a Chess.com username, ratings, or profiles: the layer
depends only on the analyzed chess evidence.

## Accessibility

The explanation is a region labeled "Move explanation" inside the Analysis
section. Move notation is text, no meaning depends on color or icons, and there
is deliberately **no** `aria-live` region: arrow-key navigation would otherwise
announce every move. The content is static and semantically tied to the selected
move, reached in ordinary reading order.

## Zero additional engine work

This is a hard requirement of the feature. If a desirable explanation cannot be
supported by retained evidence, the layer uses a weaker truthful explanation or
omits it. It never expands engine cost to improve prose.
