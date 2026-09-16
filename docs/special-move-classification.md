# Special move-classification methodology

Chessed review methodology `chessed-review-v2` adds three optional special
classifications: **Great**, **Brilliant**, and **Miss**. They are Chessed-defined
concepts and do not reproduce Chess.com's Game Review algorithm.

Every move keeps its ordinary Best/Good/Inaccuracy/Mistake/Blunder result and
evidence. A special classification is a second, optional result. Presentation
shows the special result when present, but the review domain owns composition
and precedence.

## Evidence boundary and research

Each non-terminal position first receives the existing single-PV search. Chessed
then requests three ranked principal variations only when normalized first-pass
evidence leaves a special label possible: the played move matches rank 1, the
ordinary result is Inaccuracy or worse, or favorable mate existed before the
move. The normalized contract retains rank, root move, White-relative
centipawn or mate evaluation, and PV. Classification requires contiguous ranks
1 and 2 and a PV whose first move agrees with its candidate identity. Incomplete
evidence earns no special label.

Stockfish documents MultiPV as outputting the N best lines and notes that it
costs best-line search performance. The UCI protocol defines `multipv` as the
rank of the accompanying PV. Chessed therefore bounds the count at three,
retains one worker, and never analyzes every legal move separately. This
selective second pass is deterministic from first-pass evidence:

- [Stockfish UCI commands and options](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html)
- [Stockfish terminology: MultiPV](https://official-stockfish.github.io/docs/stockfish-wiki/Terminology.html)
- [Universal Chess Interface specification](https://expositor.dev/uci/doc/draft-1.pdf)

These sources establish ranked engine lines and score kinds. They do not define
Great, Brilliant, or Miss. Chessed does not treat a PV as proof of every possible
continuation. Commercial terminology was considered only as broad context and
was not adopted as methodology.

## Candidate separation

For centipawn candidates, separation is the difference between their
mover-relative values after applying Chessed's bounded outcome-expectation
transform. Mate remains first-class: a favorable-mate best line separated from
a non-favorable-mate second line has decisive separation; two favorable mating
candidates have zero separation. Mate is never converted to centipawns.

## Material evidence

Chessed replays candidate PV moves legally with chess.js and counts material
from board state. Values are pawn 1, knight 3, bishop 3, rook 5, queen 9. Kings
have no sacrificial value. This conventional model is supported as a counting
heuristic by [US Chess's material-count curriculum](https://new.uschess.org/sites/default/files/media/documents/2018-stlcc-curriculum-lesson3-2.pdf).
It identifies exposure and gain only; it never replaces Stockfish evaluation.

For a candidate line, `exposure` is initial minus minimum material balance and
`sustained loss` is initial minus final balance. Invalid or illegal PVs supply
no evidence. Search horizons can distort material readings, so PV material is
corroboration rather than objective truth. Temporary sacrifices recovered
within the bounded PV are deliberately rejected.

## Brilliant

Brilliant means an exceptional, engine-compensated, materially
counterintuitive move. All conditions are required:

- the played move is rank 1 and ordinarily Best;
- at least two legal moves exist, and the move is not a promotion or terminal
  mating move;
- rank 1 exceeds rank 2 by at least 0.025 outcome expectation;
- the PV exposes at least 3 material points and ends at least 1 point below the
  initial material balance;
- rank 1 leaves the mover at or above 0.50 outcome expectation; and
- the pre-move position is no more than 0.90, excluding overwhelmingly decided
  positions.

The independent signals are identity, candidate separation, legal-board
material exposure, sustained cost, and engine-confirmed compensation. Routine
exchanges, immediate recovery, promotions, forced moves, losing sacrifices,
non-sacrificing best moves, and obvious checkmates do not qualify. False
positives are intentionally more costly than rarity.

## Great

Great means an unusually important best move in a narrow position. It requires:

- rank-1 identity and an ordinary Best result;
- at least two legal moves;
- rank 1 exceeds rank 2 by at least 0.04 outcome expectation, including a sole
  favorable-mate line versus a non-mating alternative; and
- if the PV exposes 3 or more material points, the engine still shows at least
  0.50 outcome expectation or favorable mate.

Thus Great is not an alias for Best: equal candidates, tiny separations,
routine moves, and forced only-legal moves are rejected. A critical defensive
resource can qualify because separation is mover-relative. Brilliant is
evaluated first, so a move cannot receive both.

## Miss

Miss means failure to exploit concrete opportunity evidence. The played move
must not be rank 1. One rule must hold:

- **missed forced mate:** rank 1 has favorable mate and the actual move neither
  retains favorable mate nor immediately wins;
- **missed material win:** ordinary outcome drop is at least 0.025 and the best
  PV ends at least 5 material points above its starting balance; or
- **missed forcing resource:** ordinary outcome drop and rank-1/rank-2
  separation are both at least 0.075, and the best root move is a capture,
  check, or promotion.

Miss is orthogonal to ordinary severity. Its underlying result may be
Inaccuracy, Mistake, or Blunder. A positional loss without mate, material, or
forcing evidence is not a Miss. Missing faster mate while retaining favorable
mate is not a Miss.

## Mate, precedence, and determinism

- A played mating move retains ordinary terminal-win and is not Brilliant,
  because no post-move compensation evidence exists.
- Great may identify a non-terminal move that alone preserves or creates mate;
  multiple favorable mating moves have zero separation.
- Losing an available favorable mate is a Miss when actual post-move evidence
  no longer contains favorable mate.
- Terminal draws/losses retain ordinary semantics; no fake score is created.

The pure domain order is Brilliant, then Great, then Miss, then presentation of
the preserved ordinary label. Miss cannot compete with Brilliant/Great because
it requires a non-rank-1 move. React only formats the result. Identical
normalized evidence always returns the same result.

## Limitations

Depth-12 order, mate distance, and PV length can be unstable. Three lines cannot
prove uniqueness beyond rank 3, and PV material cannot identify every
positional sacrifice or tactic. The policy has no human difficulty, rating,
clock, opening, or aesthetic model. It prefers no label when evidence is
incomplete and will miss genuine human brilliancies.

## Performance

On the existing Windows 11/headless Chromium fixture, requesting MultiPV=3 for
every position measured 1.53 s (5 positions), 3.58 s (17), and 5.19 s (31),
versus the previous single-PV observations of about 2.08 s, 2.03 s, and 2.02 s.
Selective enrichment reduced the current measurements to 1.52 s, 3.13 s, and
4.15 s. Interaction remained 63-66 ms and cancellation 67 ms. These are
one-machine observations. The remaining long-game cost is explicitly accepted
because ranked alternatives are indispensable to distinguish Great/Brilliant
from ordinary Best and Miss from ordinary loss; the selective policy avoids the
cost where a special label is impossible without weakening that evidence.

Chessed adopts engine-ranked alternatives, explicit mate semantics, legal PV
replay, and conservative multi-signal composition. It rejects
label-by-centipawn-loss, best-move-only, and mistake-renaming rules.
