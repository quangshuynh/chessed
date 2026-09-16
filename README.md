# Chessed

[![CI](https://github.com/quangshuynh/chessed/actions/workflows/ci.yml/badge.svg)](https://github.com/quangshuynh/chessed/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/quangshuynh/chessed)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)

Chessed is an independent open-source web application for reviewing chess games.

> Chessed is **not affiliated with or endorsed by Chess.com**.

## Current status

This repository contains the initial MVP foundation:

- Responsive homepage with the primary flow: enter Chess.com username → find games → select game → review
- Chess.com public API integration for recent public games
- Manual PGN paste flow
- PGN parsing and move/position reconstruction (including custom FEN starts)
- Interactive review screen with explicit client-side analysis, progress, cancellation, ordinary move classifications, and selected-move engine evidence

The Stockfish analysis boundary, engine-independent move-quality observations, Chessed's ordinary move-classification policy, and whole-game review orchestration are implemented. Accuracy scoring and performance-rating logic remain intentionally deferred.

## MVP workflow

1. Enter a Chess.com username.
2. Load recent public games.
3. Select a game (or paste a PGN manually).
4. Open the review interface, optionally start analysis, and navigate move-by-move.

## Technology stack

- Next.js (App Router)
- React + TypeScript (strict mode)
- chess.js for PGN/chess rules handling
- react-chessboard for board UI
- ESLint + Prettier
- Vitest for unit tests
- GitHub Actions for CI

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## High-level architecture

- `src/lib/sources/chesscom/*`: Chess.com retrieval service boundary
- `src/lib/chess/*`: chess-domain parsing and game representation
- `src/lib/review/interfaces.ts`: engine-independent normalized analysis contract
- `src/lib/review/move-quality.ts`: pure player-relative move-quality observations
- `src/lib/review/classification.ts`: pure ordinary move-classification policy
- `src/lib/review/game-review.ts`: pure whole-game review contract and composition
- `src/lib/analysis/*`: Stockfish worker adapter, UCI normalization, and serial game-position analysis
- `src/components/*`: UI presentation components
- `src/app/api/chesscom/[username]/games`: API boundary for Chess.com integration

Conceptual pipeline:

Chess.com/PGN → PGN parsing → chess positions → Stockfish analysis → Chessed review/classification → interactive UI

## Current limitations

- Review sessions are stored in browser session storage (no backend persistence)
- Chess.com games without PGN data cannot be opened
- Analysis is rerun after a page reload; there is no persistent analysis cache
- Accuracy and performance estimates are intentionally unavailable

Stockfish runs client-side in a single-threaded WebAssembly Web Worker. The default limit is depth 12, and normalized evaluations are always from White's perspective. See [the analysis architecture](docs/stockfish-analysis.md).

Move-quality observations convert those scores centrally to the mover's perspective, preserve mate transitions without fake centipawn arithmetic, and represent terminal or missing analysis explicitly. See [the move-quality model](docs/move-quality.md).

Chessed classifies complete observations as Best, Good, Inaccuracy, Mistake, or Blunder with a documented outcome-expectation policy. See [the ordinary classification methodology](docs/move-classification.md).

An injected analyzer produces one ordered, provenance-bearing result for a complete game, which the review page consumes without recreating chess or classification logic. See [whole-game review orchestration](docs/whole-game-review.md).

## Third-party libraries and attribution

- [chess.js](https://github.com/jhlywa/chess.js) (MIT)
- [react-chessboard](https://github.com/Clariity/react-chessboard) (MIT)
- [Stockfish.js 18](https://github.com/nmrugg/stockfish.js) (GPLv3; unmodified lite single-threaded build, with its license in `public/stockfish/Copying.txt`)

See `LICENSE` for this project license.
