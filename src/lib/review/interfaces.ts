export type MoveClassification =
  | "Brilliant"
  | "Great"
  | "Best"
  | "Good"
  | "Inaccuracy"
  | "Mistake"
  | "Miss"
  | "Blunder";

export interface EngineEvaluation {
  scoreCp?: number;
  mateIn?: number;
  bestLineUci: string[];
}

export interface PositionAnalysis {
  ply: number;
  fen: string;
  evaluation: EngineEvaluation;
}

export interface ReviewSummary {
  whiteAccuracy?: number;
  blackAccuracy?: number;
  whitePerformanceRating?: number;
  blackPerformanceRating?: number;
}

export interface ReviewedMove {
  ply: number;
  classification?: MoveClassification;
  evaluationBefore?: EngineEvaluation;
  evaluationAfter?: EngineEvaluation;
}

export interface ReviewResult {
  positions: PositionAnalysis[];
  moves: ReviewedMove[];
  summary: ReviewSummary;
}

export interface EngineAnalyzer {
  analyzePosition(fen: string): Promise<EngineEvaluation>;
}

export interface ChessedReviewEngine {
  reviewGame(input: {
    pgn: string;
    gameId?: string;
    source: "chesscom" | "manual-pgn";
  }): Promise<ReviewResult>;
}
