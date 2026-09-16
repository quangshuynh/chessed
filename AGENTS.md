# Chessed agent guidance

## Project identity

Chessed is an independent open-source chess game analyzer that turns imported games into explainable, reproducible reviews. It is not affiliated with Chess.com.

## Architecture

Preserve these boundaries:

- `src/lib/sources`: public game-source adapters; never scrape Chess.com or request Chess.com passwords.
- `src/lib/chess`: PGN parsing, legal moves, and reconstructed positions. Use chess.js for legality; do not reimplement chess rules. Preserve custom-FEN games.
- `src/lib/analysis`: Stockfish worker/UCI adapter and whole-game engine orchestration. Raw UCI stays here.
- `src/lib/review/interfaces.ts`: normalized, engine-independent analysis contracts.
- `src/lib/review`: pure Chessed review/scoring domain, independent of React, raw UCI, and game sources.
- `src/components` and `src/app`: presentation; domain policy does not belong in UI components.

Canonical engine evaluations are White-relative: positive favors White and negative favors Black. Mate scores remain first-class mate values; never silently convert mate to fake centipawns. Centralize perspective conversion rather than scattering sign inversions.

## Engineering invariants

- Chessed uses its own documented methodology. Do not invent undocumented scoring behavior merely to imitate Chess.com.
- Keep engine observations distinct from later classifications, accuracy, and explanations.
- Avoid unnecessary infrastructure and dependencies.
- Tests should try to falsify domain behavior, including perspective, mate, terminal, malformed-input, and custom-FEN cases—not exist only for coverage.
- Never include secrets or credentials.
- Do not automatically commit, push, merge, tag, release, or deploy unless explicitly requested.

## Validation

Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm audit`, and `git diff --check` for a full change. Keep local `context.md` untracked.
