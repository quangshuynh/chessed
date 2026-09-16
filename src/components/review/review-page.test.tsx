// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parsePgnToReviewGame } from "@/lib/chess/pgn";
import type { WholeGameReview } from "@/lib/review/game-review";
import type { EngineAnalyzer, EngineEvaluation } from "@/lib/review/interfaces";
import type { ReviewSessionPayload } from "@/lib/review/session-store";

import { ReviewPage } from "./review-page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: { position: string } }) => (
    <div data-testid="board" data-position={options.position} />
  ),
}));

afterEach(() => cleanup());

const pgn = "1. e4 e5 2. Nf3 Nc6 3. Bb5";
const game = parsePgnToReviewGame(pgn);
const session: ReviewSessionPayload = {
  source: "manual-pgn",
  pgn,
  createdAt: "2026-09-15T12:00:00.000Z",
  summary: { id: "game", white: "Alice", black: "Bob" },
};
const cp = (value: number): EngineEvaluation => ({
  kind: "centipawns",
  perspective: "white",
  value,
});

function fakeReview(): WholeGameReview {
  const classes = ["best", "good", "inaccuracy", "mistake", "blunder"] as const;
  return {
    metadata: {
      players: { white: { color: "white" }, black: { color: "black" } },
      startingFen: game.startingFen,
      customStartingPosition: false,
      moveCount: 5,
    },
    moves: game.moves.map((move, index) => ({
      ply: move.ply,
      moveNumber: Math.floor(index / 2) + 1,
      player: index % 2 === 0 ? "white" : "black",
      san: move.san,
      uci: move.uci,
      fenBefore: game.positions[index],
      fenAfter: game.positions[index + 1],
      bestMoveUci: index === 0 ? "e2e4" : null,
      principalVariationUci: index === 0 ? ["e2e4", "e7e5"] : [],
      evaluationBefore:
        index === 1
          ? cp(-142)
          : index === 4
            ? { kind: "mate", perspective: "white", moves: 3 }
            : cp(index * 10),
      evaluationAfter: cp(index * 10 - 5),
      playerEvaluationBefore: null,
      playerOutcomeAfter: null,
      centipawnLoss: index * 10,
      mateTransition: null,
      terminalOutcome: null,
      playedBestMove: index === 0,
      classification: {
        status: "classified",
        classification: classes[index],
        evidence: {} as never,
      },
      specialClassification: null,
      observation: {} as never,
      analysisBefore: null,
      analysisAfter: null,
    })),
    counts: {
      best: 1,
      good: 1,
      inaccuracy: 1,
      mistake: 1,
      blunder: 1,
      unavailable: 0,
    },
    specialCounts: { great: 0, brilliant: 0, miss: 0 },
    provenance: {
      methodologyVersion: "chessed-review-v3",
      engines: [],
      requestedLimits: [],
      achievedDepthRange: null,
      analyzedPositionCount: 6,
      terminalPositionCount: 0,
      unavailablePositionCount: 0,
    },
  };
}

function analyzer() {
  return {
    analyzePosition: vi.fn(),
    dispose: vi.fn(),
  } satisfies EngineAnalyzer;
}

function renderPage(
  options: {
    reviewRunner?: typeof import("@/lib/analysis/review-game").reviewGame;
    analyzerFactory?: () => EngineAnalyzer;
  } = {},
) {
  return render(
    <ReviewPage
      sessionId="session"
      sessionReader={() => session}
      analyzerFactory={options.analyzerFactory ?? analyzer}
      reviewRunner={options.reviewRunner}
    />,
  );
}

async function loaded() {
  await screen.findByRole("button", { name: "Analyze Game" });
}

