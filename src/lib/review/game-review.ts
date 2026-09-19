import type { ParsedReviewGame } from "@/lib/chess/types";
import {
  classifyMove,
  type MoveClassification,
  type OrdinaryMoveClassification,
} from "@/lib/review/classification";
import type {
  AnalysisLimit,
  EngineEvaluation,
  EngineIdentity,
  GamePositionAnalysis,
  PositionAnalysis,
} from "@/lib/review/interfaces";
import {
  buildMoveQualityObservations,
  type MateTransition,
  type MoveOutcome,
  type MoveQualityObservation,
  type PlayerColor,
  type PlayerRelativeEvaluation,
} from "@/lib/review/move-quality";
import {
  classifySpecialMove,
  type SpecialClassificationResult,
  type SpecialMoveClassification,
} from "@/lib/review/special-classification";
import {
  calculateGameAccuracy,
  type GameAccuracy,
} from "@/lib/review/accuracy";

export const REVIEW_METHODOLOGY_VERSION = "chessed-review-v3";

export interface ReviewPlayerMetadata {
  color: PlayerColor;
  name?: string;
  rating?: number;
}

export interface ReviewGameMetadata {
  players: {
    white: ReviewPlayerMetadata;
    black: ReviewPlayerMetadata;
  };
  result?: string;
  timeControl?: string;
  date?: string;
  startingFen: string;
  customStartingPosition: boolean;
  /** Number of played half-moves (plies). */
  moveCount: number;
}

export interface ReviewMove {
  ply: number;
  moveNumber: number;
  player: PlayerColor;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  bestMoveUci: string | null;
  principalVariationUci: readonly string[];
  evaluationBefore: EngineEvaluation | null;
  evaluationAfter: EngineEvaluation | null;
  playerEvaluationBefore: PlayerRelativeEvaluation | null;
  playerOutcomeAfter: MoveOutcome | null;
  centipawnLoss: number | null;
  mateTransition: MateTransition | null;
  terminalOutcome: Extract<MoveOutcome, { kind: "terminal" }> | null;
  playedBestMove: boolean | null;
  classification: MoveClassification;
  specialClassification: SpecialClassificationResult | null;
  observation: MoveQualityObservation;
  analysisBefore: PositionAnalysis | null;
  analysisAfter: PositionAnalysis | null;
}

export interface ReviewAnalysisProvenance {
  methodologyVersion: typeof REVIEW_METHODOLOGY_VERSION;
  engines: readonly EngineIdentity[];
  requestedLimits: readonly AnalysisLimit[];
  achievedDepthRange: { minimum: number; maximum: number } | null;
  analyzedPositionCount: number;
  terminalPositionCount: number;
  unavailablePositionCount: number;
}

export type ClassificationCounts = Record<
  OrdinaryMoveClassification | "unavailable",
  number
>;

export interface WholeGameReview {
  metadata: ReviewGameMetadata;
  /**
   * Already-computed evidence for position 0. Every later position is retained
   * by the move that reached it, but the starting position belongs to no move.
   */
  startingPosition: GamePositionAnalysis | null;
  moves: readonly ReviewMove[];
  counts: ClassificationCounts;
  specialCounts: Record<SpecialMoveClassification, number>;
  accuracy: GameAccuracy;
  provenance: ReviewAnalysisProvenance;
}

function optionalHeader(
  headers: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  const value = headers[name]?.trim();
  return value && value !== "?" ? value : undefined;
}

