// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    onError,
  }: {
    src: string;
    alt: string;
    onError?: () => void;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={onError} />
  ),
}));
vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: { position: string; boardOrientation: "white" | "black" };
  }) => (
    <div
      data-testid="board"
      data-position={options.position}
      data-orientation={options.boardOrientation}
    />
  ),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

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
    profileLoader?: (
      username: string,
    ) => Promise<import("@/lib/sources/chesscom/types").ChessComPlayerProfile>;
    soundPlayer?: (sound: import("@/lib/chess/move-sound").MoveSound) => void;
    session?: ReviewSessionPayload;
  } = {},
) {
  return render(
    <ReviewPage
      sessionId="session"
      sessionReader={() => options.session ?? session}
      analyzerFactory={options.analyzerFactory ?? analyzer}
      reviewRunner={options.reviewRunner}
      profileLoader={options.profileLoader}
      soundPlayer={options.soundPlayer ?? vi.fn()}
    />,
  );
}

async function loaded() {
  await screen.findByRole("button", { name: "Analyze Game" });
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("review-page analysis workflow", () => {
  it.each([
    ["WhiteUser", "white", "WhiteUser", "BlackUser"],
    ["bLaCkUsEr", "black", "BlackUser", "WhiteUser"],
  ] as const)(
    "orients an imported review for %s and places the matching card at the bottom",
    async (requestedUsername, orientation, bottomName, topName) => {
      renderPage({
        session: {
          ...session,
          source: "chesscom",
          summary: {
            id: "game",
            requestedUsername,
            white: "WhiteUser",
            black: "BlackUser",
          },
        },
      });
      await loaded();
      expect(screen.getByTestId("board").dataset.orientation).toBe(orientation);
      expect(
        document.querySelector('[data-board-side="bottom"]')?.textContent,
      ).toContain(bottomName);
      expect(
        document.querySelector('[data-board-side="top"]')?.textContent,
      ).toContain(topName);
      expect(
        document
          .querySelector('[data-player-role="reviewed"]')
          ?.getAttribute("data-board-side"),
      ).toBe("bottom");
    },
  );

  it("defaults manual PGN to White and flips board and cards without changing ply or move order", async () => {
    renderPage();
    await loaded();
    const board = screen.getByTestId("board");
    expect(board.dataset.orientation).toBe("white");
    expect(
      document.querySelector('[data-board-side="bottom"]')?.textContent,
    ).toContain("Alice");
    fireEvent.click(screen.getByRole("button", { name: "White move Nf3" }));
    fireEvent.click(screen.getByRole("button", { name: /Flip board/ }));
    expect(board.dataset.orientation).toBe("black");
    expect(board.dataset.position).toBe(game.positions[3]);
    expect(
      document.querySelector('[data-board-side="bottom"]')?.textContent,
    ).toContain("Bob");
    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual(["", "White", "Black"]);
  });

  it("resets a manual flip to each newly selected game's reviewed-player perspective", async () => {
    const sessions: Record<string, ReviewSessionPayload> = {
      black: {
        ...session,
        source: "chesscom",
        summary: {
          id: "black-game",
          requestedUsername: "Bob",
          white: "Alice",
          black: "Bob",
        },
      },
      white: {
        ...session,
        source: "chesscom",
        summary: {
          id: "white-game",
          requestedUsername: "Alice",
          white: "Alice",
          black: "Bob",
        },
      },
    };
    const view = render(
      <ReviewPage
        sessionId="black"
        sessionReader={(id) => sessions[id]}
        analyzerFactory={analyzer}
        soundPlayer={vi.fn()}
      />,
    );
    await loaded();
    expect(screen.getByTestId("board").dataset.orientation).toBe("black");
    fireEvent.click(screen.getByRole("button", { name: /Flip board/ }));
    expect(screen.getByTestId("board").dataset.orientation).toBe("white");
    view.rerender(
      <ReviewPage
        sessionId="white"
        sessionReader={(id) => sessions[id]}
        analyzerFactory={analyzer}
        soundPlayer={vi.fn()}
      />,
    );
    await loaded();
    expect(screen.getByTestId("board").dataset.orientation).toBe("white");
    expect(
      document.querySelector('[data-board-side="bottom"]')?.textContent,
    ).toContain("Alice");
  });

  it("loads correctly associated profiles only for trustworthy Chess.com sessions", async () => {
    const chessComSession: ReviewSessionPayload = {
      ...session,
      source: "chesscom",
      summary: {
        id: "game",
        white: "WhiteUser",
        black: "BlackUser",
        whiteRating: 1800,
        blackRating: 1700,
      },
    };
    const loader = vi.fn(async (username: string) => ({
      username,
      avatarUrl: `https://images.chesscomfiles.com/uploads/v1/user/${username}.png`,
      profileUrl: `https://www.chess.com/member/${username}`,
    }));
    renderPage({ session: chessComSession, profileLoader: loader });
    await loaded();
    await waitFor(() =>
      expect(document.querySelectorAll("img")).toHaveLength(2),
    );
    expect(loader.mock.calls.map(([name]) => name)).toEqual([
      "WhiteUser",
      "BlackUser",
    ]);
    const white = document.querySelector('[data-player-color="white"]')!;
    const black = document.querySelector('[data-player-color="black"]')!;
    expect(white.textContent).toContain("WhiteUser");
    expect(white.querySelector("img")?.getAttribute("src")).toContain(
      "WhiteUser",
    );
    expect(black.textContent).toContain("BlackUser");
    expect(black.querySelector("img")?.getAttribute("src")).toContain(
      "BlackUser",
    );
    fireEvent.error(white.querySelector("img")!);
    expect(white.querySelector("img")).toBeNull();
    expect(white.textContent).toContain("W");
  });

  it("never queries manual PGN names and renders neutral avatar fallbacks", async () => {
    const loader = vi.fn();
    renderPage({ profileLoader: loader });
    await loaded();
    expect(loader).not.toHaveBeenCalled();
    expect(
      document.querySelector('[data-player-color="white"]')?.textContent,
    ).toContain("Alice");
    expect(document.querySelectorAll("[data-player-color] img")).toHaveLength(
      0,
    );
  });

  it("keeps fallbacks usable when profile lookup fails or has no avatar", async () => {
    const chessComSession: ReviewSessionPayload = {
      ...session,
      source: "chesscom",
    };
    const loader = vi.fn(async (username: string) => {
      if (username === "Alice") throw new Error("offline");
      return { username, avatarUrl: null, profileUrl: null };
    });
    renderPage({ session: chessComSession, profileLoader: loader });
    await loaded();
    await act(async () => Promise.resolve());
    expect(document.querySelectorAll("[data-player-color] img")).toHaveLength(
      0,
    );
    expect(screen.getAllByText("A")).toHaveLength(1);
    expect(screen.getAllByText("B")).toHaveLength(1);
  });

  it("plays at most one destination sound per deliberate navigation and none at start", async () => {
    const player = vi.fn();
    renderPage({ soundPlayer: player });
    await loaded();
    expect(player).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "White move Bb5" }));
    expect(player).toHaveBeenCalledTimes(1);
    expect(player).toHaveBeenLastCalledWith("move");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(player).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText(/Starting position/)).toBeTruthy();
    expect(player).toHaveBeenCalledTimes(5);
  });

  it("mutes immediately, persists the preference, and does not replay on rerender", async () => {
    const player = vi.fn();
    renderPage({ soundPlayer: player });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Mute move sounds" }));
    fireEvent.click(screen.getByRole("button", { name: "White move e4" }));
    expect(player).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("chessed.sound.enabled.v1")).toBe(
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Unmute move sounds" }));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(player).toHaveBeenCalledTimes(1);
  });

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

  it("keeps White and Black cells mapped to their own ply during click and keyboard navigation", async () => {
    renderPage();
    await loaded();
    expect(screen.queryByRole("button", { current: "step" })).toBeNull();

    const white = screen.getByRole("button", { name: "White move e4" });
    const black = screen.getByRole("button", { name: "Black move e5" });
    expect(white.closest('[role="row"]')).toBe(black.closest('[role="row"]'));

    fireEvent.click(white);
    expect(white.getAttribute("aria-current")).toBe("step");
    expect(screen.getByTestId("board").getAttribute("data-position")).toBe(
      game.positions[1],
    );

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(black.getAttribute("aria-current")).toBe("step");
    expect(screen.getByTestId("board").getAttribute("data-position")).toBe(
      game.positions[2],
    );

    fireEvent.keyDown(window, { key: "ArrowRight" });
    const nextWhite = screen.getByRole("button", { name: "White move Nf3" });
    expect(nextWhite.getAttribute("aria-current")).toBe("step");
    expect(nextWhite.closest('[role="row"]')).not.toBe(
      black.closest('[role="row"]'),
    );
  });

  it("scrolls only an out-of-view selected cell and respects reduced motion", async () => {
    renderPage();
    await loaded();
    const grid = screen.getByRole("grid", { name: "Move history" });
    const target = screen.getByRole("button", { name: "White move Bb5" });
    grid.getBoundingClientRect = () => ({ top: 0, bottom: 100 }) as DOMRect;
    target.getBoundingClientRect = () => ({ top: 120, bottom: 160 }) as DOMRect;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    vi.stubGlobal("matchMedia", () => ({ matches: true }));

    target.focus();
    fireEvent.click(target);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      behavior: "auto",
    });
    expect(document.activeElement).toBe(target);
    vi.unstubAllGlobals();
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
    fireEvent.click(screen.getByRole("button", { name: /Black move e5/ }));
    expect(screen.getByText("1... e5")).toBeTruthy();
    expect(screen.getByText("-1.42")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /White move Bb5/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /White move e4/ }));
    expect(screen.getAllByText("e4")).toHaveLength(2);
    expect(screen.getByText("1. e4 e5")).toBeTruthy();
    expect(screen.queryByText("e2e4")).toBeNull();
    expect(screen.getByText(/required to classify/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Black move Nc6/ }));
    expect(screen.getByText(/Checkmate \(win\)/)).toBeTruthy();
    expect(screen.getByText("Terminal position")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /White move Bb5/ }));
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
