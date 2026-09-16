# Stockfish analysis architecture

## Decision

Chessed runs the unmodified Stockfish 18 lite, single-threaded WebAssembly build in a browser Web Worker. The worker is loaded lazily and reused; analyses submitted to one analyzer are serialized. This keeps engine CPU work off React's main thread while remaining portable across static and public Next.js hosting.

Alternatives considered were main-thread WebAssembly (poor responsiveness), multithreaded WebAssembly (larger and requires cross-origin isolation), a native Node process (not portable to typical serverless Next.js deployments), and a dedicated service (premature operational complexity, cost, concurrency management, and security surface). Browser execution shifts CPU cost to the user and is not suitable for trusted centralized/bulk analysis, but avoids a public CPU-exhaustion endpoint.

## Boundary and score semantics

`EngineAnalyzer` accepts a legal FEN, optional limit, and `AbortSignal`. Only `src/lib/analysis/stockfish.ts` and `uci.ts` understand UCI. Consumers receive a normalized `PositionAnalysis`.

Stockfish reports scores for the side to move. The adapter always converts them to **White's perspective**: positive favors White and negative favors Black. Centipawns and mate are separate variants. Mate `+3` means White can force mate in 3; mate `-2` means White is being mated in 2. Mate is never converted to centipawns.

The game helper processes `ParsedReviewGame.positions` in order and associates each non-terminal position with the following move's ply. Terminal positions are identified through chess.js and recorded without asking Stockfish for output. Position `n - 1` and position `n` can therefore be compared with consistent semantics. Move loss is computed in the separate review-domain layer; this adapter computes no classification.

## Limits, lifecycle, and failure

The default is depth 12, overridable from 1 through 99. Fixed depth is more reproducible than fixed wall time, but scores may still change with engine version, build, platform, or search implementation; results retain engine identity and achieved depth.

One analyzer owns at most one worker and runs one search at a time. `dispose()` terminates it. Cancellation sends `stop`, rejects with the abort reason, and terminates the worker so later queued work starts cleanly. Initialization and searches have a 30-second safety timeout. Invalid FEN and limits fail before search. Initialization, timeout, malformed output, worker errors, and termination never fabricate a score.

Known limitations: the lite build is weaker than full Stockfish; browser performance varies; there is no persistent cache; cancelling resets the shared worker; a full game can consume substantial client CPU and should be initiated deliberately by future UI. Whole-game orchestration provides engine-independent position progress above this adapter.

## Licensing and distribution

Chessed distributes unmodified `stockfish-18-lite-single.js` and `.wasm` from Stockfish.js 18.0.8 in `public/stockfish`, plus its GPLv3 license. Stockfish.js is Copyright 2026 Chess.com, LLC and credits the Stockfish developers and contributors. It is GPLv3 software, separate from Chessed's MIT-licensed application code and communicating through UCI messages.

Corresponding upstream source and build instructions are available at the [Stockfish.js v18.0.0 release](https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0) and [source repository](https://github.com/nmrugg/stockfish.js). This records the distribution used; it is not legal advice.
