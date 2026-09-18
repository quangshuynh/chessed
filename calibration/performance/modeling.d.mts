export interface FittedModel {
  id: string;
  predictors: string[];
  intercept: number;
  coefficients: number[];
  means: number[];
  scales: number[];
}
export function fitModel(
  id: string,
  rows: readonly Record<string, number>[],
): FittedModel;
export function predict(
  model: FittedModel,
  row: Record<string, number>,
  bounds: string,
): number;
