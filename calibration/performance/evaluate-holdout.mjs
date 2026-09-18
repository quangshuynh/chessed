import { readFile, writeFile } from "node:fs/promises";

import {
  derivePlayerFeatures,
  mulberry32,
  sha256,
  SPEC_VERSION,
} from "./lib.mjs";
import {
  eligibleRows,
  evaluate,
  loadPlayerGames,
  metrics,
  predict,
  subgroupMetrics,
} from "./modeling.mjs";

const directory = "calibration/results/performance-v2";
const lockText = await readFile(`${directory}/validation-lock.json`, "utf8");
const lock = JSON.parse(lockText);
if (lock.experimentVersion !== SPEC_VERSION)
  throw new Error("Lock version mismatch.");
const rows = (
  await loadPlayerGames(`${directory}/analyzed-player-games.jsonl`)
).filter((row) => row.partition === "holdout");
if (new Set(rows.map((row) => row.gameId)).size !== 96)
  throw new Error("Holdout is incomplete.");

const configurationEntries = (configuration) => {
  const eligible = eligibleRows(
    rows,
    configuration.id,
    configuration.threshold,
  );
  return evaluate(configuration.model, eligible, configuration.bounds);
};
const richerEntries = configurationEntries(lock.selectedRicher);
const accuracyEntries = configurationEntries(lock.accuracyBaseline);
const commonKeys = new Set(
  richerEntries.map(({ row }) => `${row.gameId}:${row.color}`),
);
const pairedAccuracy = accuracyEntries.filter(({ row }) =>
  commonKeys.has(`${row.gameId}:${row.color}`),
);
const pairedRicher = richerEntries.filter(({ row }) =>
  new Set(
    pairedAccuracy.map(({ row: item }) => `${item.gameId}:${item.color}`),
  ).has(`${row.gameId}:${row.color}`),
);
const pairedAccuracyByKey = new Map(
  pairedAccuracy.map((entry) => [
    `${entry.row.gameId}:${entry.row.color}`,
    entry,
  ]),
);
const constantEntries = evaluate(
  lock.constantBaseline.model,
  pairedRicher.map(({ row }) => row),
  lock.constantBaseline.bounds,
);

const gameIds = [...new Set(pairedRicher.map(({ row }) => row.gameId))].sort();
const random = mulberry32(
  Number.parseInt(sha256(`${SPEC_VERSION}\0bootstrap`).slice(0, 8), 16),
);
const differences = [];
for (let replicate = 0; replicate < 10000; replicate += 1) {
  let richerError = 0;
  let accuracyError = 0;
  let count = 0;
  for (let draw = 0; draw < gameIds.length; draw += 1) {
    const id = gameIds[Math.floor(random() * gameIds.length)];
    for (const entry of pairedRicher.filter(({ row }) => row.gameId === id)) {
      richerError += Math.abs(entry.prediction - entry.row.rating);
      const baseline = pairedAccuracyByKey.get(
        `${entry.row.gameId}:${entry.row.color}`,
      );
      accuracyError += Math.abs(baseline.prediction - baseline.row.rating);
      count += 1;
    }
  }
  differences.push(richerError / count - accuracyError / count);
}
differences.sort((a, b) => a - b);
const percentile = (probability) =>
  differences[Math.floor((differences.length - 1) * probability)];

const dimensions = [
  "band",
  "gameLength",
  "color",
  "result",
  "timeControlCategory",
];
const residuals = Object.fromEntries(
  dimensions.map((key) => [key, subgroupMetrics(richerEntries, key)]),
);
const baselineResiduals = Object.fromEntries(
  dimensions.map((key) => [key, subgroupMetrics(accuracyEntries, key)]),
);

const profiles = {
  catastrophic: [
    ...Array.from({ length: 19 }, () => ({
      accuracy: 1,
      outcomeDrop: 0,
      onlyLegalMove: false,
    })),
    { accuracy: 0, outcomeDrop: 1, onlyLegalMove: false },
  ],
  moderate: Array.from({ length: 20 }, () => ({
    accuracy: (1 - 0.05) ** 4,
    outcomeDrop: 0.05,
    onlyLegalMove: false,
  })),
  small: Array.from({ length: 20 }, () => ({
    accuracy: (1 - 0.015) ** 4,
    outcomeDrop: 0.015,
    onlyLegalMove: false,
  })),
  trivial: Array.from({ length: 20 }, () => ({
    accuracy: 1,
    outcomeDrop: 0,
    onlyLegalMove: true,
  })),
  critical: Array.from({ length: 20 }, (_, index) => ({
    accuracy: index < 16 ? 1 : (1 - 0.04) ** 4,
    outcomeDrop: index < 16 ? 0 : 0.04,
    onlyLegalMove: false,
  })),
  shortPerfect: Array.from({ length: 3 }, () => ({
    accuracy: 1,
    outcomeDrop: 0,
    onlyLegalMove: false,
  })),
};
const syntheticPrediction = (moves) => {
  const features = derivePlayerFeatures(moves);
  return {
    features,
    richer: lock.selectedRicher.model.predictors.every((name) =>
      Number.isFinite(features[name]),
    )
      ? predict(lock.selectedRicher.model, features, lock.selectedRicher.bounds)
      : null,
    accuracy: predict(
      lock.accuracyBaseline.model,
      features,
      lock.accuracyBaseline.bounds,
    ),
  };
};
const synthetic = Object.fromEntries(
  Object.entries(profiles).map(([name, moves]) => [
    name,
    syntheticPrediction(moves),
  ]),
);
const paddingBase = profiles.moderate;
const padding = {
  base: syntheticPrediction(paddingBase),
  padded: syntheticPrediction([...paddingBase, ...profiles.trivial]),
};
padding.change =
  padding.base.richer === null || padding.padded.richer === null
    ? null
    : padding.padded.richer - padding.base.richer;
