# Game evaluation graph

The Game Review evaluation graph visualizes how the objective evaluation of the
position changed over a completed review. It is a presentation feature: it adds
no Stockfish pass, no engine worker, no network request, and no change to
evaluation, classification, or accuracy methodology.

It is **not** win probability, an advantage percentage, a rating, or an
Estimated Performance metric.

## Evidence

The graph is derived entirely from evidence a completed `WholeGameReview`
already retains:

- `startingPosition` — the analyzed or terminal evidence for position 0, which
  belongs to no move;
- `moves[n - 1].evaluationAfter` — the canonical evaluation of position `n`;
- `moves[n - 1].terminalOutcome` — the recorded outcome when the game ended at
  position `n`.

`startingPosition` is the only contract addition this feature required. Every
other position is already retained by the move that reached it, so the starting
position was the single piece of already-computed evidence with no home. It is
a pure composition of the positions the review was built from and triggers no
extra engine work.

The derivation itself lives in `src/lib/review/evaluation-graph.ts` as pure
functions, independent of React:

```text
WholeGameReview -> buildEvaluationGraph -> EvaluationGraphPoint[] -> display transform
```

## Horizontal axis: canonical position index

The x-axis is Game Review's canonical position index, the same value the board,
the move list, and Previous/Next already use:

```text
position 0 = starting position
position 1 = after ply 1
position 2 = after ply 2
```

Position `n` is reached by ply `n`, so the graph and the board never disagree
and there is no off-by-one. Position 0 has no ply, no move number, and no SAN;
it is labelled "Starting position" rather than given an invented move.

Custom starting positions follow the same rule. A game beginning from a
Black-to-move FEN still has its first played move at ply 1 and position 1, and
labels use the FEN's own fullmove number, so a custom position can legitimately
begin at `12... Nc6`.

## Vertical axis: White-relative evaluation

The graph plots canonical engine evaluations, which are White-relative:

- positive favors White;
- negative favors Black;
- zero is approximately equal.

The graph is never drawn from the reviewed player's perspective. Flipping the
board changes the board and the two identity rows only; it does not invert,
reorder, or recompute a single graph point. White's share of the plot is the
region below the evaluation line, so an even game reads as an even split.

## Display transform and bounds

Centipawn evaluations are unbounded, so the graph applies a separate, pure
display transform. The canonical evaluation on every point is left untouched.

```text
centipawns -> clamp(value, -1000, +1000) / 100   (pawn units)
```

The bound is ±1000 centipawns (±10.00 pawns). It is chosen to match the frozen
review methodology rather than picked arbitrarily: the outcome-expectation
proxy `1 / (1 + exp(-cp / 410))` already reads 0.92 at 1000 cp and barely moves
afterwards, so beyond that bound extra magnitude carries no readable
information, while ordinary evaluations under three pawns still occupy a useful
share of the axis.

The transform preserves sign, keeps zero at exactly zero, is monotonic up to the
bound, and is symmetric about zero. Non-finite or malformed values are not
plotted.

## Mate

Mate remains first-class in domain data and is never converted into a fake
centipawn value. For plotting only, a favorable mate is drawn at the top
boundary and an unfavorable mate at the bottom boundary.

Detail text always reports the real semantic value, so a position evaluated at
`M3` reads `M3` and never `+10.00`:

```text
24. Qh7+      M3
18... Nxf3    -1.42
```

## Terminal positions

Checkmate, stalemate, threefold repetition, insufficient material, the
fifty-move rule, and other supported terminal outcomes are taken from the
recorded terminal result. The engine is not consulted after a game ends and no
analysis is fabricated.

A decided terminal position is drawn at the matching boundary and every drawn
outcome sits on equality, which is the same win/draw/loss semantics
`chessed-accuracy-v1` already uses. The point's canonical evaluation stays
null, and its detail text names the outcome ("Checkmate", "Draw by threefold
repetition") rather than a number.

## Missing evidence

Unavailable analysis stays unavailable. A position with neither an evaluation
nor a terminal outcome is never replaced with zero, the previous evaluation, an
interpolated value, or an invented point.

The plot is split into contiguous segments so no line is drawn through unknown
data, unknown stretches are shaded as explicit neutral bands rather than left to
read as a Black advantage, and the caption states how many positions were left
unplotted.

## Interaction and navigation

The graph is navigational and shares the page's canonical selected-position
state; it keeps no parallel selection of its own beyond a transient hover.

- Clicking or tapping the plot selects the nearest position, which updates the
  board, the move list selection, the evaluation details, and every other
  position-dependent review view.
- Selecting a move in the move list, using Previous/Next, or pressing the arrow
  keys moves the graph's indicator in step.
- Because graph selection routes through the same navigation as every other
  control, it produces exactly the same destination sound — one sound, and
  silence at position 0.

Touch does not depend on hover: a tap selects, and the detail readout above the
plot is persistent rather than a hover-only tooltip. The plot keeps
`touch-action: pan-y` so vertical page scrolling still works from inside it.
There is no drag scrubbing.

## Accessibility

The plot is a focusable `slider` with `aria-valuemin`, `aria-valuemax`,
`aria-valuenow` set to the canonical position index, and an `aria-valuetext`
that names the position and its semantic evaluation, for example
`18... Nxf3, -1.42`. Left and right arrow keys move one position through the
page's existing keyboard navigation; Home and End jump to the first and last
position.

A single slider is used deliberately in place of hundreds of permanently
verbose per-point elements. Evaluation is available as text in both the readout
and `aria-valuetext`, never by color alone, and focus is visibly outlined.

## Lifecycle

The graph depends on completed review evidence:

- before analysis completes, no graph is shown and the existing pending state
  applies — no fabricated or progressive data;
- after a successful review, the graph appears;
- on cancellation or failure, no stale graph is retained;
- on a game switch, the graph clears immediately with the rest of review state.

Manual PGN works with no Chess.com username, profile, or rating, and custom
starting positions are supported. Graph semantics are White-relative in every
case.

## Implementation and cost

The component is inline SVG with a small amount of React state; no charting
dependency was added. Graph points are derived once per completed review and
memoized, and the component is memoized on its props, so navigating does not
recompute the model. A normal 100–200 ply game is a few hundred SVG path
commands, which needs no canvas, WebGL, or virtualization at this scale.
