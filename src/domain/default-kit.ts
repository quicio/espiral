import {
  channelName,
  CHANNEL_KEYS,
  DEFAULT_MIX,
  delayInsert,
  reverbInsert,
  type ChannelKey
} from './channels';
import type { MachineConfig } from './graph';
import type { BusState, KitState, TrackState } from './kit';

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
    envelope: { attack: 2, decay: 1, sustain: 0.8, release: 3 }
  },
  lead: {
    kind: 'poly',
    oscillator: 'triangle',
    envelope: { attack: 0.05, decay: 0.25, sustain: 0.35, release: 1.4 },
    maxPolyphony: 12
  }
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
        machine: MACHINES[key],
        gainDb: mix.volumeDb,
        pan: 0,
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
    tracks[track.id] = track;
  }

  return { id: 'default', name: 'Default', tracks, buses: createDefaultBuses() };
}

export function createDefaultBuses(): readonly BusState[] {
  return [
    {
      id: 'reverb-bus',
      name: 'Reverb',
      returnDb: -14,
      inserts: [reverbInsert(1, 4.5)]
    },
    {
      id: 'delay-bus',
      name: 'Delay',
      returnDb: -16,
      inserts: [delayInsert(1, 0.32, 0.375)]
    }
  ];
}

export function createUserTrack(index: number): TrackState {
  const label = String(index).padStart(2, '0');
  return {
    id: `track-${label}`,
    name: `Track ${label}`,
    role: 'user',
    hasPattern: true,
    machine: {
      kind: 'sampler',
      samples: [SAMPLE_PATH + PERC_FILE],
      voices: 1,
      fadeIn: 0.004,
      fadeOut: 0.08
    },
    gainDb: -10,
    pan: 0,
    muted: false,
    solo: false,
    inserts: [],
    sends: []
  };
}
