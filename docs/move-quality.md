# Move-quality observation model

This layer answers one narrow question: given normalized engine observations before and after a legal played move, how much did the move hurt its player? It produces observations for future Chessed classification and scoring; it does not classify moves or compute accuracy.

## Perspective

Stockfish adapter scores are canonical White-relative values: positive favors White and negative favors Black. `toPlayerRelativeEvaluation` is the single conversion boundary. White values are unchanged and Black centipawn values are negated. A mate value becomes a player-relative `favorable` or `unfavorable` mate with an absolute distance. Callers therefore never need to remember whose perspective a move-quality value uses.

## Centipawn loss

When both observations are centipawns, raw loss is `before - after` in the mover's perspective. Published loss is `max(0, raw loss)`. Thus worsening a position produces positive loss, equality produces zero, and an apparent improvement produces zero loss. The signed `rawDifference` and `apparentImprovement` flag remain available so independent-search disagreement is not hidden. No tolerance band is imposed: this layer records the observation rather than guessing which small differences are noise.

Centipawn loss is an engine estimate, not direct human move quality. Its meaning depends on search depth, engine build, and position. It is not a classification or accuracy formula.

## Mate transitions

Mate is never assigned a centipawn constant. A discriminated semantic transition records centipawn-to-mate, mate-to-centipawn, favorable/unfavorable reversals, and retained mate. Player-relative before and after values retain mate distance, so future policy can distinguish a changed forced-mate distance. `centipawnLoss` is explicitly `null` for these transitions.

## Move identity

Played and best moves use lowercase UCI coordinate notation, including a promotion suffix. Engine best moves are parsed and replayed legally from the reconstructed pre-move FEN before comparison. This makes castling, en passant, promotions, and custom-FEN positions use the same chess-domain identity instead of comparing SAN with UCI.

## Terminal and unavailable positions

Whole-game analysis asks chess.js whether a position is terminal before invoking Stockfish. Checkmate records its winner; stalemate, insufficient material, repetition, the fifty-move rule, and other chess.js draws record an explicit draw reason. A final move can therefore have an engine observation before it and a terminal outcome after it without a fabricated engine score.

Missing results (including an interrupted analysis sequence supplied only in part) produce an explicit unavailable loss. Structurally inconsistent games, duplicate/out-of-range indexes, and illegal engine best moves fail rather than silently misaligning moves and positions.
