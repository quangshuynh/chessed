import { createHash } from "node:crypto";

export const SPEC_VERSION = "performance-calibration-v2";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function header(pgn, name) {
  return new RegExp(`^\\[${name} "([^"]*)"\\]$`, "m").exec(pgn)?.[1];
}

export function normalizeGameId(value) {
  const id = value?.split("/").at(-1)?.toLowerCase();
  return id && /^[a-z0-9]{8}$/.test(id) ? id : null;
}

export function timeControlCategory(value) {
  const match = /^(\d+)\+(\d+)$/.exec(value ?? "");
  if (!match) return null;
  const estimatedSeconds = Number(match[1]) + 40 * Number(match[2]);
  if (estimatedSeconds < 30) return null;
  return {
    estimatedSeconds,
    category:
      estimatedSeconds < 180
        ? "bullet"
        : estimatedSeconds < 480
          ? "blitz"
          : estimatedSeconds < 1500
            ? "rapid"
            : "classical",
  };
}

export function quantile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function summarizeMoveEvidence(moves) {
  const accuracies = moves.map((move) => move.accuracy);
  const drops = moves.map((move) => move.outcomeDrop);
  return {
    accuracy:
      accuracies.length === 0
        ? null
        : (100 * accuracies.reduce((sum, value) => sum + value, 0)) /
          accuracies.length,
    medianMoveAccuracy: quantile(accuracies, 0.5),
    lowerQuartileMoveAccuracy: quantile(accuracies, 0.25),
    lowerDecileMoveAccuracy: quantile(accuracies, 0.1),
    severeErrorRate:
      drops.length === 0
        ? null
        : drops.filter((value) => value >= 0.15).length / drops.length,
    moderateErrorRate:
      drops.length === 0
        ? null
        : drops.filter((value) => value >= 0.075).length / drops.length,
    nearPerfectRate:
      accuracies.length === 0
        ? null
        : accuracies.filter((value) => value >= 0.99).length /
          accuracies.length,
    scoredMoveCount: moves.length,
  };
}

export function derivePlayerFeatures(moves) {
  const all = summarizeMoveEvidence(moves);
  const meaningfulMoves = moves.filter((move) => !move.onlyLegalMove);
  const meaningful = summarizeMoveEvidence(meaningfulMoves);
  return {
    ...all,
    meaningfulAccuracy: meaningful.accuracy,
    meaningfulLowerQuartile: meaningful.lowerQuartileMoveAccuracy,
    meaningfulSevereErrorRate: meaningful.severeErrorRate,
    meaningfulMoveCount: meaningful.scoredMoveCount,
  };
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
