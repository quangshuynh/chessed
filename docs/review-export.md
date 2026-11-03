# Review navigation, FEN copy, and report export

## Keyboard navigation

Left Arrow and Right Arrow select the previous and next ply through the same
bounded navigation path as Previous, Next, the move list, and the evaluation
graph. Shortcuts are ignored while focus is in an input, textarea, select,
contenteditable region, or text-entry role, and when a modifier key is held.
The controls expose them through `aria-keyshortcuts` and a visible description.

## Copy FEN

Copy FEN writes the selected position from the parsed game's canonical position
list, the same string the board displays. Nothing is re-parsed or re-derived.
If clipboard access is unavailable, the FEN is shown in a read-only field for
manual copying.

## Markdown report

`renderReviewReport` (`src/lib/review/markdown-report.ts`) is a pure function of
a completed `WholeGameReview` and the PGN tags. It runs no engine, reads no
clock, and makes no request, so identical review data renders byte-identical
Markdown. The page offers export only for a completed review and saves the file
locally through a browser download.

- Missing or `?`-marked PGN metadata is written as `Not recorded`.
- PGN-sourced text is flattened to one line, stripped of control and
  bidirectional-override characters, and backslash-escapes all ASCII
  punctuation, so it cannot inject headings, links, HTML, or table cells.
- Brilliant, Great, and Miss are reported as recorded, alongside the ordinary
  classification they replace in the UI. Mate scores stay `M`/`-M` values.
- Player names come from the review's PGN metadata, not the session summary.

Example structure (abbreviated):

```markdown
# Chessed game review

Report format: `chessed-report-v1`

Rendered locally from a completed Chessed review. No engine analysis was run to produce this report.
Evaluations are White-relative: positive favors White and negative favors Black. `M3` means White can force mate in 3; `-M3` means Black can.

## Game

| Field  | Value        |
| ------ | ------------ |
| White  | Alice (1800) |
| Black  | Bob          |
| Result | 0\-1         |
| Date   | Not recorded |
| Moves  | 4 plies      |

## Positions

| Field               | Value                                                           |
| ------------------- | --------------------------------------------------------------- |
| Starting position   | Standard                                                        |
| Starting FEN        | `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`      |
| Starting evaluation | +0.20 (depth 12)                                                |
| Final FEN           | `rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3` |
| Final evaluation    | Checkmate                                                       |

## Accuracy

| Player | Chessed Accuracy | Scored moves | Unavailable moves |
| ------ | ---------------- | ------------ | ----------------- |
| White  | 81.9%            | 1            | 1                 |

## Classifications

| Classification | Moves |
| -------------- | ----- |
| Brilliant      | 0     |
| Best           | 1     |
| Unavailable    | 2     |

## Moves

| Ply | Move        | Classification | Before      | After     | Loss (cp) | Engine best | Depth |
| --- | ----------- | -------------- | ----------- | --------- | --------- | ----------- | ----- |
| 1   | `1. f3`     | Inaccuracy     | +0.20       | -0.60     | 80        | `e4`        | 12    |
| 4   | `2... Qh4#` | Unavailable    | Unavailable | Checkmate | n/a       | Unavailable | —     |

## Analysis

| Field                        | Value                      |
| ---------------------------- | -------------------------- |
| Review methodology           | `chessed-review-v3`        |
| Engine                       | Stockfish 18               |
| Requested limit              | depth 12                   |
| Great-boundary confirmations | 0 confirmed, 0 unavailable |
```
