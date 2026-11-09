import { PATTERN_LENGTH, type PatternChannel } from './channels';

export type Step = 0 | 1;
export type Pattern = readonly Step[];
export type Patterns = Record<PatternChannel, Pattern>;
export type PatternSteps = Record<string, Pattern>;

export interface PatternState {
  readonly steps: PatternSteps;
  readonly pulses: Record<string, number>;
  readonly frozen: Record<string, boolean>;
}

export function clonePatternState(state: PatternState): PatternState {
  return {
    steps: Object.fromEntries(
      Object.entries(state.steps).map(([key, pattern]) => [key, [...pattern]])
    ),
    pulses: { ...state.pulses },
    frozen: { ...state.frozen }
  };
}

function fromValues(...values: number[]): Pattern {
  return values.map(value => (value ? 1 : 0) as Step);
}

export const INITIAL_PATTERNS: Patterns = {
  kick: fromValues(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
  bass: fromValues(1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1),
  hihat: fromValues(0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1),
  perc: fromValues(0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1)
};

export function normalizeStep(step: number): number {
  return ((step % PATTERN_LENGTH) + PATTERN_LENGTH) % PATTERN_LENGTH;
}

export function patternStep(
  patterns: PatternSteps,
  channel: string,
  stepCount: number
): boolean {
  return patterns[channel]?.[normalizeStep(stepCount)] === 1;
}

export function countSteps(pattern: Pattern): number {
  return pattern.reduce<number>((total, step) => total + step, 0);
}

export function toPattern(values: readonly number[]): Pattern {
  return values.slice(0, PATTERN_LENGTH).map(value => (value ? 1 : 0) as Step);
}

export function isValidPattern(value: unknown): value is Pattern {
  return (
    Array.isArray(value) &&
    value.length === PATTERN_LENGTH &&
    value.every(step => step === 0 || step === 1)
  );
}
