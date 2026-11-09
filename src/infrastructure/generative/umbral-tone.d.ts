declare module '@quicio/umbral-tone/generative' {
  export const PATTERN_LENGTH: number;
  export const SCENES: Record<
    string,
    {
      label: string;
      params: Record<string, number>;
      harmony: {
        root: number;
        scale: string;
        progression: string;
        sustain: number;
      };
    }
  >;
  export const ROOTS: readonly { label: string; pc: number }[];
  export const SCALES: Record<string, { label: string; intervals: number[] }>;
  export const PROGRESSIONS: Record<string, { label: string; degrees: number[] }>;
  export const DEFAULT_PARAMS: Record<string, number>;
  export const CHANNEL_SEEDS: Record<string, { pulses: number; offset: number }>;

  export function generatePattern(
    key: string,
    params: unknown,
    pulses: number,
    seed: number
  ): number[];
  export function mutatePattern(
    pattern: readonly number[],
    params: unknown,
    seed: number,
    key: string
  ): number[];
  export function thinPattern(
    pattern: readonly number[],
    params: unknown,
    seed: number,
    key: string
  ): number[];
  export function fillPattern(
    pattern: readonly number[],
    params: unknown,
    seed: number,
    key: string
  ): number[];
  export function rotatePattern(pattern: readonly number[], amount: number): number[];
  export function euclidean(steps: number, pulses: number, offset?: number): number[];
  export function count(pattern: readonly number[]): number;
  export function hash01(seed: number, key: string, step: number, salt: number): number;
  export function midiToNote(midi: number): string;
  export function scaleDegreeMidi(
    root: number,
    scale: string,
    degree: number,
    octave?: number
  ): number;
  export function scaleNotes(
    root: number,
    scale: string,
    octave?: number,
    count?: number
  ): string[];
  export function chordNotes(
    root: number,
    scale: string,
    degree: number,
    octave?: number,
    size?: number
  ): string[];
}
