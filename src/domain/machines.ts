import type { MachineConfig } from './graph';
import {
  defaultPluginState,
  type PluginDefinition,
  type PluginParamUnit
} from './plugin';

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
  readonly params: readonly MachineParam[];
}

export interface MachineParam {
  readonly id: string;
  readonly label: string;
  readonly kind: 'range' | 'select';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: PluginParamUnit;
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly get: (machine: MachineConfig) => number | string;
  readonly set: (machine: MachineConfig, value: number | string) => MachineConfig;
}

const OSCILLATOR_OPTIONS = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'square', label: 'Square' },
  { value: 'sawtooth', label: 'Saw' }
] as const;

const ENVELOPE_DEFAULTS = {
  attack: 0.05,
  decay: 0.25,
  sustain: 0.5,
  release: 1
} as const;

function envelopeValue(machine: MachineConfig, key: keyof typeof ENVELOPE_DEFAULTS): number {
  return machine.envelope?.[key] ?? ENVELOPE_DEFAULTS[key];
}

function withEnvelope(
  machine: MachineConfig,
  key: keyof typeof ENVELOPE_DEFAULTS,
  value: number
): MachineConfig {
  return {
    ...machine,
    envelope: {
      ...ENVELOPE_DEFAULTS,
      ...machine.envelope,
      [key]: value
    }
  };
}

function oscillatorParam(): MachineParam {
  return {
    id: 'oscillator',
    label: 'Osc',
    kind: 'select',
    options: OSCILLATOR_OPTIONS,
    get: machine => machine.oscillator ?? 'sine',
    set: (machine, value) => ({
      ...machine,
      oscillator: value as MachineConfig['oscillator']
    })
  };
}

function envelopeParam(
  key: keyof typeof ENVELOPE_DEFAULTS,
  label: string,
  min: number,
  max: number,
  step: number
): MachineParam {
  return {
    id: key,
    label,
    kind: 'range',
    min,
    max,
    step,
    unit: key === 'sustain' ? '%' : 's',
    get: machine => envelopeValue(machine, key),
    set: (machine, value) => withEnvelope(machine, key, Number(value))
  };
}

function filterParam(): MachineParam {
  return {
    id: 'filter',
    label: 'Cutoff',
    kind: 'range',
    min: 80,
    max: 6000,
    step: 10,
    unit: 'hz',
    get: machine => machine.filter?.frequency ?? 800,
    set: (machine, value) => ({
      ...machine,
      filter: {
        frequency: Number(value),
        q: machine.filter?.q ?? 1
      }
    })
  };
}

