import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parsePgnToReviewGame } from "@/lib/chess/pgn";
import type { ParsedReviewGame } from "@/lib/chess/types";
import {
  buildWholeGameReview,
  type WholeGameReview,
} from "@/lib/review/game-review";
import type {
  EngineEvaluation,
  GamePositionAnalysis,
  PositionAnalysis,
} from "@/lib/review/interfaces";
import {
  escapeMarkdownText,
  renderReviewReport,
  REVIEW_REPORT_FORMAT_VERSION,
  ReviewReportError,
  reviewReportFilename,
} from "@/lib/review/markdown-report";

const cp = (value: number): EngineEvaluation => ({
  kind: "centipawns",
  perspective: "white",
  value,
});
const mate = (moves: number): EngineEvaluation => ({
  kind: "mate",
  perspective: "white",
  moves,
});

function analyzed(
  game: ParsedReviewGame,
  positionIndex: number,
  evaluation: EngineEvaluation,
  bestMoveUci: string | null = null,
  candidates?: PositionAnalysis["candidates"],
): GamePositionAnalysis {
  return {
    status: "analyzed",
    positionIndex,
    followingMovePly: game.moves[positionIndex]?.ply ?? null,
    analysis: {
      fen: game.positions[positionIndex],
      evaluation,
      bestMoveUci,
      principalVariationUci: bestMoveUci ? [bestMoveUci] : [],
      candidates,
      limit: { requested: { kind: "depth", value: 12 }, achievedDepth: 12 },
      engine: { name: "Stockfish", version: "18" },
    },
  };
}

/** A real checkmate whose classifications come from the real review policy. */
const MATE_PGN = `[Event "Report fixture"]
[Site "Local"]
[Date "2026.09.15"]
[White "Alice"]
[Black "Bob"]
[WhiteElo "1800"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

function mateReview(pgn = MATE_PGN) {
  const game = parsePgnToReviewGame(pgn);
  const review = buildWholeGameReview({
    game,
    positions: [
      analyzed(game, 0, cp(20), "e2e4"),
      analyzed(game, 1, cp(-60), "e7e5"),
      analyzed(game, 2, cp(-50), "d2d4"),
      // A missing position: the next moves' evidence is honestly unavailable.
      null,
      {
        status: "terminal",
        positionIndex: 4,
        followingMovePly: null,
        fen: game.positions[4],
        reason: "checkmate",
        winner: "black",
      },
    ],
  });
  return { game, review };
}

/** The real pipeline's Brilliant fixture: a sound queen offer. */
function brilliantReview() {
  const game = parsePgnToReviewGame(`[SetUp "1"]
[FEN "4k3/8/6p1/8/8/8/8/3QK3 w - - 0 1"]

1. Qh5`);
  const review = buildWholeGameReview({
    game,
    positions: [
      analyzed(game, 0, cp(50), "d1h5", [
        {
          rank: 1,
          moveUci: "d1h5",
          evaluation: cp(55),
          principalVariationUci: ["d1h5", "g6h5"],
        },
        {
          rank: 2,
          moveUci: "d1d2",
          evaluation: cp(-80),
          principalVariationUci: ["d1d2"],
        },
      ]),
      analyzed(game, 1, cp(55)),
    ],
  });
  return { game, review };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Split a Markdown table row on unescaped pipes. */
function cells(line: string): string[] {
  return line
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

function row(report: string, label: string): string[] {
  const line = report
    .split("\n")
    .find((candidate) => candidate.startsWith(`| ${label} |`));
  if (!line) throw new Error(`Missing report row ${label}`);
  return cells(line);
}

describe("Markdown review report", () => {
  it("renders the documented structure for a completed review", () => {
    const { game, review } = mateReview();
    expect(renderReviewReport({ review, headers: game.headers }))
      .toBe(`# Chessed game review

