import { uciMoveToSan } from "@/lib/chess/notation";
import type { OrdinaryMoveClassification } from "@/lib/review/classification";
import type {
  ReviewMove,
  ReviewPlayerMetadata,
  WholeGameReview,
} from "@/lib/review/game-review";
import type {
  EngineEvaluation,
  GamePositionAnalysis,
  TerminalReason,
} from "@/lib/review/interfaces";
import type { MateTransition } from "@/lib/review/move-quality";
import type { SpecialMoveClassification } from "@/lib/review/special-classification";

/**
 * A pure Markdown rendering of an already-completed review. It reads only the
 * evidence the review retained: it never runs an engine, re-scores a move, or
 * reads the clock, so identical reviews always render byte-identical reports.
 */
export const REVIEW_REPORT_FORMAT_VERSION = "chessed-report-v1";

const NOT_RECORDED = "Not recorded";
const UNAVAILABLE = "Unavailable";

/** Descriptive PGN tags shown when present, in this fixed order. */
const DESCRIPTIVE_HEADERS = [
  ["Event", "Event"],
  ["Site", "Site"],
  ["Round", "Round"],
  ["ECO", "ECO"],
  ["Opening", "Opening"],
  ["Termination", "Termination"],
] as const;

const ORDINARY_LABELS: Record<OrdinaryMoveClassification, string> = {
  best: "Best",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

const SPECIAL_LABELS: Record<SpecialMoveClassification, string> = {
  brilliant: "Brilliant",
  great: "Great",
  miss: "Miss",
};

const TERMINAL_LABELS: Record<TerminalReason, string> = {
  checkmate: "Checkmate",
  stalemate: "Stalemate",
  "insufficient-material": "Draw by insufficient material",
  "threefold-repetition": "Draw by threefold repetition",
  "fifty-move-rule": "Draw by fifty-move rule",
  draw: "Draw",
};

const MATE_TRANSITION_LABELS: Record<MateTransition, string> = {
  "creates-forced-mate": "Creates forced mate",
  "newly-allows-forced-mate": "Allows forced mate",
  "throws-away-forced-mate": "Throws away forced mate",
  "escapes-forced-mate": "Escapes forced mate",
  "reverses-to-favorable-mate": "Reverses to favorable mate",
  "reverses-to-unfavorable-mate": "Reverses to unfavorable mate",
  "retains-favorable-mate": "Retains favorable mate",
  "retains-unfavorable-mate": "Retains unfavorable mate",
};

export class ReviewReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewReportError";
  }
}

export interface ReviewReportInput {
  review: WholeGameReview;
  /** Original PGN tag pairs; used only for descriptive, optional metadata. */
  headers?: Readonly<Record<string, string>>;
}

/**
 * Line breaks, other control characters, and bidirectional overrides become
 * spaces so user-controlled text cannot start a new Markdown block, break a
 * table row, or visually reorder surrounding report text.
 */
const UNSAFE_CHARACTERS =
  /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]+/g;

/** CommonMark allows any ASCII punctuation to be backslash-escaped. */
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/g;

function normalizeText(value: string): string {
  return value.replace(UNSAFE_CHARACTERS, " ").replace(/ {2,}/g, " ").trim();
}

/** Serialize arbitrary text as inert, single-line Markdown inline text. */
export function escapeMarkdownText(value: string): string {
  return normalizeText(value).replace(ASCII_PUNCTUATION, "\\$&");
}

/**
 * Engine- and chess.js-generated tokens (SAN, FEN, UCI) read best as code. Any
 * value that could escape a code span or a table cell is escaped as text.
 */
