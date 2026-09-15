import { describe, expect, it } from "vitest";

import { parsePgnToReviewGame, PgnParseError } from "@/lib/chess/pgn";

describe("parsePgnToReviewGame", () => {
  it("parses a normal game and reconstructs each position", () => {
    const pgn = `[Event "Rated Blitz game"]
[Site "Chess.com"]
[Date "2024.08.01"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

    const parsed = parsePgnToReviewGame(pgn);

    expect(parsed.headers.White).toBe("Alice");
    expect(parsed.headers.Black).toBe("Bob");
    expect(parsed.moves).toHaveLength(6);
    expect(parsed.positions).toHaveLength(parsed.moves.length + 1);
    expect(parsed.moves[0].san).toBe("e4");
    expect(parsed.moves[5].san).toBe("a6");
  });

  it("uses custom start position from FEN when provided", () => {
    const pgn = `[Event "From Position"]
[SetUp "1"]
[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]
[Result "1/2-1/2"]

1. e4 Ke7 1/2-1/2`;

    const parsed = parsePgnToReviewGame(pgn);

    expect(parsed.startingFen).toBe("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
    expect(parsed.positions[0]).toBe(parsed.startingFen);
    expect(parsed.moves[0].san).toBe("e4");
    expect(parsed.moves[1].san).toBe("Ke7");
  });

  it("throws a parse error for malformed input", () => {
    expect(() => parsePgnToReviewGame("not valid pgn")).toThrow(PgnParseError);
  });
});
