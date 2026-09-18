# Whole-game review orchestration

Chessed can produce a complete ordinary review through one engine-independent
entry point:

```text
parsed/reconstructed game
  -> normalized position analysis
  -> move-quality observations
  -> selective MultiPV enrichment
  -> optional depth-16 Great confirmation
  -> ordinary and special classifications
  -> whole-game review result
```

`reviewGame` in `src/lib/analysis/review-game.ts` coordinates the asynchronous
analysis stage through an injected `EngineAnalyzer`. It contains no UCI parsing,
perspective arithmetic, classification thresholds, React, or presentation
policy. `buildWholeGameReview` in `src/lib/review/game-review.ts` is the pure
composition boundary and can also build an explicit review from complete or
partial normalized position observations.

## Result contract

`WholeGameReview` contains:

- PGN-derived players, colors, optional ratings, result, time control, date,
  starting FEN, custom-start status, and played-ply count;
- one ordered `ReviewMove` for every parsed move;
- factual classification counts, including unavailable moves; and
- engine/settings/methodology provenance.

The completed result also derives independent White and Black Chessed Accuracy
values from the normalized move evidence. This is cheap pure-domain arithmetic;
it does not add an engine pass. Coverage counts and the separate
`chessed-accuracy-v1` provenance are retained. See
[accuracy scoring](accuracy-scoring.md).

Each reviewed move retains its ply and PGN full-move number, color, SAN, UCI,
before/after FENs, before-position best move and PV, normalized before/after
engine evaluations where available, the complete player-relative observation,
centipawn loss or mate transition where meaningful, terminal outcome,
`playedBestMove`, and the complete classification result and evidence.

Move `n` consumes reconstructed position indexes `n - 1` and `n`. The best move
and PV therefore come from the position before the played move. A terminal final
position is retained as the final move's outcome without an invented post-move
evaluation. Tests assert contiguous PGN order, both player perspectives, and
the final terminal move to guard against off-by-one mapping.

## Progress

The optional callback reports factual work steps and a phase of `analysis`,
`enrichment`, or `confirmation`. During the first pass one reserved step keeps
the meter below completion; after candidate discovery the denominator becomes
the exact position-plus-extra-search count. Terminal positions count as steps
without invoking the engine. Successful review reaches equality only after all
MultiPV enrichment and any depth-16 confirmation completes. The callback is
synchronous and should remain lightweight.

## Cancellation and ownership

Cancellation is fail-fast. The supplied `AbortSignal` is checked between
positions and passed to every engine request. An abort rejects the entire
`reviewGame` promise with the abort reason; no partial `WholeGameReview` is
returned and no classification is fabricated for unfinished moves.

The caller owns the injected analyzer and remains responsible for calling
`dispose()` when it no longer needs it. The browser Stockfish implementation
responds to an in-flight abort by sending `stop` and resetting/terminating its
worker, so cancellation does not leave that search running. Aborting a signal
after a review has already resolved does not retroactively alter the result.

## Review-page lifecycle

The client review page does not analyze on render. Its explicit **Analyze Game**
action lazily creates one `StockfishAnalyzer` for the whole run and passes it to
`reviewGame`. The same instance analyzes every reconstructed position. The page
owns that analyzer and disposes it after success, failure, cancellation, or
unmount; rerenders and move navigation never create workers.

The page renders the orchestration callback's exact completed/total position
counts in a native accessible progress element. Cancellation aborts the run and
discards all partial state. A monotonically increasing run identity prevents a
cancelled, replaced, or unmounted run from publishing late progress or results.
Failure and cancellation both permit a fresh explicit retry.

Repeated-run tests also resolve an older cancelled promise after its successor
has started. Run identity prevents that stale completion from replacing current
progress or results; retry resets progress and confirmation state to the new
game's initial denominator. Consecutive-confirmation tests cover adjacent White
and Black plies so confirmed evidence cannot cross a position or perspective.

The session is loaded from browser session storage after mount, avoiding server
render access to browser-only storage and the Stockfish Web Worker. Loading a
different session resets the selected ply and completed review.

Selected position index `0` is presented as the starting position and has no
classification. For indexes greater than zero, the selected review record is
`moves[currentPly - 1]`, with an explicit ply identity check. Evaluations are
shown in pawn units from the canonical White perspective (`+0.35`, `-1.42`) and
mates remain distinct (`M3`, `-M2`). The UI does not flip Black-move scores.
Terminal moves retain their ordinary classification and terminal outcome while
the absent post-terminal engine evaluation is labeled as a terminal position.

## Failures and unavailable evidence

Initialization, timeout, worker, invalid-analysis, and other analyzer errors are
fatal to `reviewGame` and reject it unchanged. Continuing after an engine error
could mix settings or conceal an unreliable run, so this interval deliberately
does not do so.

The pure builder accepts missing normalized positions for callers that already
possess a partial set, such as retained results from an interrupted external
workflow. Lower layers then produce explicit missing-before or missing-after
observations, and classification remains unavailable. Null values and the
unavailable count are retained rather than replaced with neutral evaluations.
Structurally inconsistent normalized data still throws.

## Repeated positions

Every distinct reconstructed non-terminal FEN is analyzed once per invocation.
No board-only cache is used. Repeated piece placement is not enough to establish
identical review state: FEN halfmove/fullmove counters affect rule state, and
threefold repetition depends on game history outside a single FEN. The
history-aware terminal check can therefore identify the final repetition while
earlier occurrences remain ordinary analyzed positions. There is no persistent
cache or database.

## Provenance

The result retains unique engine names/versions, requested analysis limits, the
minimum and maximum achieved depth, analyzed/terminal/unavailable position
counts, and the methodology identifier `chessed-review-v3`. The identifier
describes Chessed's review methodology rather than a deployment or package
version.

## Current UI limitations and deferred work

Review results are memory-only and disappear on reload. There is no evaluation
graph, time estimate, persistent cache, accuracy, Elo/performance estimate,
coaching, opening analysis, or server-side Stockfish.

## Falsification coverage

Synthetic analyzer tests are designed to fail on position/ply off-by-one errors,
wrong Black perspective, reordered or duplicate plies, a dropped terminal move,
stale progress, cancellation that continues searching, bypassed classification
policy, hidden unavailable defaults, lost PGN metadata, missing provenance, or
unsafe repetition reuse. Real Stockfish is not invoked because its adapter is
already independently tested and would make orchestration tests slow and
nondeterministic.
