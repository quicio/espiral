import {
  channelName,
  CHANNEL_KEYS,
  DEFAULT_MIX,
  delayInsert,
  reverbInsert,
  type ChannelKey
} from './channels';
import type { MachineConfig, SendConfig } from './graph';
import type { BusState, KitState, TrackState } from './kit';
import { machinePreset, type MachinePreset, type NoteSource } from './machines';

export const SAMPLE_PATH = './audio/';

export const BASS_FILES = [
  'bass-a.wav',
  'bass-b.wav',
  'bass-cs.wav',
  'bass-ds.wav',
  'bass-f.wav',
  'bass-g.wav'
] as const;

export const HIHAT_FILES = [
  'hihat-01.wav',
  'hihat-02.wav',
  'hihat-03.wav',
  'hihat-04.wav',
  'hihat-05.wav',
  'hihat-06.wav',
  'hihat-07.wav',
  'hihat-08.wav'
] as const;

export const DRONE_FILE = 'drone.wav';
export const PERC_FILE = 'perc.wav';

const MACHINES: Record<ChannelKey, MachineConfig> = {
  kick: {
    kind: 'membrane',
    oscillator: 'sine',
    envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
  },
  bass: {
    kind: 'sampler',
    samples: BASS_FILES.map(file => SAMPLE_PATH + file),
    voices: 2,
    fadeIn: 0.004,
    fadeOut: 0.05
  },
  hihat: {
    kind: 'sampler',
    samples: HIHAT_FILES.map(file => SAMPLE_PATH + file),
    voices: 1,
    fadeIn: 0.003,
    fadeOut: 0.03
  },
  perc: {
    kind: 'sampler',
    samples: [SAMPLE_PATH + PERC_FILE],
    voices: 4,
    fadeIn: 0.004,
    fadeOut: 0.1
  },
  drone: {
    kind: 'sampler',
    samples: [SAMPLE_PATH + DRONE_FILE],
    voices: 2,
    fadeIn: 0.01,
    fadeOut: 0.2
  },
  pad: {
    kind: 'poly',
    oscillator: 'sine',
    envelope: { attack: 2, decay: 1, sustain: 0.8, release: 3 },
    maxPolyphony: 8
  },
  lead: {
    kind: 'poly',
    oscillator: 'triangle',
    envelope: { attack: 0.05, decay: 0.25, sustain: 0.35, release: 1.4 },
    maxPolyphony: 12
  }
};

const CORE_PAN: Record<ChannelKey, number> = {
  kick: 0,
  bass: -0.04,
  hihat: 0.16,
  perc: -0.18,
  drone: 0.06,
  pad: -0.08,
  lead: 0.12
};

interface LayerCharacter {
  readonly name: string;
  readonly gainDb: number;
  readonly pan: number;
  readonly sends: readonly SendConfig[];
}

const LAYER_CHARACTER: Readonly<Record<string, LayerCharacter>> = {
  'track-08': {
    name: 'Shaker 08',
    gainDb: -15,
    pan: 0.24,
    sends: [
      { busId: 'reverb-bus', amount: 0.22, preFader: false },
      { busId: 'delay-bus', amount: 0.1, preFader: false }
    ]
  },
  'track-09': {
    name: 'Perc 09',
    gainDb: -13,
    pan: -0.26,
    sends: [
      { busId: 'delay-bus', amount: 0.18, preFader: false },
      { busId: 'reverb-bus', amount: 0.12, preFader: false }
    ]
  }
};

const DEFAULT_TRACK_ORDER = [
  'kick',
  'bass',
  'hihat',
  'perc',
  'track-08',
  'track-09',
  'track-10',
  'track-11',
  'drone',
  'pad',
  'lead',
  'track-12',
  'track-13',
  'track-14',
  'track-15',
  'track-16'
] as const;

const CORE_MACHINE_IDS: Record<ChannelKey, string> = {
  kick: 'core-kick',
  bass: 'core-bass',
  hihat: 'core-hihat',
  perc: 'core-perc',
  drone: 'drone-sampler',
  pad: 'soft-pad',
  lead: 'lead-synth'
};

export function createDefaultKit(): KitState {
  const tracks = Object.fromEntries(
    CHANNEL_KEYS.map(key => {
      const mix = DEFAULT_MIX[key];
      const track: TrackState = {
        id: key,
        name: channelName(key),
        role: key,
        hasPattern: key === 'kick' || key === 'bass' || key === 'hihat' || key === 'perc',
        machineId: CORE_MACHINE_IDS[key],
        machine: MACHINES[key],
        noteSource: coreNoteSource(key),
        macros: [0.5, 0.5],
        gainDb: mix.volumeDb,
        pan: CORE_PAN[key],
        muted: mix.muted,
        solo: mix.solo,
        inserts: mix.inserts,
        sends: []
      };
      return [key, track];
    })
  ) as Record<string, TrackState>;

  for (let index = 8; index <= 16; index += 1) {
    const track = createUserTrack(index);
    const character = LAYER_CHARACTER[track.id];
    tracks[track.id] = character ? { ...track, ...character } : track;
  }

  const ordered = Object.fromEntries(
    DEFAULT_TRACK_ORDER.flatMap(id => {
      const track = tracks[id];
      return track ? [[id, track] as const] : [];
    })
  ) as Record<string, TrackState>;

  return { id: 'default', name: 'Default', tracks: ordered, buses: createDefaultBuses() };
}

export function createDefaultBuses(): readonly BusState[] {
  return [
    {
      id: 'reverb-bus',
      name: 'Reverb',
      returnDb: -14,
      inserts: [reverbInsert(1, 4.5)],
      sends: []
    },
    {
      id: 'delay-bus',
      name: 'Delay',
      returnDb: -16,
      inserts: [delayInsert(1, 0.32, 0.375)],
      sends: []
    }
  ];
}

export function createBus(index: number): BusState {
  const label = String(index).padStart(2, '0');
  return {
    id: `bus-${label}`,
    name: `Bus ${label}`,
    returnDb: -12,
    inserts: [],
    sends: []
  };
}

export function createUserTrack(
  index: number,
  machineId = 'sampler',
  presetOverride?: MachinePreset
): TrackState {
  const label = String(index).padStart(2, '0');
  const preset = presetOverride ?? machinePreset(machineId);
  const samplerSample =
    index % 3 === 0
      ? PERC_FILE
      : HIHAT_FILES[(index - 8) % HIHAT_FILES.length] ?? PERC_FILE;
  const machine: MachineConfig =
    preset.id === 'sampler'
      ? {
          kind: 'sampler',
          samples: [SAMPLE_PATH + samplerSample],
          voices: 1,
          fadeIn: 0.004,
          fadeOut: 0.08
        }
      : preset.machine;

  return {
    id: `track-${label}`,
    name: preset.id === 'sampler' ? `Track ${label}` : `${preset.name} ${label}`,
    role: 'user',
    hasPattern: true,
    machineId: preset.id,
    machine,
    noteSource: preset.noteSource,
    macros: [0.5, 0.5],
    gainDb: -10,
    pan: 0,
    muted: false,
    solo: false,
    inserts: [],
    sends: []
  };
}

function coreNoteSource(key: ChannelKey): NoteSource {
  if (key === 'pad') return { kind: 'chord', degreeOffset: 0, octave: 3, size: 4 };
  if (key === 'lead') return { kind: 'scale-degree', degree: 4, octave: 4 };
  if (key === 'drone' || key === 'bass') {
    return { kind: 'chord', degreeOffset: 0, octave: 2, size: 1 };
  }
  return { kind: 'fixed', note: 'C4' };
}