function ratingHeader(
  headers: Readonly<Record<string, string>>,
  name: string,
): number | undefined {
  const value = optionalHeader(headers, name);
  if (!value || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

function metadata(game: ParsedReviewGame): ReviewGameMetadata {
  return {
    players: {
      white: {
        color: "white",
        name: optionalHeader(game.headers, "White"),
        rating: ratingHeader(game.headers, "WhiteElo"),
      },
      black: {
        color: "black",
        name: optionalHeader(game.headers, "Black"),
        rating: ratingHeader(game.headers, "BlackElo"),
      },
    },
    result: optionalHeader(game.headers, "Result"),
    timeControl: optionalHeader(game.headers, "TimeControl"),
    date: optionalHeader(game.headers, "Date"),
    startingFen: game.startingFen,
    customStartingPosition:
      game.headers.SetUp === "1" && Boolean(game.headers.FEN),
    moveCount: game.moves.length,
  };
}

function moveNumber(fenBefore: string): number {
  const value = Number(fenBefore.split(" ")[5]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("A reconstructed position has an invalid move number.");
  }
  return value;
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function buildProvenance(
  game: ParsedReviewGame,
  positions: readonly (GamePositionAnalysis | null | undefined)[],
): ReviewAnalysisProvenance {
  const available = positions.filter(
    (position): position is GamePositionAnalysis => Boolean(position),
  );
  const analyzed = available.filter(
    (position) => position.status === "analyzed",
  );
  const depths = analyzed.map(
    (position) => position.analysis.limit.achievedDepth,
  );
  return {
    methodologyVersion: REVIEW_METHODOLOGY_VERSION,
    engines: uniqueBy(
      analyzed.map((position) => position.analysis.engine),
      (engine) => `${engine.name}\0${engine.version ?? ""}`,
    ),
    requestedLimits: uniqueBy(
      analyzed.map((position) => position.analysis.limit.requested),
      (limit) => `${limit.kind}\0${limit.value}`,
    ),
    achievedDepthRange:
      depths.length === 0
        ? null
        : { minimum: Math.min(...depths), maximum: Math.max(...depths) },
    analyzedPositionCount: analyzed.length,
    terminalPositionCount: available.length - analyzed.length,
    unavailablePositionCount: game.positions.length - available.length,
  };
}

function emptyCounts(): ClassificationCounts {
  return {
    best: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    unavailable: 0,
  };
}

/** Purely composes trusted position, observation, and classification outputs. */
export function buildWholeGameReview(input: {
  game: ParsedReviewGame;
  positions: readonly (GamePositionAnalysis | null | undefined)[];
}): WholeGameReview {
  const observations = buildMoveQualityObservations(input);
  const positionsByIndex = new Map(
    input.positions.flatMap((position) =>
      position ? ([[position.positionIndex, position]] as const) : [],
    ),
  );
  const counts = emptyCounts();
  const specialCounts: Record<SpecialMoveClassification, number> = {
    great: 0,
    brilliant: 0,
    miss: 0,
  };
  const moves = input.game.moves.map((move, index): ReviewMove => {
    const observation = observations[index];
    if (!observation || observation.ply !== move.ply) {
      throw new Error(`Missing move-quality observation for ply ${move.ply}.`);
    }
    const beforePosition = positionsByIndex.get(index);
    const afterPosition = positionsByIndex.get(index + 1);
    const analysisBefore =
      beforePosition?.status === "analyzed" ? beforePosition.analysis : null;
    const analysisAfter =
      afterPosition?.status === "analyzed" ? afterPosition.analysis : null;
    const classification = classifyMove(observation);
    const terminalResult =
      observation.after?.kind === "terminal" ? observation.after.result : null;
    const specialClassification = classifySpecialMove({
      fenBefore: input.game.positions[index],
      playedMoveUci: move.uci,
      player: observation.player,
      ordinary: classification,
      analysisBefore,
      analysisAfter,
      terminalResult,
    });
    if (specialClassification) {
      specialCounts[specialClassification.classification] += 1;
    }
    counts[
      classification.status === "classified"
        ? classification.classification
        : "unavailable"
    ] += 1;
    return {
      ply: move.ply,
      moveNumber: moveNumber(input.game.positions[index]),
      player: observation.player,
      san: move.san,
      uci: move.uci,
      fenBefore: input.game.positions[index],
      fenAfter: input.game.positions[index + 1],
      bestMoveUci: observation.bestMoveUci,
      principalVariationUci: analysisBefore?.principalVariationUci ?? [],
      evaluationBefore: analysisBefore?.evaluation ?? null,
      evaluationAfter: analysisAfter?.evaluation ?? null,
      playerEvaluationBefore: observation.before,
      playerOutcomeAfter: observation.after,
      centipawnLoss:
        observation.loss.kind === "centipawns" ? observation.loss.value : null,
      mateTransition:
        observation.loss.kind === "mate-transition"
          ? observation.loss.transition
          : null,
      terminalOutcome:
        observation.after?.kind === "terminal" ? observation.after : null,
      playedBestMove: observation.playedBestMove,
      classification,
      specialClassification,
      observation,
      analysisBefore,
      analysisAfter,
    };
  });
  return {
    metadata: metadata(input.game),
    startingPosition: positionsByIndex.get(0) ?? null,
    moves,
    counts,
    specialCounts,
    accuracy: calculateGameAccuracy(moves),
    provenance: buildProvenance(input.game, input.positions),
  };
}
