import type { MachineConfig } from './graph';

/**
 * Drum kits: una máquina concreta (909, 808, LinnDrum…) con sus one-shots.
 *
 * Un kit es la fuente de verdad de *cómo suena* una batería. Los `SOUND_KITS`
 * de `sound-kits.ts` eligen un drum kit y le suman bajo, pad y lead.
 *
 * Para agregar un kit: creá `public/audio/kits/<id>/<slot>.wav` (ver
 * `scripts/fetch-drum-kits.py`) y sumá una entrada acá. Los tests verifican que
 * cada archivo declarado exista en disco.
 */

export type DrumSlot =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'hat-closed'
  | 'hat-open'
  | 'tom'
  | 'perc'
  | 'rim'
  | 'shaker';

export const DRUM_SLOTS: readonly DrumSlot[] = [
  'kick',
  'snare',
  'clap',
  'hat-closed',
  'hat-open',
  'tom',
  'perc',
  'rim',
  'shaker'
];

/** Track del kit al que aterriza cada slot. */
export const SLOT_TRACK: Readonly<Record<DrumSlot, string>> = {
  kick: 'kick',
  snare: 'track-09',
  clap: 'track-11',
  'hat-closed': 'hihat',
  'hat-open': 'track-10',
  tom: 'track-12',
  perc: 'perc',
  rim: 'track-16',
  shaker: 'track-08'
};

export const SLOT_LABEL: Readonly<Record<DrumSlot, string>> = {
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  'hat-closed': 'Hat Cerrado',
  'hat-open': 'Hat Abierto',
  tom: 'Tom',
  perc: 'Percusión',
  rim: 'Rim',
  shaker: 'Shaker'
};

export interface DrumKitSound {
  readonly slot: DrumSlot;
  readonly file: string;
}

export type DrumKitFamily = 'analog' | 'digital' | 'acoustic' | 'hybrid';

export interface DrumKit {
  readonly id: string;
  /** Etiqueta corta que aparece en los selects de sonido. */
  readonly code: string;
  readonly name: string;
  readonly machine: string;
  readonly year: number;
  readonly family: DrumKitFamily;
  readonly styles: readonly string[];
  readonly description: string;
  readonly license: string;
  readonly source: string;
  readonly sounds: readonly DrumKitSound[];
}

export const SAMPLE_KIT_PATH = './audio/kits/';

