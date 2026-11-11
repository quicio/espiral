import { PATTERN_LENGTH } from './channels';
import type { SceneId } from './models';
import { toPattern, type Pattern, type StepValues } from './pattern';

const GROOVES: Readonly<Record<SceneId, Readonly<Record<string, string>>>> = {
  umbral: {
    kick: 'x...x...x...x..x',
    bass: '..x...x...x.x.x.',
    hihat: '.x.x.x.x.x.x.x.x',
    perc: '....x...x...x...',
    'track-08': 'x.x.x.x.x.x.x.x.',
    'track-09': '....x.......x..x',
    'track-10': '......x.......x.',
    'track-11': '....x.......x...',
    'track-12': '..............x.'
  },
  deriva: {
    kick: 'x.......x.......',
    bass: '....x.......x...',
    hihat: '..x...x...x...x.',
    perc: '........x.......',
    'track-08': '....x.......x...',
    'track-09': '..x...x...x...x.',
    'track-10': '....x.......x...',
    'track-11': '........x.......',
    'track-12': '..............x.'
  },
  pulso: {
    kick: 'x...x...x...x...',
    bass: '..x..x..x..x..x.',
    hihat: '.x.x.x.x.x.x.x.x',
    perc: '....x.......x...',
    'track-08': 'x.x.x.x.x.x.x.x.',
    'track-09': '..x..x..x..x..x.',
    'track-10': '......x.......x.',
    'track-11': '....x.......x...',
    'track-12': '............x...'
  },
  caos: {
    kick: 'x..x..x...x..x..',
    bass: '..x.x..x..x.x..x',
    hihat: 'x.x.x.x.x.x.x.x.',
    perc: '..x.x..x.x..x.x.',
    'track-08': 'x..x.x..x..x.x..',
    'track-09': '....x..x....x..x',
    'track-10': '..x...x...x...x.',
    'track-11': '....x..x....x..x',
    'track-12': '......x..x......'
  }
};

const VELOCITY: Readonly<Record<string, readonly number[]>> = {
  kick: [1, 0.9, 0.8, 0.9, 0.9, 0.9, 0.8, 0.9, 1, 0.9, 0.8, 0.9, 0.9, 0.9, 0.9, 0.55],
  bass: [0.9, 0.8, 1, 0.65, 0.9, 0.8, 1, 0.65, 0.9, 0.8, 1, 0.65, 0.9, 0.8, 0.7, 0.65],
  hihat: [0.4, 0.55, 0.35, 0.5, 0.4, 0.55, 0.35, 0.5, 0.4, 0.55, 0.35, 0.5, 0.4, 0.55, 0.35, 0.5],
  perc: [0.7, 0.6, 0.7, 0.6, 0.9, 0.6, 0.7, 0.6, 0.7, 0.6, 0.7, 0.6, 0.85, 0.6, 0.7, 0.6],
  'track-08': [0.42, 0.2, 0.3, 0.2, 0.4, 0.2, 0.28, 0.2, 0.42, 0.2, 0.3, 0.2, 0.4, 0.2, 0.28, 0.2],
  'track-09': [0.35, 0.25, 0.3, 0.25, 0.5, 0.25, 0.3, 0.25, 0.35, 0.25, 0.3, 0.25, 0.5, 0.25, 0.3, 0.45],
  'track-10': [0.2, 0.15, 0.2, 0.15, 0.2, 0.35, 0.2, 0.15, 0.2, 0.15, 0.2, 0.15, 0.2, 0.35, 0.2, 0.15],
  'track-11': [0.2, 0.15, 0.2, 0.15, 0.65, 0.15, 0.2, 0.15, 0.2, 0.15, 0.2, 0.15, 0.6, 0.15, 0.2, 0.15],
  'track-12': [0.2, 0.15, 0.2, 0.15, 0.2, 0.15, 0.3, 0.15, 0.2, 0.15, 0.2, 0.15, 0.25, 0.15, 0.35, 0.15]
};

const PROBABILITY: Readonly<Record<string, readonly number[]>> = {
  kick: values(1, { 15: 0.55 }),
  bass: values(0.95, { 3: 0.7, 7: 0.7, 11: 0.7, 15: 0.7 }),
  hihat: values(0.9, { 1: 0.8, 5: 0.8, 9: 0.8, 13: 0.8 }),
  perc: values(0.9),
  'track-08': values(0.9),
  'track-09': values(0.85),
  'track-10': values(0.9),
  'track-11': values(0.9),
  'track-12': values(0.85)
};

const RATCHETS: Readonly<Record<string, readonly number[]>> = {
  'track-08': values(1, { 6: 2, 14: 2 }),
  'track-09': values(1, { 15: 2 }),
  'track-10': values(1, { 6: 2, 14: 2 }),
  'track-11': values(1, { 4: 2, 12: 2 }),
  'track-12': values(1, { 15: 2 }),
  perc: values(1, { 12: 2 })
};

const ONES: StepValues = values(1);

export function defaultGroovePattern(
  sceneId: SceneId,
  trackId: string
): Pattern | null {
  const text = GROOVES[sceneId]?.[trackId];
  if (!text) return null;
  return toPattern(
    Array.from({ length: PATTERN_LENGTH }, (_, index) =>
      text[index] === 'x' ? 1 : 0
    )
  );
}

export function defaultVelocity(trackId: string): StepValues {
  return [...(VELOCITY[trackId] ?? ONES)];
}

export function defaultProbability(trackId: string): StepValues {
  return [...(PROBABILITY[trackId] ?? ONES)];
}

export function defaultRatchets(trackId: string): StepValues {
  return [...(RATCHETS[trackId] ?? ONES)];
}

function values(
  base: number,
  overrides: Readonly<Record<number, number>> = {}
): StepValues {
  return Array.from(
    { length: PATTERN_LENGTH },
    (_, index) => overrides[index] ?? base
  );
}
