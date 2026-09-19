import type { EngineEvaluation, TerminalReason } from "@/lib/review/interfaces";
import type { WholeGameReview } from "@/lib/review/game-review";
import type { PlayerColor } from "@/lib/review/move-quality";

/**
 * Visualization bound in centipawns. Canonical evaluations are never rewritten;
 * this bound exists only so one decided position cannot flatten the whole axis.
 *
 * 1000 cp is deliberate rather than arbitrary: the frozen review methodology
 * already reads centipawns through `1 / (1 + exp(-cp / 410))`, which is 0.92 at
 * 1000 cp and barely moves afterwards. Beyond this bound the objective story is
 * "decided", so extra magnitude adds no readable information, while ordinary
 * evaluations under three pawns still occupy a useful share of the axis.
 */
export const EVALUATION_GRAPH_BOUND_CENTIPAWNS = 1000;

/** The same bound in pawn units, which is what the graph plots. */
export const EVALUATION_GRAPH_BOUND_PAWNS =
  EVALUATION_GRAPH_BOUND_CENTIPAWNS / 100;

export interface EvaluationGraphTerminal {
  reason: TerminalReason;
  /** White-relative winner; null for every drawn outcome. */
  winner: PlayerColor | null;
}

export interface EvaluationGraphPoint {
  /** Canonical Game Review position index; 0 is the starting position. */
  positionIndex: number;
  /** The ply that reached this position, or null for the starting position. */
  ply: number | null;
  /** Conventional fullmove number of the reaching move, or null at position 0. */
  moveNumber: number | null;
  /** The player who made the reaching move, or null at position 0. */
  player: PlayerColor | null;
  san: string | null;
  /** "Starting position", or conventional notation such as "18...Nxf3". */
  label: string;
  /** Canonical White-relative engine evaluation, or null when unavailable. */
  evaluation: EngineEvaluation | null;
  /** Set when the game ended at this position; the engine is never consulted. */
  terminal: EvaluationGraphTerminal | null;
  /** Bounded pawn value for plotting only; null when there is nothing to plot. */
  displayValue: number | null;
}

export interface EvaluationGraph {
  points: readonly EvaluationGraphPoint[];
  /** Symmetric display bound in pawns. */
  boundPawns: number;
  /** Positions with neither an evaluation nor a terminal outcome. */
  unavailablePointCount: number;
}

function clampPawns(centipawns: number): number {
  const bounded = Math.max(
    -EVALUATION_GRAPH_BOUND_CENTIPAWNS,
    Math.min(EVALUATION_GRAPH_BOUND_CENTIPAWNS, centipawns),
  );
  // Normalizing -0 keeps equality with 0 readable for callers and tests.
  return bounded === 0 ? 0 : bounded / 100;
}

/**
 * Pure display transform. Sign is preserved, zero stays zero, and mate is sent
 * to the matching boundary instead of being given a fake centipawn value.
 */
export function toGraphDisplayValue(
  evaluation: EngineEvaluation | null,
): number | null {
  if (!evaluation) return null;
  if (evaluation.kind === "mate") {
    if (!Number.isInteger(evaluation.moves) || evaluation.moves === 0) {
      return null;
    }
    return evaluation.moves > 0
      ? EVALUATION_GRAPH_BOUND_PAWNS
      : -EVALUATION_GRAPH_BOUND_PAWNS;
  }
  if (!Number.isFinite(evaluation.value)) return null;
  return clampPawns(evaluation.value);
}

/**
 * Terminal endpoints come from the recorded outcome, not from engine output.
 * A decided game reaches the matching boundary and a draw sits on equality.
 */
export function toTerminalDisplayValue(
  terminal: EvaluationGraphTerminal,
): number {
  if (terminal.winner === "white") return EVALUATION_GRAPH_BOUND_PAWNS;
  if (terminal.winner === "black") return -EVALUATION_GRAPH_BOUND_PAWNS;
  return 0;
}

