import { describe, expect, it } from "vitest";

import { parsePgnToReviewGame } from "@/lib/chess/pgn";

import { groupMovesIntoFullMoves } from "./full-move-rows";

function summarize(pgn: string) {
  const game = parsePgnToReviewGame(pgn);
  return groupMovesIntoFullMoves(game.moves, game.startingFen).map((row) => ({
    moveNumber: row.moveNumber,
    white: row.white && [row.white.ply, row.white.san],
    black: row.black && [row.black.ply, row.black.san],
  }));
}

describe("groupMovesIntoFullMoves", () => {
  it("pairs sequential plies without losing the final White move", () => {
    expect(summarize("1. e4 c5 2. Nf3 Nc6 3. Bb5")).toEqual([
      { moveNumber: 1, white: [1, "e4"], black: [2, "c5"] },
      { moveNumber: 2, white: [3, "Nf3"], black: [4, "Nc6"] },
      { moveNumber: 3, white: [5, "Bb5"], black: undefined },
    ]);
  });

  it("puts a custom-FEN Black first move in the Black column", () => {
    expect(
      summarize(
        '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/6K1/8 b - - 0 18"]\n\n18... Kg7 19. Kf3',
      ),
    ).toEqual([
      { moveNumber: 18, white: undefined, black: [1, "Kg7"] },
      { moveNumber: 19, white: [2, "Kf3"], black: undefined },
    ]);
  });

  it("starts a White-to-move custom game at its FEN fullmove number", () => {
    expect(
      summarize(
        '[SetUp "1"]\n[FEN "7k/8/8/8/8/8/6K1/8 w - - 0 27"]\n\n27. Kf3 Kg7',
      ),
    ).toEqual([{ moveNumber: 27, white: [1, "Kf3"], black: [2, "Kg7"] }]);
  });
});
