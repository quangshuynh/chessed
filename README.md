# Chessed

Chessed is an independent open-source web application for reviewing chess games.

> Chessed is **not affiliated with or endorsed by Chess.com**.

## Current status

This repository contains the initial MVP foundation:

- Responsive homepage with the primary flow: enter Chess.com username → find games → select game → review
- Chess.com public API integration for recent public games
- Manual PGN paste flow
- PGN parsing and move/position reconstruction (including custom FEN starts)
- Initial review screen with interactive board, move navigation, move list, game metadata, and placeholders for future analysis features

Stockfish analysis, Chessed move classifications, accuracy scoring, and performance-rating logic are intentionally left for future deterministic work.

## MVP workflow

1. Enter a Chess.com username.
2. Load recent public games.
3. Select a game (or paste a PGN manually).
4. Open the review interface and navigate move-by-move.

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
- `src/lib/review/interfaces.ts`: future analysis/review engine interfaces (placeholders only)
- `src/components/*`: UI presentation components
- `src/app/api/chesscom/[username]/games`: API boundary for Chess.com integration

Conceptual pipeline:

Chess.com/PGN → PGN parsing → chess positions → (future) Stockfish analysis → (future) Chessed review/scoring → interactive UI

## Current limitations

- Review sessions are stored in browser session storage (no backend persistence)
- Chess.com games without PGN data cannot be opened
- Engine lines/evaluations, classification labels, accuracy, and performance estimates are placeholder UI only

## Third-party libraries and attribution

- [chess.js](https://github.com/jhlywa/chess.js) (MIT)
- [react-chessboard](https://github.com/Clariity/react-chessboard) (MIT)

See `LICENSE` for this project license.
