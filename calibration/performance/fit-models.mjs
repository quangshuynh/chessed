import { readFile, writeFile } from "node:fs/promises";

import { canonicalJson, sha256, SPEC_VERSION } from "./lib.mjs";
import {
  eligibleRows,
  evaluate,
  fitModel,
  loadPlayerGames,
  metrics,
  MODEL_DEFINITIONS,
} from "./modeling.mjs";

const artifact =
  "calibration/results/performance-v2/analyzed-player-games.jsonl";
const rows = await loadPlayerGames(artifact);
if (
  rows.some((row) => row.partition === "holdout") &&
  process.argv.includes("--fail-on-holdout-presence")
)
  throw new Error("Use partition filtering; holdout fitting is forbidden.");
const train = rows.filter((row) => row.partition === "train");
const validation = rows.filter((row) => row.partition === "validation");
if (
  new Set(train.map((row) => row.gameId)).size !== 288 ||
  new Set(validation.map((row) => row.gameId)).size !== 96
)
  throw new Error(
    "Training and validation partitions must be complete before fitting.",
  );
const spec = JSON.parse(
  await readFile("calibration/performance/experiment-v2.json", "utf8"),
);
const results = [];
for (const id of Object.keys(MODEL_DEFINITIONS)) {
  for (const threshold of spec.minimumEvidenceCandidates) {
    for (const bounds of spec.boundsCandidates) {
      const trainingRows = eligibleRows(train, id, threshold);
      const validationRows = eligibleRows(validation, id, threshold);
      const model = fitModel(id, trainingRows);
      results.push({
        id,
        threshold,
        bounds,
        model,
        trainingCount: trainingRows.length,
        validation: metrics(evaluate(model, validationRows, bounds)),
      });
    }
  }
}
const compare = (a, b) =>
  a.validation.mae - b.validation.mae ||
  a.model.predictors.length - b.model.predictors.length ||
  b.threshold - a.threshold ||
  `${a.id}:${a.bounds}`.localeCompare(`${b.id}:${b.bounds}`);
const bestByFamily = Object.keys(MODEL_DEFINITIONS).map(
  (id) => results.filter((result) => result.id === id).sort(compare)[0],
);
const accuracy = bestByFamily.find((result) => result.id === "accuracy-only");
const richer = bestByFamily
  .filter((result) => !["constant", "accuracy-only"].includes(result.id))
  .sort(compare)[0];
const richerValidationRows = eligibleRows(
  validation,
  richer.id,
  richer.threshold,
);
const accuracyValidationKeys = new Set(
  eligibleRows(validation, accuracy.id, accuracy.threshold).map(
    (row) => `${row.gameId}:${row.color}`,
  ),
);
const commonValidationRows = richerValidationRows.filter((row) =>
  accuracyValidationKeys.has(`${row.gameId}:${row.color}`),
);
const pairedRicherMetrics = metrics(
  evaluate(richer.model, commonValidationRows, richer.bounds),
);
const pairedAccuracyMetrics = metrics(
  evaluate(accuracy.model, commonValidationRows, accuracy.bounds),
);
const improvement = pairedAccuracyMetrics.mae - pairedRicherMetrics.mae;
const validationPassed =
  improvement >= spec.meaningfulImprovement.validation.minimumMaeUnits &&
  improvement / pairedAccuracyMetrics.mae >=
    spec.meaningfulImprovement.validation.minimumMaePercent / 100 &&
  pairedRicherMetrics.medianAbsoluteError <=
    pairedAccuracyMetrics.medianAbsoluteError +
      spec.meaningfulImprovement.validation.medianRegressionLimit;
const comparison = {
  experimentVersion: SPEC_VERSION,
  generatedFrom: sha256(canonicalJson(rows)),
  bestByFamily,
  selectedRicher: richer,
  accuracyBaseline: accuracy,
  pairedValidation: {
    richer: pairedRicherMetrics,
    accuracyBaseline: pairedAccuracyMetrics,
  },
  validationImprovement: {
    units: improvement,
    percent: (100 * improvement) / pairedAccuracyMetrics.mae,
    passed: validationPassed,
  },
};
await writeFile(
  "calibration/results/performance-v2/validation-results.json",
  `${JSON.stringify(comparison, null, 2)}\n`,
);
const constantBaseline = {
  id: "constant",
  threshold: richer.threshold,
  bounds: richer.bounds,
  model: fitModel("constant", eligibleRows(train, richer.id, richer.threshold)),
};
const lockBody = {
  experimentVersion: SPEC_VERSION,
  status: validationPassed ? "candidate-locked" : "validation-rejected",
  selectedRicher: richer,
  accuracyBaseline: accuracy,
  constantBaseline,
  analyzedArtifactSha256: comparison.generatedFrom,
};
const lock = { ...lockBody, lockSha256: sha256(canonicalJson(lockBody)) };
await writeFile(
  "calibration/results/performance-v2/validation-lock.json",
  `${JSON.stringify(lock, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      validationImprovement: comparison.validationImprovement,
      lockSha256: lock.lockSha256,
      selected: richer.id,
    },
    null,
    2,
  ),
);
