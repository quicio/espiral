import type { MachineConfig } from './graph';

export interface DrumSound {
  readonly id: string;
  readonly name: string;
  readonly trackId: 'kick' | 'bass' | 'hihat' | 'perc';
  readonly machineId: string;
  readonly machine: MachineConfig;
}

export const DRUM_SOUNDS: readonly DrumSound[] = [
  {
    id: 'kick-tight',
    name: 'Kick Tight',
    trackId: 'kick',
    machineId: 'core-kick',
    machine: {
      kind: 'membrane',
      oscillator: 'sine',
      envelope: { attack: 0.001, decay: 0.26, sustain: 0.01, release: 0.8 }
    }
  },
  {
    id: 'kick-deep',
    name: 'Kick Deep',
    trackId: 'kick',
    machineId: 'core-kick',
    machine: {
      kind: 'membrane',
      oscillator: 'sine',
      envelope: { attack: 0.001, decay: 0.5, sustain: 0.01, release: 1.8 }
    }
  },
  {
    id: 'kick-click',
    name: 'Kick Click',
    trackId: 'kick',
    machineId: 'core-kick',
    machine: {
      kind: 'membrane',
      oscillator: 'triangle',
      envelope: { attack: 0.001, decay: 0.18, sustain: 0.01, release: 0.55 }
    }
  },
  {
    id: 'bass-sub',
    name: 'Bass Sub',
    trackId: 'bass',
    machineId: 'core-bass',
    machine: {
      kind: 'sampler',
      samples: ['./audio/bass-a.wav'],
      voices: 1,
      fadeIn: 0.004,
      fadeOut: 0.05
    }
  },
  {
    id: 'bass-round',
    name: 'Bass Round',
    trackId: 'bass',
    machineId: 'core-bass',
    machine: {
      kind: 'sampler',
      samples: ['./audio/bass-cs.wav'],
      voices: 1,
      fadeIn: 0.004,
      fadeOut: 0.06
    }
  },
  {
    id: 'bass-growl',
    name: 'Bass Growl',
    trackId: 'bass',
    machineId: 'core-bass',
    machine: {
      kind: 'sampler',
      samples: ['./audio/bass-f.wav'],
      voices: 2,
      fadeIn: 0.003,
      fadeOut: 0.08
    }
  },
  {
    id: 'hat-tight',
    name: 'Hat Tight',
    trackId: 'hihat',
    machineId: 'core-hihat',
    machine: {
      kind: 'sampler',
      samples: ['./audio/hihat-03.wav'],
      voices: 1,
      fadeIn: 0.002,
      fadeOut: 0.025
    }
  },
  {
    id: 'hat-soft',
    name: 'Hat Soft',
    trackId: 'hihat',
    machineId: 'core-hihat',
    machine: {
      kind: 'sampler',
      samples: ['./audio/hihat-01.wav'],
      voices: 1,
      fadeIn: 0.003,
      fadeOut: 0.08
    }
  },
  {
    id: 'hat-open',
    name: 'Hat Open',
    trackId: 'hihat',
    machineId: 'core-hihat',
    machine: {
      kind: 'sampler',
      samples: ['./audio/hihat-07.wav'],
      voices: 1,
      fadeIn: 0.002,
      fadeOut: 0.35
    }
  },
  {
    id: 'perc-dry',
    name: 'Perc Dry',
    trackId: 'perc',
    machineId: 'core-perc',
    machine: {
      kind: 'sampler',
      samples: ['./audio/perc.wav'],
      voices: 2,
      fadeIn: 0.002,
      fadeOut: 0.06
    }
  },
  {
    id: 'perc-room',
    name: 'Perc Room',
    trackId: 'perc',
    machineId: 'core-perc',
    machine: {
      kind: 'sampler',
      samples: ['./audio/perc.wav'],
      voices: 4,
      fadeIn: 0.008,
      fadeOut: 0.22
    }
  }
];

export function drumSound(id: string): DrumSound | undefined {
  return DRUM_SOUNDS.find(sound => sound.id === id);
}

export function drumSoundsForTrack(trackId: string): readonly DrumSound[] {
  return DRUM_SOUNDS.filter(sound => sound.trackId === trackId);
}