export const DRUM_KITS: readonly DrumKit[] = [
  {
    id: '909',
    code: 'TR-909',
    name: '909 Detroit',
    machine: 'Roland TR-909',
    year: 1983,
    family: 'hybrid',
    styles: ['techno', 'house', 'trance'],
    description: 'Kick con cuerpo, snare corta y hats metálicos',
    license: 'Public Domain',
    source: 'https://github.com/oramics/sampled/tree/master/DM/TR-909',
    sounds: [
      { slot: 'kick', file: 'kick.wav' },
      { slot: 'snare', file: 'snare.wav' },
      { slot: 'clap', file: 'clap.wav' },
      { slot: 'hat-closed', file: 'hat-closed.wav' },
      { slot: 'hat-open', file: 'hat-open.wav' },
      { slot: 'tom', file: 'tom.wav' },
      { slot: 'perc', file: 'perc.wav' }
    ]
  },
  {
    id: '909t',
    code: '909 Tight',
    name: '909 Tight',
    machine: 'Roland TR-909',
    year: 1983,
    family: 'hybrid',
    styles: ['psytrance', 'techno', 'trance'],
    description: 'Kick corto y percusión seca para arreglos apretados',
    license: 'Public Domain',
    source: 'https://github.com/oramics/sampled/tree/master/DM/TR-909',
    sounds: [
      { slot: 'kick', file: 'kick.wav' },
      { slot: 'snare', file: 'snare.wav' },
      { slot: 'clap', file: 'clap.wav' },
      { slot: 'hat-closed', file: 'hat-closed.wav' },
      { slot: 'hat-open', file: 'hat-open.wav' },
      { slot: 'tom', file: 'tom.wav' },
      { slot: 'perc', file: 'perc.wav' }
    ]
  },
  {
    id: '909sp',
    code: '909 SP',
    name: '909 SP',
    machine: 'Roland TR-909',
    year: 1983,
    family: 'hybrid',
    styles: ['trance', 'house'],
    description: 'Otra toma del 909: más limpio y con hats largos',
    license: 'Public Domain',
    source: 'https://github.com/oramics/sampled/tree/master/DM/TR-909/SP',
    sounds: [
      { slot: 'kick', file: 'kick.wav' },
      { slot: 'snare', file: 'snare.wav' },
      { slot: 'clap', file: 'clap.wav' },
      { slot: 'hat-closed', file: 'hat-closed.wav' },
      { slot: 'hat-open', file: 'hat-open.wav' },
      { slot: 'tom', file: 'tom.wav' },
      { slot: 'perc', file: 'perc.wav' }
    ]
  },
  {
    id: '808',
    code: 'TR-808',
    name: '808',
    machine: 'Roland TR-808',
    year: 1980,
    family: 'analog',
    styles: ['hiphop', 'trap', 'electro', 'dub'],
    description: 'Kick sub largo, snare ruidosa y cowbell',
    license: 'Public Domain',
    source: 'https://github.com/oramics/sampled/tree/master/DM/TR-808',
    sounds: [
      { slot: 'kick', file: 'kick.wav' },
      { slot: 'snare', file: 'snare.wav' },
      { slot: 'clap', file: 'clap.wav' },
      { slot: 'hat-closed', file: 'hat-closed.wav' },
      { slot: 'hat-open', file: 'hat-open.wav' },
      { slot: 'tom', file: 'tom.wav' },
      { slot: 'perc', file: 'perc.wav' },
      { slot: 'rim', file: 'rim.wav' },
      { slot: 'shaker', file: 'shaker.wav' }
    ]
  },
  {
    id: '505',
    code: 'TR-505',
    name: '505',
    machine: 'Roland TR-505',
    year: 1986,
    family: 'digital',
    styles: ['house', 'electro', 'breaks'],
    description: 'Samples PCM de los 80: kick seco y hats brillantes',
    license: 'Public Domain',
    source: 'https://github.com/oramics/sampled/tree/master/DM/TR-505',
    sounds: [
      { slot: 'kick', file: 'kick.wav' },
      { slot: 'snare', file: 'snare.wav' },
      { slot: 'clap', file: 'clap.wav' },
      { slot: 'hat-closed', file: 'hat-closed.wav' },
      { slot: 'hat-open', file: 'hat-open.wav' },
      { slot: 'tom', file: 'tom.wav' },
      { slot: 'perc', file: 'perc.wav' },
      { slot: 'rim', file: 'rim.wav' },
      { slot: 'shaker', file: 'shaker.wav' }
    ]
  },
  {
    id: 'cr78',
    code: 'CR-78',
    name: 'CR-78',
    machine: 'Roland CompuRhythm CR-78',
    year: 1978,
    family: 'analog',
    styles: ['dub', 'triphop', 'ambient'],
    description: 'Percusión orgánica, tambores de mano y mucho espacio',
    license: 'Public Domain',
    source: 'https://github.com/oramics/sampled/tree/master/DM/CR-78',
    sounds: [
      { slot: 'kick', file: 'kick.wav' },
      { slot: 'snare', file: 'snare.wav' },
      { slot: 'hat-closed', file: 'hat-closed.wav' },
      { slot: 'hat-open', file: 'hat-open.wav' },
      { slot: 'tom', file: 'tom.wav' },
      { slot: 'perc', file: 'perc.wav' },
      { slot: 'rim', file: 'rim.wav' },
      { slot: 'shaker', file: 'shaker.wav' }
    ]
  },
  {
    id: 'linn',
    code: 'LM-2',
    name: 'LinnDrum',
    machine: 'LinnDrum LM-2',
    year: 1982,
    family: 'digital',
    styles: ['breaks', 'house', 'electro'],
    description: 'El sonido pop de los 80: snare ancha y clap enorme',
    license: 'Public Domain',
    source: 'https://github.com/oramics/sampled/tree/master/DM/LM-2',
    sounds: [
      { slot: 'kick', file: 'kick.wav' },
      { slot: 'snare', file: 'snare.wav' },
      { slot: 'clap', file: 'clap.wav' },
      { slot: 'hat-closed', file: 'hat-closed.wav' },
      { slot: 'hat-open', file: 'hat-open.wav' },
      { slot: 'tom', file: 'tom.wav' },
      { slot: 'perc', file: 'perc.wav' },
      { slot: 'rim', file: 'rim.wav' },
      { slot: 'shaker', file: 'shaker.wav' }
    ]
  },
  {
    id: 'mrk2',
    code: 'MRK-2',
    name: 'Rhythm King',
    machine: 'Maestro Rhythm King MRK-2',
    year: 1968,
    family: 'analog',
    styles: ['triphop', 'dub', 'lo-fi'],
    description: 'Caja de ritmos de los 60: sucia, rara y con carácter',
    license: 'Public Domain',
    source: 'https://github.com/oramics/sampled/tree/master/DM/MRK-2',
    sounds: [
      { slot: 'kick', file: 'kick.wav' },
      { slot: 'snare', file: 'snare.wav' },
      { slot: 'hat-closed', file: 'hat-closed.wav' },
      { slot: 'hat-open', file: 'hat-open.wav' },
      { slot: 'tom', file: 'tom.wav' },
      { slot: 'perc', file: 'perc.wav' },
      { slot: 'rim', file: 'rim.wav' },
      { slot: 'shaker', file: 'shaker.wav' }
    ]
  },
  {
    id: 'pearl',
    code: 'PEARL',
    name: 'Pearl Studio',
    machine: 'Pearl Master Studio',
    year: 1990,
    family: 'acoustic',
    styles: ['ambient', 'triphop', 'breaks', 'jazz'],
    description: 'Batería acústica grabada: aire real y colas largas',
    license: 'Public Domain',
    source: 'https://github.com/oramics/sampled/tree/master/DRUMS/pearl-master-studio',
    sounds: [
      { slot: 'kick', file: 'kick.wav' },
      { slot: 'snare', file: 'snare.wav' },
      { slot: 'clap', file: 'clap.wav' },
      { slot: 'hat-closed', file: 'hat-closed.wav' },
      { slot: 'hat-open', file: 'hat-open.wav' },
      { slot: 'tom', file: 'tom.wav' },
      { slot: 'perc', file: 'perc.wav' }
    ]
  }
];

