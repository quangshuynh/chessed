import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Chess } from "chess.js";

import {
  canonicalJson,
  header,
  normalizeGameId,
  sha256,
  SPEC_VERSION,
  timeControlCategory,
} from "./lib.mjs";

const [
  source,
  destination = "calibration/results/performance-v2/selected-games.json",
] = process.argv.slice(2);
if (!source)
  throw new Error("Usage: node select-sample.mjs <source.pgn> [output]");

const spec = JSON.parse(
  await readFile(new URL("./experiment-v2.json", import.meta.url), "utf8"),
);
const sourceBytes = await readFile(source);
const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
if (sourceHash !== spec.source.compressedSha256) {
  // The preregistered hash is for the compressed transport, while selection
  // intentionally receives decompressed PGN. Its exact hash is retained below.
  if (!source.endsWith(".pgn")) throw new Error("Unexpected source hash.");
}

const games = sourceBytes
  .toString("utf8")
  .trim()
  .split(/\r?\n\r?\n(?=\[Event )/);
const eligible = [];
const excluded = {};
const reject = (reason) => (excluded[reason] = (excluded[reason] ?? 0) + 1);

for (const pgn of games) {
  const event = header(pgn, "Event");
  if (!event?.startsWith("Rated ")) {
    reject("not-rated");
    continue;
  }
  if (
    event.includes("Chess960") ||
    event.includes("Antichess") ||
    event.includes("Atomic") ||
    event.includes("Horde") ||
    event.includes("King of the Hill") ||
    event.includes("Three-check")
  ) {
    reject("variant");
    continue;
  }
  if (header(pgn, "Termination") !== "Normal") {
    reject("termination");
    continue;
  }
  const result = header(pgn, "Result");
  if (!["1-0", "0-1", "1/2-1/2"].includes(result)) {
    reject("result");
    continue;
  }
  const id = normalizeGameId(header(pgn, "Site"));
  if (!id) {
    reject("id");
    continue;
  }
  const whiteRating = Number(header(pgn, "WhiteElo"));
  const blackRating = Number(header(pgn, "BlackElo"));
  if (!Number.isInteger(whiteRating) || !Number.isInteger(blackRating)) {
    reject("rating");
    continue;
  }
  const averageRating = (whiteRating + blackRating) / 2;
  const band = spec.ratingBands.find(
    ({ minimum, maximum }) =>
      averageRating >= minimum && averageRating <= maximum,
  );
  if (!band) {
    reject("rating-band");
    continue;
  }
  const timeControl = header(pgn, "TimeControl");
  const time = timeControlCategory(timeControl);
  if (!time) {
    reject("time-control");
    continue;
  }
  eligible.push({
    id,
    band: band.id,
    whiteRating,
    blackRating,
    result,
    timeControl,
    timeControlCategory: time.category,
    estimatedDurationSeconds: time.estimatedSeconds,
    selectionHash: sha256(`${SPEC_VERSION}\0${id}`),
    pgn: pgn.trim(),
  });
}

const selected = spec.ratingBands.flatMap((band) => {
  const candidates = eligible
    .filter((game) => game.band === band.id)
    .sort(
      (a, b) =>
        a.selectionHash.localeCompare(b.selectionHash) ||
        a.id.localeCompare(b.id),
    );
  const accepted = [];
  for (const game of candidates) {
    let parsed;
    try {
      parsed = new Chess();
      parsed.loadPgn(game.pgn, { strict: false });
    } catch {
      reject("malformed-or-illegal");
      continue;
    }
    const plies = parsed.history().length;
    if (
      plies < spec.eligibility.minimumPlies ||
      plies > spec.eligibility.maximumPlies
    ) {
      reject("game-length");
      continue;
    }
    accepted.push({
      ...game,
      plies,
      gameLength: plies < 50 ? "short" : plies <= 100 ? "medium" : "long",
    });
    if (accepted.length === band.games) break;
  }
  if (accepted.length < band.games)
    throw new Error(`Only ${accepted.length} eligible games in ${band.id}.`);
  return accepted.map((game, index) => ({
    ...game,
    partition:
      index < spec.split.trainPerBand
        ? "train"
        : index < spec.split.trainPerBand + spec.split.validationPerBand
          ? "validation"
          : "holdout",
  }));
});

const withoutHash = {
  experimentVersion: SPEC_VERSION,
  source: {
    ...spec.source,
    decompressedSha256: sha256(sourceBytes),
    observedGameCount: games.length,
  },
  exclusions: excluded,
  metadataEligibleGameCount: eligible.length,
  games: selected,
};
const payload = {
  ...withoutHash,
  artifactSha256: sha256(canonicalJson(withoutHash)),
};
await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(
  `Selected ${selected.length} games (${eligible.length} metadata-eligible); ${payload.artifactSha256}`,
);
