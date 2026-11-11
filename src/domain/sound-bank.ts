import type { MachineConfig } from './graph';
import type { NoteSource } from './machines';

export type SoundCategory = 'drums' | 'bass' | 'keys' | 'textures';

export interface SoundCategoryDescriptor {
  readonly id: SoundCategory;
  readonly label: string;
}

export const SOUND_CATEGORIES: readonly SoundCategoryDescriptor[] = [
  { id: 'drums', label: 'Ritmo' },
  { id: 'bass', label: 'Bajos' },
  { id: 'keys', label: 'Teclados' },
  { id: 'textures', label: 'Texturas' }
];

export interface SoundPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: SoundCategory;
  readonly machineId: string;
  readonly machine: MachineConfig;
  readonly noteSource: NoteSource;
}

const SAMPLE_PATH = './audio/';

export const SOUND_BANK: readonly SoundPreset[] = [
  {
    id: 'shaker-air',
    name: 'Shaker Air',
    description: 'Shaker corto con aire y cola media',
    category: 'drums',
    machineId: 'sampler',
    machine: {
      kind: 'sampler',
      samples: [`${SAMPLE_PATH}hihat-01.wav`],
      voices: 1,
      fadeIn: 0.003,
      fadeOut: 0.12
    },
    noteSource: { kind: 'fixed', note: 'C4' }
  },
  {
    id: 'rim-tick',
    name: 'Rim Tick',
    description: 'Percusión seca, ideal para contratiempos',
    category: 'drums',
    machineId: 'sampler',
    machine: {
      kind: 'sampler',
      samples: [`${SAMPLE_PATH}perc.wav`],
      voices: 2,
      fadeIn: 0.002,
      fadeOut: 0.06
    },
    noteSource: { kind: 'fixed', note: 'C4' }
  },
  {
    id: 'hat-tight',
    name: 'Hat Tight',
    description: 'Hi-hat cerrado y filoso',
    category: 'drums',
    machineId: 'sampler',
    machine: {
      kind: 'sampler',
      samples: [`${SAMPLE_PATH}hihat-03.wav`],
      voices: 1,
      fadeIn: 0.002,
      fadeOut: 0.025
    },
    noteSource: { kind: 'fixed', note: 'C4' }
  },
  {
    id: 'hat-open',
    name: 'Hat Open',
    description: 'Hi-hat abierto con más cola',
    category: 'drums',
    machineId: 'sampler',
    machine: {
      kind: 'sampler',
      samples: [`${SAMPLE_PATH}hihat-07.wav`],
      voices: 1,
      fadeIn: 0.002,
      fadeOut: 0.35
    },
    noteSource: { kind: 'fixed', note: 'C4' }
  },
  {
    id: 'clap-soft',
    name: 'Clap Soft',
    description: 'Percusión ancha con ataque suave',
    category: 'drums',
    machineId: 'sampler',
    machine: {
      kind: 'sampler',
      samples: [`${SAMPLE_PATH}perc.wav`],
      voices: 4,
      fadeIn: 0.008,
      fadeOut: 0.22
    },
    noteSource: { kind: 'fixed', note: 'C4' }
  },
  {
    id: 'sub-bass',
    name: 'Sub Bass',
    description: 'Seno grave con filtro bajo y sustain largo',
    category: 'bass',
    machineId: 'bass-synth',
    machine: {
      kind: 'mono',
      oscillator: 'sine',
      envelope: { attack: 0.008, decay: 0.32, sustain: 0.5, release: 0.5 },
      filter: { frequency: 320, q: 0.8 }
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 1, size: 1 }
  },
  {
    id: 'acid-bass',
    name: 'Acid Bass',
    description: 'Sierra corta con resonancia alta',
    category: 'bass',
    machineId: 'bass-synth',
    machine: {
      kind: 'mono',
      oscillator: 'sawtooth',
      envelope: { attack: 0.005, decay: 0.16, sustain: 0.15, release: 0.18 },
      filter: { frequency: 680, q: 9 }
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 2, size: 1 }
  },
  {
    id: 'rubber-bass',
    name: 'Rubber Bass',
    description: 'Cuadrada redonda con filtro medio',
    category: 'bass',
    machineId: 'bass-synth',
    machine: {
      kind: 'mono',
      oscillator: 'square',
      envelope: { attack: 0.01, decay: 0.28, sustain: 0.3, release: 0.32 },
      filter: { frequency: 520, q: 4 }
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 2, size: 1 }
  },
  {
    id: 'warm-pad',
    name: 'Warm Pad',
    description: 'Triángulo largo, cuatro voces y mucha cola',
    category: 'keys',
    machineId: 'analog-pad',
    machine: {
      kind: 'poly',
      oscillator: 'triangle',
      envelope: { attack: 1.6, decay: 2, sustain: 0.78, release: 6 },
      maxPolyphony: 8
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 3, size: 4 }
  },
  {
    id: 'glass-pad',
    name: 'Glass Pad',
    description: 'Seno cristalino con ataque lento',
    category: 'keys',
    machineId: 'soft-pad',
    machine: {
      kind: 'poly',
      oscillator: 'sine',
      envelope: { attack: 0.9, decay: 1.4, sustain: 0.65, release: 5.5 },
      maxPolyphony: 8
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 3, size: 4 }
  },
  {
    id: 'dust-keys',
    name: 'Dust Keys',
    description: 'Cuadrada corta y polvorienta',
    category: 'keys',
    machineId: 'analog-pad',
    machine: {
      kind: 'poly',
      oscillator: 'square',
      envelope: { attack: 0.08, decay: 0.8, sustain: 0.22, release: 2.4 },
      maxPolyphony: 6
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 3, size: 3 }
  },
  {
    id: 'pluck-koto',
    name: 'Pluck Koto',
    description: 'Cuerda pulsada con resonancia metálica',
    category: 'keys',
    machineId: 'pluck',
    machine: {
      kind: 'pluck',
      pluck: {
        attackNoise: 1.4,
        dampening: 3200,
        resonance: 0.92,
        release: 1.3
      }
    },
    noteSource: { kind: 'scale-degree', degree: 0, octave: 4 }
  },
  {
    id: 'fm-bell',
    name: 'FM Bell',
    description: 'Campana FM con cola larga',
    category: 'textures',
    machineId: 'plugin-fm-synth',
    machine: {
      kind: 'plugin',
      pluginId: 'fm-synth',
      params: {
        harmonicity: 3.5,
        modulationIndex: 8,
        attack: 0.005,
        decay: 0.9,
        sustain: 0.1,
        release: 2.2
      }
    },
    noteSource: { kind: 'scale-degree', degree: 0, octave: 5 }
  },
  {
    id: 'fm-brass',
    name: 'FM Brass',
    description: 'Metal suave con sustain y cuerpo',
    category: 'textures',
    machineId: 'plugin-fm-synth',
    machine: {
      kind: 'plugin',
      pluginId: 'fm-synth',
      params: {
        harmonicity: 1.5,
        modulationIndex: 3,
        attack: 0.08,
        decay: 0.4,
        sustain: 0.6,
        release: 1.2
      }
    },
    noteSource: { kind: 'scale-degree', degree: 4, octave: 4 }
  },
  {
    id: 'drone-bed',
    name: 'Drone Bed',
    description: 'Colchón grave de drone para capas',
    category: 'textures',
    machineId: 'drone-sampler',
    machine: {
      kind: 'sampler',
      samples: [`${SAMPLE_PATH}drone.wav`],
      voices: 2,
      fadeIn: 0.01,
      fadeOut: 0.2
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 2, size: 1 }
  },
  {
    id: 'tom-floor',
    name: 'Tom Floor',
    description: 'Tom grave con cuerpo',
    category: 'drums',
    machineId: 'sampler',
    machine: {
      kind: 'sampler',
      samples: [`${SAMPLE_PATH}perc.wav`],
      voices: 2,
      fadeIn: 0.004,
      fadeOut: 0.2
    },
    noteSource: { kind: 'fixed', note: 'C4' }
  },
  {
    id: 'hat-pedal',
    name: 'Hat Pedal',
    description: 'Hi-hat cerrado ultra corto',
    category: 'drums',
    machineId: 'sampler',
    machine: {
      kind: 'sampler',
      samples: [`${SAMPLE_PATH}hihat-05.wav`],
      voices: 1,
      fadeIn: 0.001,
      fadeOut: 0.03
    },
    noteSource: { kind: 'fixed', note: 'C4' }
  },
  {
    id: 'shaker-dry',
    name: 'Shaker Dry',
    description: 'Shaker seco y cercano',
    category: 'drums',
    machineId: 'sampler',
    machine: {
      kind: 'sampler',
      samples: [`${SAMPLE_PATH}hihat-02.wav`],
      voices: 1,
      fadeIn: 0.002,
      fadeOut: 0.06
    },
    noteSource: { kind: 'fixed', note: 'C4' }
  },
  {
    id: 'reese-bass',
    name: 'Reese Bass',
    description: 'Sierra ancha con filtro oscuro',
    category: 'bass',
    machineId: 'bass-synth',
    machine: {
      kind: 'mono',
      oscillator: 'sawtooth',
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.6 },
      filter: { frequency: 420, q: 5 }
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 2, size: 1 }
  },
  {
    id: 'organ-keys',
    name: 'Organ Keys',
    description: 'Órgano cuadrado con ataque rápido',
    category: 'keys',
    machineId: 'soft-pad',
    machine: {
      kind: 'poly',
      oscillator: 'square',
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.8 },
      maxPolyphony: 8
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 3, size: 3 }
  },
  {
    id: 'bell-keys',
    name: 'Bell Keys',
    description: 'Campana de seno con cola media',
    category: 'keys',
    machineId: 'soft-pad',
    machine: {
      kind: 'poly',
      oscillator: 'sine',
      envelope: { attack: 0.01, decay: 1.2, sustain: 0.15, release: 3.5 },
      maxPolyphony: 8
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 4, size: 3 }
  },
  {
    id: 'fm-metal',
    name: 'FM Metal',
    description: 'Metal FM con índice alto',
    category: 'textures',
    machineId: 'plugin-fm-synth',
    machine: {
      kind: 'plugin',
      pluginId: 'fm-synth',
      params: {
        harmonicity: 5.2,
        modulationIndex: 12,
        attack: 0.005,
        decay: 0.5,
        sustain: 0.2,
        release: 1.6
      }
    },
    noteSource: { kind: 'scale-degree', degree: 0, octave: 5 }
  },
  {
    id: 'dark-drone',
    name: 'Dark Drone',
    description: 'Drone grave con cola larga',
    category: 'textures',
    machineId: 'drone-sampler',
    machine: {
      kind: 'sampler',
      samples: [`${SAMPLE_PATH}drone.wav`],
      voices: 2,
      fadeIn: 0.02,
      fadeOut: 0.5
    },
    noteSource: { kind: 'chord', degreeOffset: 0, octave: 1, size: 1 }
  }
];

export function soundPreset(id: string): SoundPreset | undefined {
  return SOUND_BANK.find(entry => entry.id === id);
}
