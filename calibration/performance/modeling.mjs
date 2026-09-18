import { readFile } from "node:fs/promises";

import { derivePlayerFeatures, quantile } from "./lib.mjs";

export const MODEL_DEFINITIONS = {
  constant: [],
  "accuracy-only": ["accuracy"],
  "accuracy-severe": ["accuracy", "severeErrorRate"],
  distribution: [
    "accuracy",
    "lowerQuartileMoveAccuracy",
    "severeErrorRate",
    "nearPerfectRate",
  ],
  "meaningful-choice": [
    "meaningfulAccuracy",
    "meaningfulLowerQuartile",
    "meaningfulSevereErrorRate",
    "meaningfulMoveCount",
  ],
};

export async function loadPlayerGames(path) {
  const text = await readFile(path, "utf8");
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      const game = JSON.parse(line);
      return game.players.map((player) => ({
        gameId: game.gameId,
        partition: game.partition,
        band: game.band,
        color: player.color,
        result:
          game.result === "1/2-1/2"
            ? "draw"
            : (game.result === "1-0") === (player.color === "white")
              ? "win"
              : "loss",
        timeControlCategory: game.timeControlCategory,
        gameLength: game.gameLength,
        rating: player.rating,
        opponentRating: player.opponentRating,
        unavailableMoveCount: player.unavailableMoveCount,
        ...derivePlayerFeatures(player.moves),
      }));
    });
}

function solve(matrix, vector) {
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < rows.length; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < rows.length; row += 1)
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column]))
        pivot = row;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    if (Math.abs(rows[column][column]) < 1e-10)
      throw new Error("Singular model matrix.");
    const divisor = rows[column][column];
    for (let index = column; index <= rows.length; index += 1)
      rows[column][index] /= divisor;
    for (let row = 0; row < rows.length; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let index = column; index <= rows.length; index += 1)
        rows[row][index] -= factor * rows[column][index];
    }
  }
  return rows.map((row) => row.at(-1));
}

export function fitModel(id, rows, predictors = MODEL_DEFINITIONS[id]) {
  if (id === "constant") {
    return {
      id,
      predictors,
      intercept: rows.reduce((sum, row) => sum + row.rating, 0) / rows.length,
      coefficients: [],
      means: [],
      scales: [],
    };
  }
  const means = predictors.map(
    (name) => rows.reduce((sum, row) => sum + row[name], 0) / rows.length,
  );
  const scales = predictors.map((name, index) => {
    const variance =
      rows.reduce((sum, row) => sum + (row[name] - means[index]) ** 2, 0) /
      rows.length;
    return Math.sqrt(variance) || 1;
  });
  const design = rows.map((row) => [
    1,
    ...predictors.map(
      (name, index) => (row[name] - means[index]) / scales[index],
    ),
  ]);
  const size = predictors.length + 1;
  const gram = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) =>
      design.reduce((sum, row) => sum + row[i] * row[j], 0),
    ),
  );
  const cross = Array.from({ length: size }, (_, i) =>
    design.reduce((sum, row, index) => sum + row[i] * rows[index].rating, 0),
  );
  const [intercept, ...coefficients] = solve(gram, cross);
  return { id, predictors, intercept, coefficients, means, scales };
}

export function predict(model, row, bounds) {
  let value =
    model.intercept +
    model.predictors.reduce(
      (sum, name, index) =>
        sum +
        (model.coefficients[index] * (row[name] - model.means[index])) /
          model.scales[index],
      0,
    );
  if (bounds === "clip-400-3000") value = Math.max(400, Math.min(3000, value));
  return value;
}

function rank(values) {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value)
      end += 1;
    const average = (start + end - 1) / 2 + 1;
    for (let index = start; index < end; index += 1)
      ranks[sorted[index].index] = average;
    start = end;
  }
  return ranks;
}

function correlation(left, right) {
  if (left.length < 2) return null;
  const lm = left.reduce((a, b) => a + b, 0) / left.length;
  const rm = right.reduce((a, b) => a + b, 0) / right.length;
  const numerator = left.reduce(
    (sum, value, index) => sum + (value - lm) * (right[index] - rm),
    0,
  );
  const denominator = Math.sqrt(
    left.reduce((sum, value) => sum + (value - lm) ** 2, 0) *
      right.reduce((sum, value) => sum + (value - rm) ** 2, 0),
  );
  return denominator === 0 ? null : numerator / denominator;
}

export function metrics(entries) {
  const signed = entries.map(({ prediction, row }) => prediction - row.rating);
  const absolute = signed.map(Math.abs);
  const actual = entries.map(({ row }) => row.rating);
  const predicted = entries.map(({ prediction }) => prediction);
  return {
    count: entries.length,
    mae: absolute.reduce((a, b) => a + b, 0) / absolute.length,
    medianAbsoluteError: quantile(absolute, 0.5),
    rmse: Math.sqrt(
      signed.reduce((sum, value) => sum + value ** 2, 0) / signed.length,
    ),
    pearson: correlation(predicted, actual),
    spearman: correlation(rank(predicted), rank(actual)),
    meanSignedError: signed.reduce((a, b) => a + b, 0) / signed.length,
    errorQuantiles25_50_75: [
      quantile(signed, 0.25),
      quantile(signed, 0.5),
      quantile(signed, 0.75),
    ],
    within100:
      absolute.filter((value) => value <= 100).length / absolute.length,
    within200:
      absolute.filter((value) => value <= 200).length / absolute.length,
    within400:
      absolute.filter((value) => value <= 400).length / absolute.length,
  };
}

export function eligibleRows(rows, modelId, threshold) {
  const predictors = MODEL_DEFINITIONS[modelId];
  const countName =
    modelId === "meaningful-choice" ? "meaningfulMoveCount" : "scoredMoveCount";
  return rows.filter(
    (row) =>
      row[countName] >= threshold &&
      predictors.every((name) => Number.isFinite(row[name])),
  );
}

export function evaluate(model, rows, bounds) {
  return rows.map((row) => ({ row, prediction: predict(model, row, bounds) }));
}

export function subgroupMetrics(entries, key) {
  return Object.fromEntries(
    [...new Set(entries.map(({ row }) => row[key]))]
      .sort()
      .map((value) => [
        value,
        metrics(entries.filter(({ row }) => row[key] === value)),
      ]),
  );
}
