/** Canonical scores are always from White's perspective: positive favors White. */
export type EngineEvaluation =
  | { kind: "centipawns"; perspective: "white"; value: number }
  | {
      kind: "mate";
      perspective: "white";
      /** Positive: White can force mate; negative: White is being mated. */
      moves: number;
    };

export interface DepthAnalysisLimit {
  kind: "depth";
  value: number;
}

export type AnalysisLimit = DepthAnalysisLimit;

export interface PositionAnalysisRequest {
  fen: string;
  limit?: AnalysisLimit;
  /** Bounded ranked engine candidates. The adapter clamps this to its policy. */
  candidateCount?: number;
  signal?: AbortSignal;
}

export interface EngineIdentity {
  name: string;
  version?: string;
}

export interface EngineCandidate {
  rank: number;
  moveUci: string;
  evaluation: EngineEvaluation;
  principalVariationUci: string[];
}

export interface PositionAnalysis {
  fen: string;
  evaluation: EngineEvaluation;
  bestMoveUci: string | null;
  principalVariationUci: string[];
  /** Ranked alternatives; omitted by legacy or incomplete analysis evidence. */
  candidates?: EngineCandidate[];
  limit: { requested: AnalysisLimit; achievedDepth: number };
  engine: EngineIdentity;
}

export interface AnalyzedGamePosition {
  status: "analyzed";
  /** Index into ParsedReviewGame.positions; 0 is the starting position. */
  positionIndex: number;
  /** The following move's ply, or null for the final position. */
  followingMovePly: number | null;
  analysis: PositionAnalysis;
}

export type TerminalReason =
  | "checkmate"
  | "stalemate"
  | "insufficient-material"
  | "threefold-repetition"
  | "fifty-move-rule"
  | "draw";

export interface TerminalGamePosition {
  status: "terminal";
  positionIndex: number;
  followingMovePly: null;
  fen: string;
  reason: TerminalReason;
  winner: "white" | "black" | null;
}

export type GamePositionAnalysis = AnalyzedGamePosition | TerminalGamePosition;

export interface EngineAnalyzer {
  analyzePosition(request: PositionAnalysisRequest): Promise<PositionAnalysis>;
  dispose(): void;
}
