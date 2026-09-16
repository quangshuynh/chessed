export type CalibrationProperty =
  | "historical-sacrifice"
  | "queen-sacrifice"
  | "piece-sacrifice"
  | "pseudo-sacrifice"
  | "immediate-recovery"
  | "losing-sacrifice"
  | "forced-move"
  | "quiet-move"
  | "routine-development"
  | "routine-recapture"
  | "mate-in-one"
  | "missed-mate"
  | "promotion"
  | "underpromotion"
  | "material-win"
  | "many-legal-alternatives"
  | "already-winning"
  | "hanging-queen"
  | "hanging-rook"
  | "hanging-minor-piece"
  | "defensive-resource"
  | "critical-capture"
  | "multiple-winning-alternatives"
  | "only-move-holding-result";

export interface SpecialPositionCase {
  id: string;
  fen: string;
  moveUci: string;
  provenance: string;
  expectedProperties: readonly CalibrationProperty[];
}

/**
 * Positions are calibration prompts, not subjective label goldens. Historical
 * cases are reconstructed from the cited public game score; the remaining
 * positions are purpose-built to isolate one policy property.
 */
export const SPECIAL_POSITION_CORPUS: readonly SpecialPositionCase[] = [
  {
    id: "opera-game-queen-offer",
    fen: "4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16",
    moveUci: "b3b8",
    provenance:
      "Paul Morphy–Duke Karl/Count Isouard, Paris 1858 (public historical game score), position before 16.Qb8+.",
    expectedProperties: ["historical-sacrifice", "queen-sacrifice"],
  },
  {
    id: "legal-trap-piece-offer",
    fen: "rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5",
    moveUci: "f3e5",
    provenance:
      "Légal trap teaching line reconstructed from its public historical move sequence; position before 5.Nxe5.",
    expectedProperties: ["historical-sacrifice", "piece-sacrifice"],
  },
  {
    id: "forced-king-move",
    fen: "7k/5K2/8/6Q1/8/8/8/8 b - - 0 1",
    moveUci: "h8h7",
    provenance: "Constructed: Black has exactly one legal move.",
    expectedProperties: ["forced-move"],
  },
  {
    id: "promotion-to-queen",
    fen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
    moveUci: "a7a8q",
    provenance: "Constructed promotion boundary case.",
    expectedProperties: ["promotion"],
  },
  {
    id: "underpromotion-to-knight",
    fen: "4k3/P7/8/8/8/8/8/4K3 w - - 0 1",
    moveUci: "a7a8n",
    provenance: "Constructed underpromotion boundary case.",
    expectedProperties: ["promotion", "underpromotion"],
  },
  {
    id: "obvious-mate-in-one",
    fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
    moveUci: "f7f8",
    provenance: "Constructed exposed-king mate-in-one.",
    expectedProperties: ["mate-in-one", "already-winning"],
  },
  {
    id: "mate-in-one-not-played",
    fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
    moveUci: "f7f3",
    provenance:
      "Constructed from the mate-in-one position to test a missed mate.",
    expectedProperties: ["missed-mate", "already-winning"],
  },
  {
    id: "routine-queen-recapture",
    fen: "4k3/8/8/8/8/8/4q3/4R1K1 w - - 0 1",
    moveUci: "e1e2",
    provenance: "Constructed hanging-queen recapture.",
    expectedProperties: ["routine-recapture", "material-win"],
  },
  {
    id: "unsupported-queen-offer",
    fen: "4k3/8/6p1/8/8/8/8/3QK3 w - - 0 1",
    moveUci: "d1h5",
    provenance: "Constructed queen offer with no tactical compensation.",
    expectedProperties: ["losing-sacrifice", "queen-sacrifice"],
  },
  {
    id: "immediate-queen-recovery",
    fen: "4k3/8/6p1/7q/8/8/7R/4K3 w - - 0 1",
    moveUci: "h2h5",
    provenance:
      "Constructed immediate queen capture; material is recovered at once.",
    expectedProperties: ["immediate-recovery", "routine-recapture"],
  },
  {
    id: "starting-position-e4",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moveUci: "e2e4",
    provenance: "Standard initial position; routine development control.",
    expectedProperties: ["routine-development", "many-legal-alternatives"],
  },
  {
    id: "starting-position-nf3",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moveUci: "g1f3",
    provenance: "Standard initial position; equivalent-candidate control.",
    expectedProperties: ["routine-development", "many-legal-alternatives"],
  },
  {
    id: "quiet-king-centralization",
    fen: "8/8/8/3k4/8/4K3/7P/8 w - - 0 1",
    moveUci: "e3d3",
    provenance:
      "Constructed pawn ending for quiet-move and depth-stability testing.",
    expectedProperties: ["quiet-move", "many-legal-alternatives"],
  },
  {
    id: "pseudo-sacrifice-check",
    fen: "4k3/4q3/8/8/8/8/4R3/4K3 w - - 0 1",
    moveUci: "e2e7",
    provenance:
      "Constructed checking queen capture: tactical appearance without sustained cost.",
    expectedProperties: [
      "pseudo-sacrifice",
      "immediate-recovery",
      "material-win",
    ],
  },
  {
    id: "hanging-rook-capture",
    fen: "k7/8/8/8/8/8/4r3/4Q1K1 w - - 0 1",
    moveUci: "e1e2",
    provenance: "Constructed: an undefended rook is immediately capturable.",
    expectedProperties: ["hanging-rook", "material-win"],
  },
  {
    id: "hanging-minor-capture",
    fen: "k7/8/8/8/8/8/4n3/4R1K1 w - - 0 1",
    moveUci: "e1e2",
    provenance: "Constructed: an undefended knight is immediately capturable.",
    expectedProperties: ["hanging-minor-piece", "material-win"],
  },
  {
    id: "hanging-queen-nonchecking",
    fen: "k7/8/8/8/8/8/4q3/4R1K1 w - - 0 1",
    moveUci: "e1e2",
    provenance: "Constructed: an undefended queen pickup gives no check.",
    expectedProperties: ["hanging-queen", "material-win"],
  },
  {
    id: "critical-checking-queen-capture",
    fen: "4k3/4q3/8/8/8/8/4R3/4K3 w - - 0 1",
    moveUci: "e2e7",
    provenance:
      "Constructed control: the material capture is also a forcing check.",
    expectedProperties: ["critical-capture", "material-win"],
  },
  {
    id: "two-hanging-rooks",
    fen: "k7/8/8/8/8/8/r3r3/Q3R1K1 w - - 0 1",
    moveUci: "e1e2",
    provenance:
      "Constructed control: two major pieces are available to capture.",
    expectedProperties: ["material-win", "multiple-winning-alternatives"],
  },
  {
    id: "defensive-rook-capture",
    fen: "6k1/5ppp/8/8/8/8/4qPPP/4R1K1 w - - 0 1",
    moveUci: "e1e2",
    provenance:
      "Constructed defensive control: capture the advanced queen before it attacks the king.",
    expectedProperties: ["defensive-resource", "critical-capture"],
  },
  {
    id: "quiet-back-rank-defense",
    fen: "6k1/5ppp/8/8/8/8/5PPP/5RK1 w - - 0 1",
    moveUci: "f1e1",
    provenance:
      "Constructed quiet-defense control with several legal alternatives.",
    expectedProperties: ["defensive-resource", "quiet-move"],
  },
] as const;