const shortSample = Object.fromEntries(
  [3, 5, 10, 20, 40].map((count) => [
    count,
    syntheticPrediction(
      Array.from({ length: count }, () => ({
        accuracy: (1 - 0.03) ** 4,
        outcomeDrop: 0.03,
        onlyLegalMove: false,
      })),
    ),
  ]),
);

const richerMetrics = metrics(pairedRicher);
const accuracyMetrics = metrics(pairedAccuracy);
const holdoutImprovement = accuracyMetrics.mae - richerMetrics.mae;
const spec = JSON.parse(
  await readFile("calibration/performance/experiment-v2.json", "utf8"),
);
const threshold = spec.meaningfulImprovement.holdout;
const globalPassed =
  holdoutImprovement >= threshold.minimumMaeUnits &&
  holdoutImprovement / accuracyMetrics.mae >=
    threshold.minimumMaePercent / 100 &&
  accuracyMetrics.medianAbsoluteError - richerMetrics.medianAbsoluteError >=
    threshold.minimumMedianImprovement &&
  percentile(0.975) < 0;
const bandDirections = Object.keys(residuals.band).filter(
  (band) => residuals.band[band].mae < baselineResiduals.band[band].mae,
).length;
const subgroupPassed =
  bandDirections >= 3 &&
  dimensions.every((dimension) =>
    Object.keys(residuals[dimension]).every(
      (group) =>
        residuals[dimension][group].count < 10 ||
        (residuals[dimension][group].mae -
          baselineResiduals[dimension][group].mae <=
          spec.meaningfulImprovement.subgroups.maximumMaeRegression &&
          Math.abs(residuals[dimension][group].meanSignedError) <=
            spec.meaningfulImprovement.subgroups.maximumAbsoluteBias),
    ),
  );
const paddingPassed =
  padding.change !== null &&
  Math.abs(padding.change) <=
    spec.meaningfulImprovement.padding.maximumEstimateChange;
const freeze =
  lock.status === "candidate-locked" &&
  globalPassed &&
  subgroupPassed &&
  paddingPassed;

const report = {
  experimentVersion: SPEC_VERSION,
  lockSha256: lock.lockSha256,
  selectedRicher: {
    id: lock.selectedRicher.id,
    threshold: lock.selectedRicher.threshold,
    bounds: lock.selectedRicher.bounds,
    metrics: richerMetrics,
  },
  accuracyBaseline: {
    id: lock.accuracyBaseline.id,
    threshold: lock.accuracyBaseline.threshold,
    bounds: lock.accuracyBaseline.bounds,
    metrics: accuracyMetrics,
  },
  constantBaseline: { metrics: metrics(constantEntries) },
  holdoutImprovement: {
    units: holdoutImprovement,
    percent: (100 * holdoutImprovement) / accuracyMetrics.mae,
    bootstrap95Difference: [percentile(0.025), percentile(0.975)],
  },
  residuals,
  accuracyBaselineResiduals: baselineResiduals,
  synthetic,
  trivialPadding: padding,
  shortSample,
  criteria: {
    validationPassed: lock.status === "candidate-locked",
    globalPassed,
    subgroupPassed,
    paddingPassed,
  },
  decision: freeze ? "freeze-chessed-performance-v1" : "do-not-freeze",
};
await writeFile(
  `${directory}/holdout-results.json`,
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  `${directory}/residuals-by-band.json`,
  `${JSON.stringify({ richer: residuals.band, accuracyBaseline: baselineResiduals.band }, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      decision: report.decision,
      selected: report.selectedRicher,
      accuracyBaseline: report.accuracyBaseline,
      improvement: report.holdoutImprovement,
      criteria: report.criteria,
    },
    null,
    2,
  ),
);