/** Conventional notation for the move that reached a position. */
export function formatGraphPositionLabel(
  moveNumber: number,
  player: PlayerColor,
  san: string,
): string {
  return `${moveNumber}${player === "white" ? "." : "..."} ${san}`;
}

function startingPoint(review: WholeGameReview): EvaluationGraphPoint {
  const position = review.startingPosition;
  const evaluation =
    position?.status === "analyzed" ? position.analysis.evaluation : null;
  const terminal: EvaluationGraphTerminal | null =
    position?.status === "terminal"
      ? { reason: position.reason, winner: position.winner }
      : null;
  return {
    positionIndex: 0,
    ply: null,
    moveNumber: null,
    player: null,
    san: null,
    label: "Starting position",
    evaluation,
    terminal,
    displayValue: terminal
      ? toTerminalDisplayValue(terminal)
      : toGraphDisplayValue(evaluation),
  };
}

/**
 * Derives the graph purely from evidence the completed review already retains.
 * No engine work, no interpolation, and no invented points: a position with no
 * evaluation and no terminal outcome keeps a null `displayValue`.
 */
export function buildEvaluationGraph(review: WholeGameReview): EvaluationGraph {
  const points: EvaluationGraphPoint[] = [startingPoint(review)];

  for (const move of review.moves) {
    const terminal: EvaluationGraphTerminal | null = move.terminalOutcome
      ? {
          reason: move.terminalOutcome.reason,
          winner:
            move.terminalOutcome.result === "draw"
              ? null
              : move.terminalOutcome.result === "win"
                ? move.player
                : move.player === "white"
                  ? "black"
                  : "white",
        }
      : null;
    points.push({
      positionIndex: move.ply,
      ply: move.ply,
      moveNumber: move.moveNumber,
      player: move.player,
      san: move.san,
      label: formatGraphPositionLabel(move.moveNumber, move.player, move.san),
      evaluation: move.evaluationAfter,
      terminal,
      displayValue: terminal
        ? toTerminalDisplayValue(terminal)
        : toGraphDisplayValue(move.evaluationAfter),
    });
  }

  return {
    points,
    boundPawns: EVALUATION_GRAPH_BOUND_PAWNS,
    unavailablePointCount: points.filter(
      (point) => point.evaluation === null && point.terminal === null,
    ).length,
  };
}

/** Contiguous runs of plottable points, so gaps are never drawn through. */
export interface EvaluationGraphSegment {
  points: readonly (EvaluationGraphPoint & { displayValue: number })[];
}

export function toEvaluationGraphSegments(
  graph: EvaluationGraph,
): EvaluationGraphSegment[] {
  const segments: EvaluationGraphSegment[] = [];
  let current: (EvaluationGraphPoint & { displayValue: number })[] = [];
  for (const point of graph.points) {
    if (point.displayValue === null) {
      if (current.length > 0) segments.push({ points: current });
      current = [];
      continue;
    }
    current.push(point as EvaluationGraphPoint & { displayValue: number });
  }
  if (current.length > 0) segments.push({ points: current });
  return segments;
}

/** Nearest position index for a pointer at `ratio` across the plotted width. */
export function selectGraphPositionIndex(
  graph: EvaluationGraph,
  ratio: number,
): number {
  const last = graph.points.length - 1;
  if (last <= 0) return 0;
  const bounded = Math.max(0, Math.min(1, ratio));
  return Math.round(bounded * last);
}

/** Maximal runs of positions with nothing to plot, in position-index terms. */
export interface EvaluationGraphGap {
  startIndex: number;
  endIndex: number;
}

export function toEvaluationGraphGaps(
  graph: EvaluationGraph,
): EvaluationGraphGap[] {
  const gaps: EvaluationGraphGap[] = [];
  let open: EvaluationGraphGap | null = null;
  for (const point of graph.points) {
    if (point.displayValue === null) {
      if (open) open.endIndex = point.positionIndex;
      else
        open = {
          startIndex: point.positionIndex,
          endIndex: point.positionIndex,
        };
      continue;
    }
    if (open) {
      gaps.push(open);
      open = null;
    }
  }
  if (open) gaps.push(open);
  return gaps;
}
