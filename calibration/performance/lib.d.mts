export const SPEC_VERSION: string;
export function sha256(value: string | Uint8Array): string;
export function canonicalJson(value: unknown): string;
export function derivePlayerFeatures(
  moves: readonly {
    accuracy: number;
    outcomeDrop: number;
    onlyLegalMove: boolean;
  }[],
): Record<string, number | null>;
