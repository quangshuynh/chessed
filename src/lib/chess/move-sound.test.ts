import { describe, expect, it } from "vitest";

import { parsePgnToReviewGame } from "@/lib/chess/pgn";

import { getMoveSound } from "./move-sound";

function sounds(pgn: string) {
  return parsePgnToReviewGame(pgn).moves.map(getMoveSound);
}

describe("move sounds", () => {
  it("derives ordinary moves, captures, checks, and mate from chess.js state", () => {
    expect(
      sounds("1. e4 d5 2. exd5 Qxd5 3. Nc3 Qe5+ 4. Be2 Bg4 5. f3 Qg3+ 6. hxg3"),
    ).toEqual([
      "move",
      "move",
      "capture",
      "capture",
      "move",
      "check",
      "move",
      "move",
      "move",
      "check",
      "capture",
    ]);
    expect(sounds("1. f3 e5 2. g4 Qh4#").at(-1)).toBe("checkmate");
  });

  it("recognizes en passant while leaving castling and promotion as moves", () => {
    expect(sounds("1. e4 a6 2. e5 d5 3. exd6").at(-1)).toBe("capture");
    expect(
      sounds("1. Nf3 Nf6 2. g3 g6 3. Bg2 Bg7 4. O-O O-O").slice(-2),
    ).toEqual(["move", "move"]);
    expect(
      sounds('[SetUp "1"]\n[FEN "8/P7/8/8/8/8/7k/4K3 w - - 0 1"]\n\n1. a8=Q'),
    ).toEqual(["move"]);
  });

  it("gives check and checkmate precedence over capture", () => {
    expect(
      sounds('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1"]\n\n1. Qb5+'),
    ).toEqual(["check"]);
    expect(
      sounds('[SetUp "1"]\n[FEN "7k/6Qp/6K1/8/8/8/8/8 w - - 0 1"]\n\n1. Qxh7#'),
    ).toEqual(["checkmate"]);
  });
});
