import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [source, destination = "calibration/results/performance-sample.json"] =
  process.argv.slice(2);
if (!source)
  throw new Error(
    "Usage: node calibration/select-performance-sample.mjs <lichess-month.pgn> [output]",
  );

const text = await readFile(source, "utf8");
const games = text.trim().split(/\r?\n\r?\n(?=\[Event )/);
const bands = [
  { id: "lower", minimum: 1000, maximum: 1399 },
  { id: "intermediate", minimum: 1400, maximum: 1699 },
  { id: "advanced", minimum: 1700, maximum: 1999 },
  { id: "expert", minimum: 2000, maximum: 3000 },
];
const selected = [];
for (const game of games) {
  const header = (name) =>
    new RegExp(`^\\[${name} "([^"]*)"\\]$`, "m").exec(game)?.[1];
  const white = Number(header("WhiteElo"));
  const black = Number(header("BlackElo"));
  const moves = (game.match(/\d+\.(?:\.\.)?/g) ?? []).length;
  const averageRating = (white + black) / 2;
  const band = bands.find(
    (candidate) =>
      averageRating >= candidate.minimum && averageRating <= candidate.maximum,
  );
  if (!band || selected.filter((item) => item.band === band.id).length >= 3)
    continue;
  if (
    !header("Event")?.startsWith("Rated ") ||
    header("Termination") !== "Normal"
  )
    continue;
  if (
    moves < 10 ||
    moves > 60 ||
    !["1-0", "0-1", "1/2-1/2"].includes(header("Result"))
  )
    continue;
  selected.push({
    id: header("Site")?.split("/").at(-1),
    band: band.id,
    whiteRating: white,
    blackRating: black,
    result: header("Result"),
    timeControl: header("TimeControl"),
    pgn: game.trim(),
  });
  if (
    bands.every(
      (candidate) =>
        selected.filter((item) => item.band === candidate.id).length === 3,
    )
  )
    break;
}
if (selected.length !== 12)
  throw new Error(`Only selected ${selected.length} games.`);
const payload = {
  source: "Lichess standard rated games, January 2013 (CC0)",
  sourceUrl:
    "https://database.lichess.org/standard/lichess_db_standard_rated_2013-01.pgn.zst",
  sourceSha256:
    "aa40b3671fa3cf1072eb182892cd90b0e1e003a4a5943492f64b77e7f3fd1635",
  selection:
    "first three normal-finish rated games per mean-rating band, 10-60 full moves, in source order",
  split:
    "SHA-256(game id) first byte modulo 3 equals 0 => holdout; otherwise calibration",
  games: selected.map((game) => ({
    ...game,
    partition:
      createHash("sha256").update(game.id).digest()[0] % 3 === 0
        ? "holdout"
        : "calibration",
  })),
};
await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Selected ${selected.length} games to ${destination}.`);