function resonanceParam(): MachineParam {
  return {
    id: 'resonance',
    label: 'Q',
    kind: 'range',
    min: 0.1,
    max: 20,
    step: 0.1,
    unit: 'q',
    get: machine => machine.filter?.q ?? 1,
    set: (machine, value) => ({
      ...machine,
      filter: {
        frequency: machine.filter?.frequency ?? 800,
        q: Number(value)
      }
    })
  };
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
    noteSource: { kind: 'fixed', note: 'C4' },
    params: []
  },
  'analog-pad': {
    id: 'analog-pad',
    name: 'Analog Pad',
    description: 'Poli-sinte con sierra, filtro y envolvente larga',
    machine: {
      kind: 'poly',
      oscillator: 'sawtooth',
      envelope: { attack: 1.2, decay: 1.4, sustain: 0.8, release: 4 },
      filter: { frequency: 1100, q: 1.4 },
      filterEnvelope: { octaves: 2.2, attack: 0.9, decay: 2.2, sustain: 0.55, release: 3.2 },
      maxPolyphony: 8
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 3, size: 4 },
    params: [
      oscillatorParam(),
      envelopeParam('attack', 'Attack', 0.01, 5, 0.01),
      envelopeParam('decay', 'Decay', 0.02, 5, 0.01),
      envelopeParam('sustain', 'Sustain', 0, 1, 0.01),
      envelopeParam('release', 'Release', 0.05, 10, 0.05),
      filterParam(),
      resonanceParam()
    ]
  },
  'soft-pad': {
    id: 'soft-pad',
    name: 'Soft Pad',
    description: 'Poli-sinte de triángulo con filtro dulce y ataque lento',
    machine: {
      kind: 'poly',
      oscillator: 'triangle',
      envelope: { attack: 2, decay: 1, sustain: 0.8, release: 3 },
      filter: { frequency: 2400, q: 0.9 },
      filterEnvelope: { octaves: 1.6, attack: 1.4, decay: 2.4, sustain: 0.6, release: 3 },
      maxPolyphony: 8
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 3, size: 4 },
    params: [
      oscillatorParam(),
      envelopeParam('attack', 'Attack', 0.01, 5, 0.01),
      envelopeParam('decay', 'Decay', 0.02, 5, 0.01),
      envelopeParam('sustain', 'Sustain', 0, 1, 0.01),
      envelopeParam('release', 'Release', 0.05, 10, 0.05),
      filterParam(),
      resonanceParam()
    ]
  },
  'drone-sampler': {
    id: 'drone-sampler',
    name: 'Drone Sampler',
    description: 'Sample de drone con voces y cola larga',
    machine: {
      kind: 'sampler',
      samples: ['./audio/drone.wav'],
      voices: 2,
      fadeIn: 0.01,
      fadeOut: 0.2
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 2, size: 1 },
    params: []
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
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 2, size: 1 },
    params: [
      oscillatorParam(),
      envelopeParam('attack', 'Attack', 0.001, 2, 0.001),
      envelopeParam('decay', 'Decay', 0.01, 2, 0.01),
      envelopeParam('sustain', 'Sustain', 0, 1, 0.01),
      envelopeParam('release', 'Release', 0.01, 3, 0.01),
      filterParam(),
      resonanceParam()
    ]
  },
  'lead-synth': {
    id: 'lead-synth',
    name: 'Lead Synth',
    description: 'Poli-sinte brillante con filtro y envolvente media',
    machine: {
      kind: 'poly',
      oscillator: 'triangle',
      envelope: { attack: 0.05, decay: 0.25, sustain: 0.35, release: 1.4 },
      filter: { frequency: 1800, q: 2.6 },
      filterEnvelope: { octaves: 3, attack: 0.02, decay: 0.4, sustain: 0.3, release: 0.9 },
      maxPolyphony: 12
    },
    noteSource: { kind: 'scale-degree', degree: 4, octave: 4 },
    params: [
      oscillatorParam(),
      envelopeParam('attack', 'Attack', 0.001, 2, 0.001),
      envelopeParam('decay', 'Decay', 0.01, 3, 0.01),
      envelopeParam('sustain', 'Sustain', 0, 1, 0.01),
      envelopeParam('release', 'Release', 0.01, 6, 0.01),
      filterParam(),
      resonanceParam()
    ]
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
    noteSource: { kind: 'scale-degree', degree: 0, octave: 4 },
    params: [
      {
        id: 'attackNoise',
        label: 'Noise',
        kind: 'range',
        min: 0.1,
        max: 20,
        step: 0.1,
        unit: 'none',
        get: machine => machine.pluck?.attackNoise ?? 1.2,
        set: (machine, value) => ({
          ...machine,
          pluck: {
            ...(machine.pluck ?? {
              attackNoise: 1.2,
              dampening: 4200,
              resonance: 0.9,
              release: 1.1
            }),
            attackNoise: Number(value)
          }
        })
      },
      {
        id: 'dampening',
        label: 'Damp',
        kind: 'range',
        min: 200,
        max: 7000,
        step: 50,
        unit: 'hz',
        get: machine => machine.pluck?.dampening ?? 4200,
        set: (machine, value) => ({
          ...machine,
          pluck: {
            ...(machine.pluck ?? {
              attackNoise: 1.2,
              dampening: 4200,
              resonance: 0.9,
              release: 1.1
            }),
            dampening: Number(value)
          }
        })
      },
      {
        id: 'resonance',
        label: 'Reso',
        kind: 'range',
        min: 0,
        max: 1,
        step: 0.01,
        unit: '%',
        get: machine => machine.pluck?.resonance ?? 0.9,
        set: (machine, value) => ({
          ...machine,
          pluck: {
            ...(machine.pluck ?? {
              attackNoise: 1.2,
              dampening: 4200,
              resonance: 0.9,
              release: 1.1
            }),
            resonance: Number(value)
          }
        })
      },
      {
        id: 'release',
        label: 'Release',
        kind: 'range',
        min: 0.05,
        max: 5,
        step: 0.05,
        unit: 's',
        get: machine => machine.pluck?.release ?? 1.1,
        set: (machine, value) => ({
          ...machine,
          pluck: {
            ...(machine.pluck ?? {
              attackNoise: 1.2,
              dampening: 4200,
              resonance: 0.9,
              release: 1.1
            }),
            release: Number(value)
          }
        })
      }
    ]
  }
};

export function formatMachineParam(
  param: MachineParam,
  value: number | string
): string {
  if (param.kind === 'select') return String(value);
  const numeric = Number(value);
  if (param.unit === 'hz') {
    return numeric >= 1000 ? `${(numeric / 1000).toFixed(1)} kHz` : `${Math.round(numeric)} Hz`;
  }
  if (param.unit === 's') {
    return numeric < 1 ? `${Math.round(numeric * 1000)} ms` : `${numeric.toFixed(2)} s`;
  }
  if (param.unit === 'ms') return `${numeric.toFixed(1)} ms`;
  if (param.unit === 'db') return `${numeric.toFixed(1)} dB`;
  if (param.unit === '%') return `${Math.round(numeric * 100)}%`;
  if (param.unit === 'q') return numeric.toFixed(2);
  if (param.unit === 'ratio') return `${numeric.toFixed(1)}:1`;
  return numeric.toFixed(2);
}

export const USER_MACHINE_IDS = [
  'sampler',
  'drone-sampler',
  'analog-pad',
  'soft-pad',
  'bass-synth',
  'lead-synth',
  'pluck'
] as const;

export function machinePreset(id: string): MachinePreset {
  return MACHINE_PRESETS[id] ?? MACHINE_PRESETS.sampler!;
}

export function instrumentMachinePreset(
  definition: PluginDefinition
): MachinePreset {
  const params: MachineParam[] = definition.params.map(param => ({
    id: param.id,
    label: param.label,
    kind: 'range',
    min: param.min,
    max: param.max,
    step: param.step ?? (param.unit === 'hz' ? 1 : 0.01),
    unit: param.unit,
    get: machine => machine.params?.[param.id] ?? param.defaultValue,
    set: (machine, value) => ({
      ...machine,
      params: { ...machine.params, [param.id]: Number(value) }
    })
  }));

  return {
    id: `plugin-${definition.id}`,
    name: definition.name,
    description: 'Instrument plugin',
    machine: {
      kind: 'plugin',
      pluginId: definition.id,
      params: defaultPluginState(definition)
    },
    noteSource: { kind: 'scale-degree', degree: 0, octave: 4 },
    params
  };
}
