import { describe, expect, it, vi } from "vitest";

import { InvalidFenError } from "@/lib/analysis/errors";
import { StockfishAnalyzer, type UciWorker } from "@/lib/analysis/stockfish";

class FakeWorker implements UciWorker {
  readonly commands: string[] = [];
  readonly terminate = vi.fn();
  private readonly messages: Array<(event: MessageEvent<string>) => void> = [];

  postMessage(message: string): void {
    this.commands.push(message);
    if (message === "uci") {
      queueMicrotask(() => {
        this.emit("id name Stockfish 18 Lite");
        this.emit("uciok");
      });
    }
    if (message === "isready") queueMicrotask(() => this.emit("readyok"));
    if (message.startsWith("go depth")) {
      queueMicrotask(() => {
        this.emit("info depth 7 multipv 1 score cp 31 nodes 100 pv e2e4 e7e5");
        this.emit("info depth 7 multipv 2 score cp 22 nodes 100 pv d2d4 d7d5");
        this.emit("info depth 7 multipv 3 score cp 10 nodes 100 pv g1f3 g8f6");
        this.emit("bestmove e2e4 ponder e7e5");
      });
    }
  }

  addEventListener(type: "message" | "error", listener: never): void {
    if (type === "message") this.messages.push(listener);
  }

  removeEventListener(type: "message" | "error", listener: never): void {
    if (type === "message") {
      const index = this.messages.indexOf(listener);
      if (index >= 0) this.messages.splice(index, 1);
    }
  }

  emit(line: string): void {
    for (const listener of this.messages) {
      listener({ data: line } as MessageEvent<string>);
    }
  }
}

describe("StockfishAnalyzer", () => {
  it("analyzes an arbitrary custom FEN and returns normalized data", async () => {
    const worker = new FakeWorker();
    const analyzer = new StockfishAnalyzer({ createWorker: () => worker });
    const result = await analyzer.analyzePosition({
      fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
      limit: { kind: "depth", value: 7 },
      candidateCount: 3,
    });
    expect(result.evaluation).toEqual({
      kind: "centipawns",
      perspective: "white",
      value: 31,
    });
    expect(result.bestMoveUci).toBe("e2e4");
    expect(result.principalVariationUci).toEqual(["e2e4", "e7e5"]);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates?.[1]).toMatchObject({
      rank: 2,
      moveUci: "d2d4",
      evaluation: { kind: "centipawns", value: 22 },
    });
    expect(worker.commands).toContain("setoption name MultiPV value 3");
    expect(result.limit).toEqual({
      requested: { kind: "depth", value: 7 },
      achievedDepth: 7,
    });
    expect(worker.commands.filter((command) => command === "uci")).toHaveLength(
      1,
    );
    analyzer.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects invalid FEN before creating a worker", async () => {
    const createWorker = vi.fn(() => new FakeWorker());
    const analyzer = new StockfishAnalyzer({ createWorker });
    await expect(
      analyzer.analyzePosition({ fen: "invalid" }),
    ).rejects.toBeInstanceOf(InvalidFenError);
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("does not initialize when already cancelled", async () => {
    const worker = new FakeWorker();
    const analyzer = new StockfishAnalyzer({ createWorker: () => worker });
    const controller = new AbortController();
    controller.abort();
    await expect(
      analyzer.analyzePosition({
        fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.commands).toHaveLength(0);
  });
});