describe("review-page analysis workflow", () => {
  it("explains a missing browser session", async () => {
    render(<ReviewPage sessionId="missing" sessionReader={() => undefined} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/Review session not found/)).toBeTruthy();
  });

  it("does not start analysis automatically and keeps initial navigation usable", async () => {
    const runner = vi.fn();
    renderPage({ reviewRunner: runner });
    await loaded();
    expect(runner).not.toHaveBeenCalled();
    expect(screen.getByText(/Engine review has not been run/)).toBeTruthy();
    expect(screen.getByText(/Starting position/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText(/Ply 1/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText(/Starting position/)).toBeTruthy();
  });

  it("starts exactly once, reports real progress, and prevents a duplicate start", async () => {
    let resolve!: (review: WholeGameReview) => void;
    const pending = new Promise<WholeGameReview>((value) => {
      resolve = value;
    });
    const runner = vi.fn(async ({ onProgress }) => {
      onProgress?.({
        phase: "analysis",
        completedPositions: 2,
        totalPositions: 6,
      });
      return pending;
    });
    const factory = vi.fn(analyzer);
    renderPage({ reviewRunner: runner, analyzerFactory: factory });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Game" }));
    expect(await screen.findByText("Analyzing 2 / 6 steps")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Analyze Game" })).toBeNull();
    expect(runner).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(1);
    await act(async () => resolve(fakeReview()));
  });

  it("cancels without partial results, disposes, and permits retry", async () => {
    const analyzers = [analyzer(), analyzer()];
    const runner = vi.fn(
      ({ signal, onProgress }) =>
        new Promise<WholeGameReview>((resolve, reject) => {
          onProgress?.({
            phase: "analysis",
            completedPositions: 1,
            totalPositions: 6,
          });
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          void resolve;
        }),
    );
    renderPage({
      reviewRunner: runner,
      analyzerFactory: () => analyzers.shift()!,
    });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Game" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel analysis" }),
    );
    expect(await screen.findByText(/No partial review was kept/)).toBeTruthy();
    expect(screen.queryByText("Best")).toBeNull();
    expect(analyzers).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Analyze Again" }));
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("resets progress on a repeated run and ignores stale completion", async () => {
    const first = Promise.withResolvers<WholeGameReview>();
    const second = Promise.withResolvers<WholeGameReview>();
    const runner = vi
      .fn()
      .mockImplementationOnce(async ({ onProgress }) => {
        onProgress?.({
          phase: "confirmation",
          completedPositions: 8,
          totalPositions: 9,
        });
        return first.promise;
      })
      .mockImplementationOnce(() => second.promise);
    renderPage({ reviewRunner: runner });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Game" }));
    expect(await screen.findByText("Analyzing 8 / 9 steps")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel analysis" }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze Again" }));
    expect(await screen.findByText("Analyzing 0 / 6 steps")).toBeTruthy();

    await act(async () => first.resolve(fakeReview()));
    expect(screen.getByText("Analyzing 0 / 6 steps")).toBeTruthy();
    await act(async () => second.resolve(fakeReview()));
    expect(await screen.findByText("Engine evaluation:")).toBeTruthy();
  });

  it("shows a safe failure and retries", async () => {
    const runner = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret stack details"))
      .mockResolvedValueOnce(fakeReview());
    renderPage({ reviewRunner: runner });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Game" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "The game could not be analyzed",
    );
    expect(screen.queryByText(/secret stack/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Again" }));
    await screen.findByText("Engine evaluation:");
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it("rejects completed review data that does not match the loaded game", async () => {
    const invalidReview = fakeReview();
    invalidReview.metadata.moveCount = 4;
    renderPage({ reviewRunner: vi.fn().mockResolvedValue(invalidReview) });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Game" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "could not be analyzed",
    );
    expect(screen.queryByText("Best")).toBeNull();
  });

  it("maps initial, White, Black, final, and every ordinary classification without sign flipping", async () => {
    renderPage({ reviewRunner: vi.fn().mockResolvedValue(fakeReview()) });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Game" }));
    await screen.findByText("Engine evaluation:");
    expect(screen.getByText("0.00")).toBeTruthy();
    for (const label of ["Best", "Good", "Inaccuracy", "Mistake", "Blunder"])
      expect(screen.getByText(label)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /2\. e5/ }));
    expect(screen.getByText("1... e5")).toBeTruthy();
    expect(screen.getByText("-1.42")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /5\. Bb5/ }));
    expect(screen.getByText("3. Bb5")).toBeTruthy();
    expect(screen.getByText("M3")).toBeTruthy();
  });

  it("shows composed special labels while retaining ordinary review data", async () => {
    const review = fakeReview();
    (["great", "brilliant", "miss"] as const).forEach((value, index) => {
      review.moves[index].specialClassification = {
        classification: value,
        evidence: {} as never,
      };
    });
    renderPage({ reviewRunner: vi.fn().mockResolvedValue(review) });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Game" }));
    for (const label of ["Great", "Brilliant", "Miss"]) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
    expect(review.moves[0].classification).toMatchObject({
      classification: "best",
    });
  });

  it("shows unavailable evidence and terminal checkmate/draw semantics", async () => {
    const review = fakeReview();
    review.moves[0].classification = {
      status: "unavailable",
      reason: "missing-after-analysis",
    };
    review.moves[3].evaluationAfter = null;
    review.moves[3].terminalOutcome = {
      kind: "terminal",
      reason: "checkmate",
      result: "win",
    };
    review.moves[4].evaluationAfter = null;
    review.moves[4].terminalOutcome = {
      kind: "terminal",
      reason: "stalemate",
      result: "draw",
    };
    renderPage({ reviewRunner: vi.fn().mockResolvedValue(review) });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Game" }));
    await screen.findByText("Engine evaluation:");
    fireEvent.click(screen.getByRole("button", { name: /1\. e4/ }));
    expect(screen.getByText("e4")).toBeTruthy();
    expect(screen.getByText("1. e4 e5")).toBeTruthy();
    expect(screen.queryByText("e2e4")).toBeNull();
    expect(screen.getByText(/required to classify/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /4\. Nc6/ }));
    expect(screen.getByText(/Checkmate \(win\)/)).toBeTruthy();
    expect(screen.getByText("Terminal position")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /5\. Bb5/ }));
    expect(screen.getByText(/Stalemate \(draw\)/)).toBeTruthy();
  });

  it("disposes a running analyzer on unmount and ignores late completion", async () => {
    const instance = analyzer();
    let resolve!: (review: WholeGameReview) => void;
    const runner = vi.fn(
      () =>
        new Promise<WholeGameReview>((value) => {
          resolve = value;
        }),
    );
    const view = renderPage({
      reviewRunner: runner,
      analyzerFactory: () => instance,
    });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Analyze Game" }));
    view.unmount();
    expect(instance.dispose).toHaveBeenCalledTimes(1);
    await act(async () => resolve(fakeReview()));
  });
});
