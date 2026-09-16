import type { EngineEvaluation } from "@/lib/review/interfaces";

export interface ParsedUciInfo {
  depth: number;
  rank: number;
  evaluation: EngineEvaluation;
  principalVariationUci: string[];
}

export function parseUciInfo(
  line: string,
  sideToMove: "w" | "b",
): ParsedUciInfo | null {
  const depth = /(?:^|\s)depth (\d+)(?:\s|$)/.exec(line);
  const score = /(?:^|\s)score (cp|mate) (-?\d+)(?:\s|$)/.exec(line);
  const multiPv = /(?:^|\s)multipv (\d+)(?:\s|$)/.exec(line);
  const pv = /(?:^|\s)pv ((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)$/.exec(line);
  if (!line.startsWith("info ") || !depth || !score || !pv) return null;

  const rawValue = Number(score[2]);
  const whiteValue = sideToMove === "w" ? rawValue : -rawValue;
  return {
    depth: Number(depth[1]),
    rank: multiPv ? Number(multiPv[1]) : 1,
    evaluation:
      score[1] === "cp"
        ? { kind: "centipawns", perspective: "white", value: whiteValue }
        : { kind: "mate", perspective: "white", moves: whiteValue },
    principalVariationUci: pv[1].trim().split(/\s+/),
  };
}

export function parseBestMove(line: string): string | null | undefined {
  const match = /^bestmove (\S+)/.exec(line);
  if (!match) return undefined;
  return match[1] === "(none)" || match[1] === "0000" ? null : match[1];
}

export function parseEngineIdentity(
  line: string,
): { name: string; version?: string } | null {
  const match = /^id name (.+)$/.exec(line);
  if (!match) return null;
  const version = /Stockfish\s+([\w.-]+)/i.exec(match[1])?.[1];
  return { name: match[1], ...(version ? { version } : {}) };
}