Report format: \`${REVIEW_REPORT_FORMAT_VERSION}\`

Rendered locally from a completed Chessed review. No engine analysis was run to produce this report.
Evaluations are White-relative: positive favors White and negative favors Black. \`M3\` means White can force mate in 3; \`-M3\` means Black can.

## Game

| Field | Value |
| --- | --- |
| White | Alice (1800) |
| Black | Bob |
| Result | 0\\-1 |
| Date | 2026\\.09\\.15 |
| Time control | Not recorded |
| Event | Report fixture |
| Site | Local |
| Round | Not recorded |
| ECO | Not recorded |
| Opening | Not recorded |
| Termination | Not recorded |
| Moves | 4 plies |

## Positions

| Field | Value |
| --- | --- |
| Starting position | Standard |
| Starting FEN | \`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\` |
| Starting evaluation | +0.20 (depth 12) |
| Final FEN | \`rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3\` |
| Final evaluation | Checkmate |

## Accuracy

| Player | Chessed Accuracy | Scored moves | Unavailable moves |
| --- | --- | --- | --- |
| White | 81.9% | 1 | 1 |
| Black | 97.6% | 1 | 1 |

## Classifications

Brilliant, Great, and Miss are special labels shown in place of a move's ordinary classification; ordinary counts include every move.

| Classification | Moves |
| --- | --- |
| Brilliant | 0 |
| Great | 0 |
| Miss | 0 |
| Best | 1 |
| Good | 0 |
| Inaccuracy | 1 |
| Mistake | 0 |
| Blunder | 0 |
| Unavailable | 2 |

## Moves

| Ply | Move | Classification | Before | After | Loss (cp) | Engine best | Depth |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | \`1. f3\` | Inaccuracy | +0.20 | -0.60 | 80 | \`e4\` | 12 |
| 2 | \`1... e5\` | Best | -0.60 | -0.50 | 10 | \`e5\` | 12 |
| 3 | \`2. g4\` | Unavailable | -0.50 | Unavailable | n/a | \`d4\` | 12 |
| 4 | \`2... Qh4#\` | Unavailable | Unavailable | Checkmate | n/a | Unavailable | — |

## Analysis

| Field | Value |
| --- | --- |
| Review methodology | \`chessed-review-v3\` |
| Accuracy methodology | \`chessed-accuracy-v1\` |
| Engine | Stockfish 18 |
| Requested limit | depth 12 |
| Achieved depth | 12 |
| Analyzed positions | 3 |
| Terminal positions | 1 |
| Unavailable positions | 1 |
| Great-boundary confirmations | 0 confirmed, 0 unavailable |
`);
  });

  it("is byte-identical across renders and structurally equal copies", () => {
    const { game, review } = mateReview();
    const first = renderReviewReport({ review, headers: game.headers });
    expect(renderReviewReport({ review, headers: game.headers })).toBe(first);
    expect(
      renderReviewReport({
        review: structuredClone(review),
        headers: { ...game.headers },
      }),
    ).toBe(first);
    expect(first.endsWith("\n")).toBe(true);
    expect(first).not.toMatch(/[ \t]+$/m);
    expect(first).not.toContain("\r");
  });

  it("reads the review without mutating it", () => {
    const { game, review } = mateReview();
    const snapshot = JSON.stringify(review);
    deepFreeze(review);
    deepFreeze(game.headers);
    expect(() =>
      renderReviewReport({ review, headers: game.headers }),
    ).not.toThrow();
    expect(JSON.stringify(review)).toBe(snapshot);
  });

  it("represents missing optional metadata instead of fabricating it", () => {
    const game = parsePgnToReviewGame(`[White "?"]
[Black ""]
[Result "?"]

1. e4`);
    const review = buildWholeGameReview({
      game,
      positions: [analyzed(game, 0, cp(20), "e2e4"), analyzed(game, 1, cp(20))],
    });
    const report = renderReviewReport({ review, headers: game.headers });
    for (const label of [
      "White",
      "Black",
      "Result",
      "Date",
      "Time control",
      "Event",
      "Site",
      "Round",
    ]) {
      expect(row(report, label)[1]).toBe("Not recorded");
    }
    // Rendering without PGN tags at all is equally honest.
    expect(row(renderReviewReport({ review }), "Event")[1]).toBe(
      "Not recorded",
    );
    expect(report).not.toContain("| ? |");
  });

  it("preserves Brilliant over its ordinary Best classification", () => {
    const { game, review } = brilliantReview();
    expect(review.moves[0].specialClassification?.classification).toBe(
      "brilliant",
    );
    const report = renderReviewReport({ review, headers: game.headers });
    expect(row(report, "1")[2]).toBe("Brilliant (ordinary: Best)");
    expect(row(report, "Brilliant")[1]).toBe("1");
    expect(row(report, "Best")[1]).toBe("1");
  });

  it("labels Great and Miss exactly as the review recorded them", () => {
    const { review } = mateReview();
    const [first, second] = review.moves;
    const labelled: WholeGameReview = {
      ...review,
      moves: [
        {
          ...first,
          specialClassification: {
            classification: "miss",
            evidence: {} as never,
          },
        },
        {
          ...second,
          specialClassification: {
            classification: "great",
            evidence: {} as never,
          },
        },
        ...review.moves.slice(2),
      ],
    };
    const report = renderReviewReport({ review: labelled });
    expect(row(report, "1")[2]).toMatch(/^Miss \(ordinary: \w+\)$/);
    expect(row(report, "2")[2]).toMatch(/^Great \(ordinary: \w+\)$/);
    // Counts are the review's own, not re-derived from the move labels.
    expect(row(report, "Miss")[1]).toBe("0");
  });

  it("keeps mate scores as mate values", () => {
    const game = parsePgnToReviewGame("1. e4 e5");
    const review = buildWholeGameReview({
      game,
      positions: [
        analyzed(game, 0, mate(3), "e2e4"),
        analyzed(game, 1, mate(-2)),
        analyzed(game, 2, cp(0)),
      ],
    });
    const report = renderReviewReport({ review });
    expect(row(report, "1").slice(3, 5)).toEqual(["M3", "-M2"]);
    expect(row(report, "Starting evaluation")[1]).toBe("M3 (depth 12)");
    expect(row(report, "Final evaluation")[1]).toBe("0.00 (depth 12)");
  });

  it("keeps a custom FEN start and its move numbering", () => {
    const fen =
      "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4";
    const game = parsePgnToReviewGame(`[SetUp "1"]
[FEN "${fen}"]

4... Bc5 5. c3`);
    const review = buildWholeGameReview({
      game,
      positions: [
        analyzed(game, 0, cp(30), "g8f6"),
        analyzed(game, 1, cp(40)),
        analyzed(game, 2, cp(35)),
      ],
    });
    const report = renderReviewReport({ review, headers: game.headers });
    expect(row(report, "Starting position")[1]).toBe("Custom (PGN FEN tag)");
    expect(row(report, "Starting FEN")[1]).toBe(`\`${fen}\``);
    expect(row(report, "Final FEN")[1]).toBe(`\`${game.positions[2]}\``);
    expect(row(report, "1")[1]).toBe("`4... Bc5`");
    expect(row(report, "1")[6]).toBe("`Nf6`");
    expect(row(report, "2")[1]).toBe("`5. c3`");
  });

  it("serializes hostile and Unicode PGN metadata as inert text", () => {
    const pgn = `[Event "**Bold** [x](javascript:alert(1)) <img src=x onerror=alert(1)>"]
[Site "a|b|c \`code\` &amp; \\\\ end"]
[White "Магнус Карлсен 李 ♔"]
[Black "Bob‮evil"]
[Round "# 1"]
[Opening "- [ ] list > quote"]

1. e4`;
    const game = parsePgnToReviewGame(pgn);
    // chess.js keeps a quoted newline's neighbours on one header line, so the
    // line-break case is exercised directly on the review metadata.
    const base = buildWholeGameReview({
      game,
      positions: [analyzed(game, 0, cp(20), "e2e4"), analyzed(game, 1, cp(20))],
    });
    const review: WholeGameReview = {
      ...base,
      metadata: {
        ...base.metadata,
        timeControl: "60\n# Injected heading\r\n| fake | row |",
      },
    };
    const report = renderReviewReport({ review, headers: game.headers });

    // Only the renderer's own headings start a Markdown block.
    const headings = report.split("\n").filter((line) => /^\s*#/.test(line));
    expect(headings).toEqual([
      "# Chessed game review",
      "## Game",
      "## Positions",
      "## Accuracy",
      "## Classifications",
      "## Moves",
      "## Analysis",
    ]);
    // Every table row keeps exactly its declared number of cells.
    for (const line of report.split("\n").filter((l) => l.startsWith("|"))) {
      expect(cells(line).length === 2 || cells(line).length >= 4).toBe(true);
    }
    for (const label of ["Event", "Site", "Round", "Opening", "Time control"]) {
      expect(row(report, label)).toHaveLength(2);
    }
    expect(report).not.toMatch(/(?<!\\)[<[]/);
    expect(report).not.toContain("](");
    expect(row(report, "Event")[1]).toBe(
      "\\*\\*Bold\\*\\* \\[x\\]\\(javascript\\:alert\\(1\\)\\) \\<img src\\=x onerror\\=alert\\(1\\)\\>",
    );
    expect(row(report, "Site")[1]).toBe(
      "a\\|b\\|c \\`code\\` \\&amp\\; \\\\\\\\ end",
    );
    expect(row(report, "Time control")[1]).toBe(
      "60 \\# Injected heading \\| fake \\| row \\|",
    );
    expect(row(report, "White")[1]).toBe("Магнус Карлсен 李 ♔");
    expect(row(report, "Black")[1]).toBe("Bob evil");
    expect(report).not.toContain("‮");
  });

  it("refuses an incomplete review rather than exporting partial evidence", () => {
    const { review } = mateReview();
    expect(() =>
      renderReviewReport({
        review: { ...review, moves: review.moves.slice(0, 2) },
      }),
    ).toThrow(ReviewReportError);
    expect(() =>
      renderReviewReport({
        review: {
          ...review,
          moves: [review.moves[1], review.moves[0], ...review.moves.slice(2)],
        },
      }),
    ).toThrow(ReviewReportError);
  });

  it("renders a game with no played moves", () => {
    const game = parsePgnToReviewGame(`[White "Alice"]\n\n*`);
    const review = buildWholeGameReview({
      game,
      positions: [analyzed(game, 0, cp(20), "e2e4")],
    });
    const report = renderReviewReport({ review });
    expect(report).toContain("## Moves\n\nNo moves were played.\n");
    expect(row(report, "Final FEN")[1]).toBe(row(report, "Starting FEN")[1]);
  });

  it("is a pure rendering layer with no engine, network, or clock access", () => {
    const source = readFileSync(join(__dirname, "markdown-report.ts"), "utf8");
    expect(source).not.toMatch(/@\/lib\/analysis|stockfish|from "react"/i);
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|Date\.now|new Date/);
  });
});

describe("Markdown escaping", () => {
  it("escapes all ASCII punctuation and flattens line breaks", () => {
    expect(escapeMarkdownText("a_b*c`d|e\n\nf")).toBe("a\\_b\\*c\\`d\\|e f");
    expect(escapeMarkdownText("  trimmed  ")).toBe("trimmed");
    expect(escapeMarkdownText("Café 🏁")).toBe("Café 🏁");
  });
});

describe("report filename", () => {
  it("is deterministic and filesystem-safe", () => {
    const { review } = mateReview();
    expect(reviewReportFilename(review)).toBe(
      "chessed-review-alice-vs-bob-2026-09-15.md",
    );
    const unusual: WholeGameReview = {
      ...review,
      metadata: {
        ...review.metadata,
        date: undefined,
        players: {
          white: { color: "white", name: "José ../../etc" },
          black: { color: "black", name: "李" },
        },
      },
    };
    expect(reviewReportFilename(unusual)).toBe(
      "chessed-review-jose-etc-vs-black.md",
    );
  });
});
