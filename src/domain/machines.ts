import type { MachineConfig } from './graph';

export type NoteSource =
  | { readonly kind: 'fixed'; readonly note: string }
  | {
      readonly kind: 'scale-degree';
      readonly degree: number;
      readonly octave: number;
    }
  | {
      readonly kind: 'chord';
      readonly degreeOffset: number;
      readonly octave: number;
      readonly size: number;
    };

export interface MachinePreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly machine: MachineConfig;
  readonly noteSource: NoteSource;
}

export const MACHINE_PRESETS: Readonly<Record<string, MachinePreset>> = {
  sampler: {
    id: 'sampler',
    name: 'Sampler',
    description: 'Disparo de samples de una sola voz',
    machine: {
      kind: 'sampler',
      samples: [],
      voices: 1,
      fadeIn: 0.004,
      fadeOut: 0.08
    },
    noteSource: { kind: 'fixed', note: 'C4' }
  },
  'analog-pad': {
    id: 'analog-pad',
    name: 'Analog Pad',
    description: 'Poli-sinte con sierra y envolvente larga',
    machine: {
      kind: 'poly',
      oscillator: 'sawtooth',
      envelope: { attack: 1.2, decay: 1.4, sustain: 0.8, release: 4 },
      maxPolyphony: 8
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 3, size: 4 }
  },
  'bass-synth': {
    id: 'bass-synth',
    name: 'Bass Synth',
    description: 'Mono-sinte con filtro y envolvente corta',
    machine: {
      kind: 'mono',
      oscillator: 'sawtooth',
      envelope: { attack: 0.01, decay: 0.22, sustain: 0.35, release: 0.35 },
      filter: { frequency: 720, q: 3.5 }
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 2, size: 1 }
  },
  pluck: {
    id: 'pluck',
    name: 'Pluck',
    description: 'Cuerda pulsada con resonancia corta',
    machine: {
      kind: 'pluck',
      pluck: {
        attackNoise: 1.2,
        dampening: 4200,
        resonance: 0.9,
        release: 1.1
      }
    },
    noteSource: { kind: 'scale-degree', degree: 0, octave: 4 }
  }
};

export const USER_MACHINE_IDS = [
  'sampler',
  'analog-pad',
  'bass-synth',
  'pluck'
] as const;

export function machinePreset(id: string): MachinePreset {
  return MACHINE_PRESETS[id] ?? MACHINE_PRESETS.sampler!;
}
