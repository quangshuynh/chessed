# Stockfish analysis architecture

## Decision

Chessed runs the unmodified Stockfish 18 lite, single-threaded WebAssembly build in a browser Web Worker. The worker is loaded lazily and reused; analyses submitted to one analyzer are serialized. This keeps engine CPU work off React's main thread while remaining portable across static and public Next.js hosting.

Alternatives considered were main-thread WebAssembly (poor responsiveness), multithreaded WebAssembly (larger and requires cross-origin isolation), a native Node process (not portable to typical serverless Next.js deployments), and a dedicated service (premature operational complexity, cost, concurrency management, and security surface). Browser execution shifts CPU cost to the user and is not suitable for trusted centralized/bulk analysis, but avoids a public CPU-exhaustion endpoint.

## Boundary and score semantics

`EngineAnalyzer` accepts a legal FEN, optional limit, and `AbortSignal`. Only `src/lib/analysis/stockfish.ts` and `uci.ts` understand UCI. Consumers receive a normalized `PositionAnalysis`.

Stockfish reports scores for the side to move. The adapter always converts them to **White's perspective**: positive favors White and negative favors Black. Centipawns and mate are separate variants. Mate `+3` means White can force mate in 3; mate `-2` means White is being mated in 2. Mate is never converted to centipawns.

The game helper processes `ParsedReviewGame.positions` in order and associates each non-terminal position with the following move's ply. Terminal positions are identified through chess.js and recorded without asking Stockfish for output. Position `n - 1` and position `n` can therefore be compared with consistent semantics. Move loss is computed in the separate review-domain layer; this adapter computes no classification.

Each position first receives a single-PV search. Review orchestration repeats a
position with a bounded MultiPV of three only when first-pass evidence could
qualify for a special label. The adapter groups final-depth UCI lines by rank
and exposes normalized candidates (rank, root move, White-relative evaluation,
and PV). Raw protocol tokens do not cross the analysis boundary. See the
[special-classification methodology](special-move-classification.md).

A potential Great result with rank-1/rank-2 separation from 0.03 through 0.05
receives one additional depth-16/MultiPV-3 search. Confirmed evidence is
authoritative, while the depth-12 snapshot remains attached as provenance.
Failure conservatively disables Great for that move; abort still stops and
resets the same worker. Searches remain serial and use no additional worker.

## Limits, lifecycle, and failure

The default is depth 12, overridable from 1 through 99. Fixed depth is more reproducible than fixed wall time, but scores may still change with engine version, build, platform, or search implementation; results retain engine identity and achieved depth.

One analyzer owns at most one worker and runs one search at a time. `dispose()` terminates it. Cancellation sends `stop`, rejects with the abort reason, and terminates the worker so later queued work starts cleanly. Initialization and searches have a 30-second safety timeout. Invalid FEN and limits fail before search. Initialization, timeout, malformed output, worker errors, and termination never fabricate a score.

Known limitations: the lite build is weaker than full Stockfish; browser performance varies; there is no persistent cache; cancelling resets the shared worker; a full game can consume substantial client CPU and should be initiated deliberately by future UI. Whole-game orchestration provides engine-independent position progress above this adapter.

## Browser execution path

The review route reads a browser session and reconstructs its positions without starting the engine. An explicit **Analyze Game** action creates one `StockfishAnalyzer`; its first position lazily creates `/stockfish/stockfish-18-lite-single.js`, which loads the matching WASM. The serial whole-game helper analyzes each non-terminal position and reports factual position progress. `reviewGame` then composes the normalized observations into one completed review, React presents the selected move, and the page disposes the analyzer in `finally`. Cancellation aborts the run, sends `stop`, terminates the worker, and discards partial output. A retry owns a new analyzer and worker.

## Browser validation and measurements

Playwright runs bounded tests against a production Next.js server on port 3100. The tests open a manual PGN through the real homepage, verify analysis is opt-in, observe the dedicated worker and JS/WASM responses, capture advancing progress, await a completed review, navigate the board, cancel a live worker, rerun after cancellation, and use Chromium targets to verify worker termination. A 390 px viewport check guards against a SAN PV widening its analysis card. Unit/component tests remain mocked and fast.

The explicit `npm run test:e2e:perf` suite measured the depth-12 single-worker path on 2026-09-15 using headless Playwright Chromium 140 on Windows 11 Home 64-bit (build 26200), Node 24.18.0, an Intel Core i7-9700 (8 cores/8 logical processors), and approximately 16 GB RAM:

| Fixture | Positions | Approx. duration | Board navigation response |
| ------- | --------: | ---------------: | ------------------------: |
| Short   |         5 |           2.08 s |                     95 ms |
| Medium  |        17 |           2.03 s |                     68 ms |
| Longer  |        31 |           2.02 s |                     57 ms |

Cancellation after a real worker appeared took approximately 80 ms, including UI confirmation and observed worker removal. Progress remained responsive, board navigation completed during analysis, and no Stockfish worker target remained after completion or cancellation. The flat timings reflect this single warm local run and fixture positions, not a universal scaling claim; browser scheduling, CPU, thermal state, and positions materially affect search cost. No mobile device was measured—the 390 px run validates layout only, not mobile performance. No heap profiler or long soak test was run, so the lifecycle checks rule out obvious surviving workers rather than every possible memory leak.

These results show the current depth-12 serial design is practically usable for the measured fixtures, so no performance optimization or architecture change was justified.

## Defensive confirmation soak

The opt-in `npm run test:e2e:soak` target adds an 83-position historical game,
repeated completion/cancellation/retry, a real depth-16 confirmation, narrow
viewport plus 4x CPU throttling, worker target checks, and conservative CDP heap
observations. The measured long run performed 54 MultiPV enrichments and one
confirmation in 10.55 seconds; cancellation took 51 ms. One worker was present
per active run and none survived completion, cancellation, or navigation. Full
conditions and limitations are in `browser-confirmation-soak.md`.

## SAN presentation

Engine evidence retains canonical UCI. `src/lib/chess/notation.ts` creates a chess.js position from the relevant pre-move FEN and legally replays UCI to obtain SAN; SAN rules are not reimplemented. PV conversion advances the same position after every move, preserving captures, disambiguation, castling, promotion, check, checkmate, custom-FEN state, and truncated legal lines. Numbering comes from the FEN fullmove number and side to move, so a Black-starting line begins, for example, `18... Kxh7 19. Ng5+ Kg8`.

Malformed FEN/UCI or any illegal/inconsistent PV makes that presentation unavailable. Chessed does not invent SAN or expose a misleading partial line, while raw UCI remains in the review result for evidence and diagnostics.

## Licensing and distribution

Chessed distributes unmodified `stockfish-18-lite-single.js` and `.wasm` from Stockfish.js 18.0.8 in `public/stockfish`, plus its GPLv3 license. Stockfish.js is Copyright 2026 Chess.com, LLC and credits the Stockfish developers and contributors. It is GPLv3 software, separate from Chessed's MIT-licensed application code and communicating through UCI messages.

Corresponding upstream source and build instructions are available at the [Stockfish.js v18.0.0 release](https://github.com/nmrugg/stockfish.js/releases/tag/v18.0.0) and [source repository](https://github.com/nmrugg/stockfish.js). This records the distribution used; it is not legal advice.