function code(value: string): string {
  const normalized = normalizeText(value);
  if (!normalized || /[`|\\]/.test(normalized)) {
    return escapeMarkdownText(normalized);
  }
  return `\`${normalized}\``;
}

function optionalHeader(
  headers: Readonly<Record<string, string>> | undefined,
  name: string,
): string | undefined {
  const value = headers?.[name];
  if (typeof value !== "string") return undefined;
  return known(value);
}

/** PGN marks unknown values with "?" (for example a "????.??.??" date). */
function known(value: string | undefined): string | undefined {
  return value === undefined || /^[?.\s]*$/.test(normalizeText(value))
    ? undefined
    : value;
}

function text(value: string | undefined): string {
  const recorded = known(value);
  return recorded === undefined ? NOT_RECORDED : escapeMarkdownText(recorded);
}

/** Matches the review UI's evaluation wording; mate is never converted. */
export function formatReportEvaluation(evaluation: EngineEvaluation): string {
  if (evaluation.kind === "mate") {
    return evaluation.moves < 0
      ? `-M${Math.abs(evaluation.moves)}`
      : `M${evaluation.moves}`;
  }
  if (evaluation.value === 0) return "0.00";
  const pawns = evaluation.value / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function table(headers: readonly string[], rows: readonly string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function player(metadata: ReviewPlayerMetadata): string {
  const name = text(metadata.name);
  return typeof metadata.rating === "number"
    ? `${name} (${metadata.rating})`
    : name;
}

function moveLabel(move: ReviewMove): string {
  return `${move.moveNumber}${move.player === "white" ? "." : "..."} ${move.san}`;
}

function classificationLabel(move: ReviewMove): string {
  const ordinary =
    move.classification.status === "classified"
      ? ORDINARY_LABELS[move.classification.classification]
      : UNAVAILABLE;
  return move.specialClassification
    ? `${SPECIAL_LABELS[move.specialClassification.classification]} (ordinary: ${ordinary})`
    : ordinary;
}

function evaluationAfter(move: ReviewMove): string {
  if (move.terminalOutcome) return TERMINAL_LABELS[move.terminalOutcome.reason];
  return move.evaluationAfter
    ? formatReportEvaluation(move.evaluationAfter)
    : UNAVAILABLE;
}

function loss(move: ReviewMove): string {
  if (move.centipawnLoss !== null) return String(move.centipawnLoss);
  if (move.mateTransition) return MATE_TRANSITION_LABELS[move.mateTransition];
  return "n/a";
}

function bestMove(move: ReviewMove): string {
  if (!move.bestMoveUci) return UNAVAILABLE;
  return code(
    uciMoveToSan(move.fenBefore, move.bestMoveUci) ?? move.bestMoveUci,
  );
}

function positionEvidence(position: GamePositionAnalysis | null): string {
  if (!position) return UNAVAILABLE;
  if (position.status === "terminal") return TERMINAL_LABELS[position.reason];
  return `${formatReportEvaluation(position.analysis.evaluation)} (depth ${position.analysis.limit.achievedDepth})`;
}

function finalPositionEvidence(review: WholeGameReview): string {
  const last = review.moves.at(-1);
  if (!last) return positionEvidence(review.startingPosition);
  if (last.terminalOutcome) return TERMINAL_LABELS[last.terminalOutcome.reason];
  if (!last.analysisAfter) return UNAVAILABLE;
  return `${formatReportEvaluation(last.analysisAfter.evaluation)} (depth ${last.analysisAfter.limit.achievedDepth})`;
}

function accuracyRow(
  color: string,
  accuracy: WholeGameReview["accuracy"]["white"],
): string[] {
  return [
    color,
    accuracy.value === null ? UNAVAILABLE : `${accuracy.value.toFixed(1)}%`,
    String(accuracy.scoredMoveCount),
    String(accuracy.unavailableMoveCount),
  ];
}

function assertCompleted(review: WholeGameReview): void {
  if (review.moves.length !== review.metadata.moveCount) {
    throw new ReviewReportError(
      "The review does not cover every move of the game.",
    );
  }
  review.moves.forEach((move, index) => {
    if (move.ply !== index + 1) {
      throw new ReviewReportError("The review's move order is inconsistent.");
    }
  });
}

/** Render a completed review as deterministic Markdown. Never mutates input. */
export function renderReviewReport({
  review,
  headers,
}: ReviewReportInput): string {
  assertCompleted(review);
  const { metadata, provenance, accuracy } = review;

  const gameRows: string[][] = [
    ["White", player(metadata.players.white)],
    ["Black", player(metadata.players.black)],
    ["Result", text(metadata.result)],
    ["Date", text(metadata.date)],
    ["Time control", text(metadata.timeControl)],
    ...DESCRIPTIVE_HEADERS.map(([label, name]) => [
      label,
      text(optionalHeader(headers, name)),
    ]),
    ["Moves", `${metadata.moveCount} plies`],
  ];

  const finalFen = review.moves.at(-1)?.fenAfter ?? metadata.startingFen;
  const positionRows: string[][] = [
    [
      "Starting position",
      metadata.customStartingPosition ? "Custom (PGN FEN tag)" : "Standard",
    ],
    ["Starting FEN", code(metadata.startingFen)],
    ["Starting evaluation", positionEvidence(review.startingPosition)],
    ["Final FEN", code(finalFen)],
    ["Final evaluation", finalPositionEvidence(review)],
  ];

  const countRows: string[][] = [
    ...(Object.keys(SPECIAL_LABELS) as SpecialMoveClassification[]).map(
      (key) => [SPECIAL_LABELS[key], String(review.specialCounts[key])],
    ),
    ...(Object.keys(ORDINARY_LABELS) as OrdinaryMoveClassification[]).map(
      (key) => [ORDINARY_LABELS[key], String(review.counts[key])],
    ),
    [UNAVAILABLE, String(review.counts.unavailable)],
  ];

  const moveRows = review.moves.map((move) => [
    String(move.ply),
    code(moveLabel(move)),
    classificationLabel(move),
    move.evaluationBefore
      ? formatReportEvaluation(move.evaluationBefore)
      : UNAVAILABLE,
    evaluationAfter(move),
    loss(move),
    bestMove(move),
    move.analysisBefore ? String(move.analysisBefore.limit.achievedDepth) : "—",
  ]);

  const confirmations = review.moves.flatMap((move) =>
    move.analysisBefore?.greatConfirmation
      ? [move.analysisBefore.greatConfirmation.status]
      : [],
  );
  const engines = provenance.engines.map((engine) =>
    escapeMarkdownText(
      engine.version ? `${engine.name} ${engine.version}` : engine.name,
    ),
  );
  const limits = provenance.requestedLimits.map(
    (limit) => `${limit.kind} ${limit.value}`,
  );
  const depthRange = provenance.achievedDepthRange;
  const analysisRows: string[][] = [
    ["Review methodology", code(provenance.methodologyVersion)],
    ["Accuracy methodology", code(accuracy.methodology.version)],
    ["Engine", engines.length > 0 ? engines.join(", ") : NOT_RECORDED],
    ["Requested limit", limits.length > 0 ? limits.join(", ") : NOT_RECORDED],
    [
      "Achieved depth",
      !depthRange
        ? NOT_RECORDED
        : depthRange.minimum === depthRange.maximum
          ? String(depthRange.minimum)
          : `${depthRange.minimum}–${depthRange.maximum}`,
    ],
    ["Analyzed positions", String(provenance.analyzedPositionCount)],
    ["Terminal positions", String(provenance.terminalPositionCount)],
    ["Unavailable positions", String(provenance.unavailablePositionCount)],
    [
      "Great-boundary confirmations",
      `${confirmations.filter((status) => status === "confirmed").length} confirmed, ${confirmations.filter((status) => status === "unavailable").length} unavailable`,
    ],
  ];

  const sections = [
    "# Chessed game review",
    [
      `Report format: ${code(REVIEW_REPORT_FORMAT_VERSION)}`,
      "",
      "Rendered locally from a completed Chessed review. No engine analysis was run to produce this report.",
      "Evaluations are White-relative: positive favors White and negative favors Black. `M3` means White can force mate in 3; `-M3` means Black can.",
    ].join("\n"),
    "## Game",
    table(["Field", "Value"], gameRows),
    "## Positions",
    table(["Field", "Value"], positionRows),
    "## Accuracy",
    table(
      ["Player", "Chessed Accuracy", "Scored moves", "Unavailable moves"],
      [
        accuracyRow("White", accuracy.white),
        accuracyRow("Black", accuracy.black),
      ],
    ),
    "## Classifications",
    "Brilliant, Great, and Miss are special labels shown in place of a move's ordinary classification; ordinary counts include every move.",
    table(["Classification", "Moves"], countRows),
    "## Moves",
    moveRows.length > 0
      ? table(
          [
            "Ply",
            "Move",
            "Classification",
            "Before",
            "After",
            "Loss (cp)",
            "Engine best",
            "Depth",
          ],
          moveRows,
        )
      : "No moves were played.",
    "## Analysis",
    table(["Field", "Value"], analysisRows),
  ];

  return `${sections.join("\n\n")}\n`;
}

function slug(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** A deterministic, filesystem-safe filename derived from review metadata. */
export function reviewReportFilename(review: WholeGameReview): string {
  const white = slug(review.metadata.players.white.name) || "white";
  const black = slug(review.metadata.players.black.name) || "black";
  const date = slug(known(review.metadata.date));
  return `chessed-review-${white}-vs-${black}${date ? `-${date}` : ""}.md`;
}
