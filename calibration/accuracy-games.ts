import { SOAK_PGN } from "../e2e/helpers";

export interface AccuracyGameCase {
  id: string;
  pgn: string;
  provenance: string;
  purpose: string;
}

export const ACCURACY_GAME_CORPUS: readonly AccuracyGameCase[] = [
  {
    id: "fischer-spassky-1972-game-6",
    pgn: SOAK_PGN,
    provenance:
      "Fischer–Spassky, World Championship 1972 game 6: https://www.chessgames.com/perl/chessgame?gid=1044722",
    purpose: "Long, high-quality master game with a decisive attack.",
  },
  {
    id: "morphy-opera-game-1858",
    provenance:
      "Morphy–Duke Karl/Count Isouard, Paris 1858: https://www.chessgames.com/perl/chessgame?gid=1233404",
    purpose: "Short tactical game with sacrifices and terminal mate.",
    pgn: `[Event "Opera Game"]
[Site "Paris"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5
6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5
11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6
15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`,
  },
  {
    id: "fools-mate",
    provenance:
      "Canonical Fool's Mate pattern: https://www.chessprogramming.org/Fool%27s_Mate",
    purpose: "Very short game with a catastrophic error and terminal mate.",
    pgn: `[Event "Fool's Mate calibration"]
[White "White"]
[Black "Black"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`,
  },
] as const;