/** Ajustes de voz por slot: cuántas voces y cuánto fade antes de cortar. */
const SLOT_VOICE: Readonly<
  Record<DrumSlot, { voices: number; fadeIn: number; fadeOut: number }>
> = {
  kick: { voices: 1, fadeIn: 0.001, fadeOut: 0.02 },
  snare: { voices: 2, fadeIn: 0.001, fadeOut: 0.03 },
  clap: { voices: 3, fadeIn: 0.002, fadeOut: 0.04 },
  'hat-closed': { voices: 1, fadeIn: 0.001, fadeOut: 0.015 },
  'hat-open': { voices: 1, fadeIn: 0.001, fadeOut: 0.03 },
  tom: { voices: 2, fadeIn: 0.001, fadeOut: 0.03 },
  perc: { voices: 3, fadeIn: 0.002, fadeOut: 0.03 },
  rim: { voices: 2, fadeIn: 0.001, fadeOut: 0.02 },
  shaker: { voices: 2, fadeIn: 0.002, fadeOut: 0.02 }
};

export function drumKit(id: string): DrumKit | undefined {
  return DRUM_KITS.find(kit => kit.id === id);
}

/** id del sonido de un slot: `909-kick`, `808-clap`, … */
export function drumKitSoundId(kitId: string, slot: DrumSlot): string {
  return `${kitId}-${slot}`;
}

export function drumKitSamplePath(kitId: string, file: string): string {
  return `${SAMPLE_KIT_PATH}${kitId}/${file}`;
}

export function drumSlotMachine(kitId: string, slot: DrumSlot): MachineConfig {
  const kit = drumKit(kitId);
  const entry = kit?.sounds.find(sound => sound.slot === slot);
  const voice = SLOT_VOICE[slot];
  return {
    kind: 'sampler',
    samples: entry ? [drumKitSamplePath(kitId, entry.file)] : [],
    voices: voice.voices,
    fadeIn: voice.fadeIn,
    fadeOut: voice.fadeOut
  };
}

export function drumKitSoundName(kitId: string, slot: DrumSlot): string {
  const kit = drumKit(kitId);
  return `${kit?.code ?? kitId} ${SLOT_LABEL[slot]}`;
}

/** Mapa trackId → soundId con todos los slots de un kit. */
export function drumKitSoundMap(kitId: string): Record<string, string> {
  const kit = drumKit(kitId);
  if (!kit) return {};
  return Object.fromEntries(
    kit.sounds.map(sound => [SLOT_TRACK[sound.slot], drumKitSoundId(kitId, sound.slot)])
  );
}
