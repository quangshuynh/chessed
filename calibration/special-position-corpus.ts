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
  | "only-move-holding-result"
  | "draw-preservation"
  | "mate-avoidance"
  | "perpetual-check"
  | "stalemate-resource"
  | "tactical-intermezzo";

export interface SpecialPositionCase {
  id: string;
  fen: string;
  moveUci: string;
  provenance: string;
  objectiveProperty?: string;
  falsificationValue?: string;
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
  {
    id: "reti-1921-drawing-king-move",
    fen: "7K/8/k1P5/7p/8/8/8/8 w - - 0 1",
    moveUci: "h8g7",
    provenance:
      "Richard Réti, 1921 endgame study, published position and solution 1.Kg7!: https://en.wikipedia.org/wiki/R%C3%A9ti_endgame_study",
    objectiveProperty:
      "The quiet diagonal king move preserves the draw by pursuing promotion and interception simultaneously.",
    falsificationValue:
      "Tests quiet draw preservation and objective uniqueness versus forced legality.",
    expectedProperties: [
      "defensive-resource",
      "quiet-move",
      "draw-preservation",
    ],
  },
  {
    id: "yates-marshall-1929-kb2",
    fen: "8/8/8/8/pK6/8/5P2/1k6 b - - 0 60",
    moveUci: "b1b2",
    provenance:
      "Yates–Marshall, 1929, published game position and drawing move 60...Kb2!: https://en.wikipedia.org/wiki/R%C3%A9ti_endgame_study#Yates_vs._Marshall",
    objectiveProperty:
      "The king move preserves the draw by combining pursuit of the pawn with support for promotion; 60...Kc2 loses.",
    falsificationValue:
      "Tests a quiet only-like drawing defense from a played game.",
    expectedProperties: [
      "defensive-resource",
      "quiet-move",
      "draw-preservation",
    ],
  },
  {
    id: "lasker-tarrasch-1914-h4",
    fen: "8/6K1/8/ppp2k2/8/1P6/1P5P/8 w - - 0 40",
    moveUci: "h2h4",
    provenance:
      "Lasker–Tarrasch, 1914, published game position and drawing maneuver 40.h4: https://en.wikipedia.org/wiki/R%C3%A9ti_endgame_study#Lasker_vs._Tarrasch",
    objectiveProperty:
      "The pawn move creates the tempo mechanism used to draw the pawn ending.",
    falsificationValue:
      "Tests a non-capture defensive intermezzo preserving equality.",
    expectedProperties: [
      "defensive-resource",
      "draw-preservation",
      "tactical-intermezzo",
    ],
  },
  {
    id: "hamppe-meitner-1872-perpetual",
    fen: "r1bk3r/2p2ppp/1pK5/p2pp3/8/P7/1PPP2PP/R1BQ2NR b - - 0 16",
    moveUci: "c8b7",
    provenance:
      "Hamppe–Meitner, Vienna 1872, published game position and perpetual-check resource 16...Bb7+: https://en.wikipedia.org/wiki/Perpetual_check#Hamppe_vs._Meitner",
    objectiveProperty:
      "The bishop check begins a forced perpetual despite Black's material deficit.",
    falsificationValue: "Tests a forcing draw resource and Black perspective.",
    expectedProperties: [
      "defensive-resource",
      "draw-preservation",
      "perpetual-check",
    ],
  },
  {
    id: "leko-kramnik-2008-perpetual",
    fen: "r6k/pp4pp/2p5/5Q2/7P/2q5/2P2PP1/1K1R3R b - - 0 24",
    moveUci: "c3b4",
    provenance:
      "Leko–Kramnik, Corus 2008, published position after 24.Qxf5 and drawing 24...Qb4+: https://en.wikipedia.org/wiki/Perpetual_check#Leko_vs._Kramnik",
    objectiveProperty:
      "The queen check initiates the documented perpetual-check draw.",
    falsificationValue:
      "Tests a Black defensive queen resource with many legal moves.",
    expectedProperties: [
      "defensive-resource",
      "draw-preservation",
      "perpetual-check",
    ],
  },
  {
    id: "fischer-tal-1960-perpetual",
    fen: "2k5/pp2n2Q/4q3/P2p4/P7/2p5/2P2PKP/5R2 b - - 0 21",
    moveUci: "e6g4",
    provenance:
      "Fischer–Tal, Leipzig Olympiad 1960, published position and drawing 21...Qg4+: https://en.wikipedia.org/wiki/Perpetual_check#Fischer_vs._Tal",
    objectiveProperty:
      "The queen check forces the documented perpetual and saves the draw.",
    falsificationValue:
      "Tests mate pressure, perpetual evidence, and Black perspective.",
    expectedProperties: [
      "defensive-resource",
      "draw-preservation",
      "perpetual-check",
      "mate-avoidance",
    ],
  },
  {
    id: "matulovic-minev-1956-stalemate",
    fen: "8/8/R7/7k/5P2/7K/r7/8 b - - 0 3",
    moveUci: "a2a6",
    provenance:
      "Matulović–Minev, 1956, published game position after 3.f4 and sole drawing 3...Rxa6!: https://en.wikipedia.org/wiki/Stalemate#Matulovi%C4%87_versus_Minev",
    objectiveProperty:
      "The rook capture offers stalemate after 4.Rxa6; other Black moves lose.",
    falsificationValue:
      "Tests a defensive capture whose material appearance hides a stalemate mechanism.",
    expectedProperties: [
      "defensive-resource",
      "critical-capture",
      "draw-preservation",
      "stalemate-resource",
    ],
  },
  {
    id: "rhine-2006-stalemate-study",
    fen: "2K4Q/8/1qkb2b1/2n5/2p4R/3NN3/1n6/1R6 w - - 0 1",
    moveUci: "d3e5",
    provenance:
      "Frederick Rhine, 2006 published White-to-draw study and solution 1.Ne5+: https://en.wikipedia.org/wiki/Stalemate#In_studies",
    objectiveProperty:
      "The knight check starts the published unique drawing sequence based on stalemate.",
    falsificationValue:
      "Tests a complex only-like defense, intermezzo, and eventual material sacrifice.",
    expectedProperties: [
      "defensive-resource",
      "draw-preservation",
      "stalemate-resource",
      "tactical-intermezzo",
    ],
  },
] as const;
