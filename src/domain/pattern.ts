import { PATTERN_LENGTH, type PatternChannel } from './channels';

export type Step = 0 | 1;
export type Pattern = readonly Step[];
export type Patterns = Record<PatternChannel, Pattern>;
export type PatternSteps = Record<string, Pattern>;

export interface ParamLock {
  readonly insertId: string;
  readonly paramId: string;
  readonly value: number;
}

export type StepLocks = readonly ParamLock[];
export type TrackLocks = readonly StepLocks[];
export type PatternLocks = Record<string, TrackLocks>;
export type StepValues = readonly number[];

export interface PatternState {
  readonly steps: PatternSteps;
  readonly pulses: Record<string, number>;
  readonly frozen: Record<string, boolean>;
  readonly locks: PatternLocks;
  readonly velocity: Record<string, StepValues>;
  readonly probability: Record<string, StepValues>;
  readonly ratchets: Record<string, StepValues>;
}

export function emptyTrackLocks(): TrackLocks {
  return Array.from({ length: PATTERN_LENGTH }, () => []);
}

export function emptyStepValues(value: number): StepValues {
  return Array.from({ length: PATTERN_LENGTH }, () => value);
}

export function clonePatternState(state: PatternState): PatternState {
  return {
    steps: Object.fromEntries(
      Object.entries(state.steps).map(([key, pattern]) => [key, [...pattern]])
    ),
    pulses: { ...state.pulses },
    frozen: { ...state.frozen },
    locks: Object.fromEntries(
      Object.entries(state.locks).map(([key, steps]) => [
        key,
        steps.map(locks => locks.map(lock => ({ ...lock })))
      ])
    ),
    velocity: cloneValues(state.velocity),
    probability: cloneValues(state.probability),
    ratchets: cloneValues(state.ratchets)
  };
}

function cloneValues(
  values: Record<string, StepValues>
): Record<string, StepValues> {
  return Object.fromEntries(
    Object.entries(values).map(([key, steps]) => [key, [...steps]])
  );
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

export function locksAt(
  locks: PatternLocks,
  trackId: string,
  step: number
): StepLocks {
  return locks[trackId]?.[normalizeStep(step)] ?? [];
}

export function withLock(
  pattern: PatternState,
  trackId: string,
  step: number,
  lock: ParamLock
): PatternState {
  const index = normalizeStep(step);
  const trackLocks = [...(pattern.locks[trackId] ?? emptyTrackLocks())];
  const current = trackLocks[index] ?? [];
  const next = current.some(
    entry => entry.insertId === lock.insertId && entry.paramId === lock.paramId
  )
    ? current.map(entry =>
        entry.insertId === lock.insertId && entry.paramId === lock.paramId
          ? lock
          : entry
      )
    : [...current, lock];
  trackLocks[index] = next;
  return {
    ...pattern,
    locks: { ...pattern.locks, [trackId]: trackLocks }
  };
}

export function withoutLock(
  pattern: PatternState,
  trackId: string,
  step: number,
  insertId: string,
  paramId: string
): PatternState {
  const index = normalizeStep(step);
  const trackLocks = [...(pattern.locks[trackId] ?? emptyTrackLocks())];
  trackLocks[index] = (trackLocks[index] ?? []).filter(
    entry => !(entry.insertId === insertId && entry.paramId === paramId)
  );
  return {
    ...pattern,
    locks: { ...pattern.locks, [trackId]: trackLocks }
  };
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
