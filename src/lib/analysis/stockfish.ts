import { Chess } from "chess.js";

import {
  EngineAnalysisError,
  EngineInitializationError,
  EngineTimeoutError,
  InvalidFenError,
} from "@/lib/analysis/errors";
import {
  parseBestMove,
  parseEngineIdentity,
  parseUciInfo,
} from "@/lib/analysis/uci";
import type {
  EngineAnalyzer,
  EngineIdentity,
  PositionAnalysis,
  PositionAnalysisRequest,
} from "@/lib/review/interfaces";

export const DEFAULT_ANALYSIS_DEPTH = 12;
const DEFAULT_TIMEOUT_MS = 30_000;
const WORKER_URL = "/stockfish/stockfish-18-lite-single.js";

export interface UciWorker {
  postMessage(message: string): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<string>) => void,
  ): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<string>) => void,
  ): void;
  removeEventListener(
    type: "error",
    listener: (event: ErrorEvent) => void,
  ): void;
  terminate(): void;
}

export interface StockfishAnalyzerOptions {
  createWorker?: () => UciWorker;
  timeoutMs?: number;
}

export class StockfishAnalyzer implements EngineAnalyzer {
  private worker?: UciWorker;
  private initialization?: Promise<EngineIdentity>;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private activeCancellation?: (error: Error) => void;
  private readonly createWorker: () => UciWorker;
  private readonly timeoutMs: number;

  constructor(options: StockfishAnalyzerOptions = {}) {
    this.createWorker =
      options.createWorker ?? (() => new Worker(WORKER_URL) as UciWorker);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  analyzePosition(request: PositionAnalysisRequest): Promise<PositionAnalysis> {
    const task = this.queue.then(() => this.runAnalysis(request));
    this.queue = task.catch(() => undefined);
    return task;
  }

  dispose(): void {
    this.disposed = true;
    if (this.activeCancellation) {
      this.activeCancellation(
        new EngineAnalysisError("The analyzer was disposed."),
      );
    } else {
      this.resetWorker();
    }
  }

  private async initialize(): Promise<EngineIdentity> {
    if (this.disposed) {
      throw new EngineInitializationError("The analyzer has been disposed.");
    }
    if (this.initialization) return this.initialization;

    const worker = this.createWorker();
    this.worker = worker;
    this.initialization = new Promise((resolve, reject) => {
      let identity: EngineIdentity = { name: "Stockfish" };
      const fail = (error: Error) => {
        clearTimeout(timer);
        this.activeCancellation = undefined;
        this.resetWorker();
        reject(error);
      };
      const timer = setTimeout(
        () => fail(new EngineInitializationError()),
        this.timeoutMs,
      );
      const onError = () => fail(new EngineInitializationError());
      const onMessage = (event: MessageEvent<string>) => {
        const line = String(event.data).trim();
        identity = parseEngineIdentity(line) ?? identity;
        if (line === "uciok") worker.postMessage("isready");
        if (line === "readyok") {
          clearTimeout(timer);
          this.activeCancellation = undefined;
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onError);
          resolve(identity);
        }
      };
      worker.addEventListener("error", onError);
      worker.addEventListener("message", onMessage);
      this.activeCancellation = fail;
      worker.postMessage("uci");
    });
    return this.initialization;
  }

  private async runAnalysis(
    request: PositionAnalysisRequest,
  ): Promise<PositionAnalysis> {
    if (request.signal?.aborted) {
      throw request.signal.reason ?? new DOMException("Aborted", "AbortError");
    }
    let chess: Chess;
    try {
      chess = new Chess(request.fen);
    } catch {
      throw new InvalidFenError();
    }

    const requested = request.limit ?? {
      kind: "depth" as const,
      value: DEFAULT_ANALYSIS_DEPTH,
    };
    if (
      !Number.isInteger(requested.value) ||
      requested.value < 1 ||
      requested.value > 99
    ) {
      throw new RangeError(
        "Analysis depth must be an integer from 1 through 99.",
      );
    }

    const identity = await this.initialize();
    const worker = this.worker;
    if (!worker) throw new EngineInitializationError();

    return new Promise((resolve, reject) => {
      let latest: ReturnType<typeof parseUciInfo> = null;
      let settled = false;
      const finish = (error?: Error, bestMove?: string | null) => {
        if (settled) return;
        settled = true;
        this.activeCancellation = undefined;
        clearTimeout(timer);
        request.signal?.removeEventListener("abort", abort);
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        if (error) {
          this.resetWorker();
          reject(error);
        } else if (!latest || bestMove === undefined) {
          this.resetWorker();
          reject(
            new EngineAnalysisError(
              "Stockfish returned no usable principal variation.",
            ),
          );
        } else {
          resolve({
            fen: chess.fen(),
            evaluation: latest.evaluation,
            bestMoveUci: bestMove,
            principalVariationUci: latest.principalVariationUci,
            limit: { requested, achievedDepth: latest.depth },
            engine: identity,
          });
        }
      };
      const abort = () => {
        worker.postMessage("stop");
        finish(
          request.signal?.reason ?? new DOMException("Aborted", "AbortError"),
        );
      };
      const timer = setTimeout(() => {
        worker.postMessage("stop");
        finish(new EngineTimeoutError());
      }, this.timeoutMs);

      this.activeCancellation = (error) => {
        worker.postMessage("stop");
        finish(error);
      };
      request.signal?.addEventListener("abort", abort, { once: true });
      const onError = () => finish(new EngineAnalysisError());
      const onMessage = (event: MessageEvent<string>) => {
        if (settled) return;
        const line = String(event.data).trim();
        const info = parseUciInfo(line, chess.turn());
        if (info && (!latest || info.depth >= latest.depth)) latest = info;
        const bestMove = parseBestMove(line);
        if (bestMove !== undefined) finish(undefined, bestMove);
      };
      worker.addEventListener("error", onError);
      worker.addEventListener("message", onMessage);
      worker.postMessage(`position fen ${chess.fen()}`);
      worker.postMessage(`go depth ${requested.value}`);
    });
  }

  private resetWorker(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.initialization = undefined;
  }
}
