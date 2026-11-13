import type { MachineConfig } from './graph';
import {
  DRUM_KITS,
  SLOT_LABEL,
  SLOT_TRACK,
  drumKitSoundId,
  drumKitSoundName,
  drumSlotMachine,
  type DrumSlot
} from './drum-kits';

export interface DrumSound {
  readonly id: string;
  readonly name: string;
  readonly trackId: string;
  readonly machineId: string;
  readonly machine: MachineConfig;
  /**
   * Sonidos históricos que ya no se ofrecen en los selects pero siguen
   * resolviendo, para que los kits guardados en sesiones viejas no se rompan.
   */
  readonly legacy?: boolean;
}

/** Kicks sintetizados: otra familia de sonido, sin samples. */
const SYNTH_SOUNDS: readonly DrumSound[] = [
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
    id: 'kick-sub',
    name: 'Kick Sub',
    trackId: 'kick',
    machineId: 'core-kick',
    machine: {
      kind: 'membrane',
      oscillator: 'sine',
      envelope: { attack: 0.001, decay: 0.7, sustain: 0.01, release: 2.4 }
    }
  }
];

/** Bajos muestreados: se ofrecen en el track de bajo. */
const BASS_SOUNDS: readonly DrumSound[] = [
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
    id: 'bass-pick',
    name: 'Bass Pick',
    trackId: 'bass',
    machineId: 'core-bass',
    machine: {
      kind: 'sampler',
      samples: ['./audio/bass-g.wav'],
      voices: 1,
      fadeIn: 0.002,
      fadeOut: 0.04
    }
  },
  {
    id: 'bass-dub',
    name: 'Bass Dub',
    trackId: 'bass',
    machineId: 'core-bass',
    machine: {
      kind: 'sampler',
      samples: ['./audio/bass-ds.wav'],
      voices: 2,
      fadeIn: 0.004,
      fadeOut: 0.12
    }
  }
];

/**
 * Sonidos viejos construidos sobre los mismos dos wavs (`hihat-0x`, `perc.wav`).
 * Se mantienen resolubles por compatibilidad, pero no se ofrecen como opción.
 */
const LEGACY_SOUNDS: readonly DrumSound[] = [
  legacy('hat-tight', 'Hat Tight', 'hihat', 'hihat-03.wav', 1, 0.002, 0.025),
  legacy('hat-soft', 'Hat Soft', 'hihat', 'hihat-01.wav', 1, 0.003, 0.08),
  legacy('hat-open', 'Hat Open', 'hihat', 'hihat-07.wav', 1, 0.002, 0.35),
  legacy('hat-closed', 'Hat Closed', 'hihat', 'hihat-05.wav', 1, 0.002, 0.04),
  legacy('hat-metal', 'Hat Metal', 'hihat', 'hihat-08.wav', 1, 0.002, 0.2),
  legacy('perc-dry', 'Perc Dry', 'perc', 'perc.wav', 2, 0.002, 0.06),
  legacy('perc-room', 'Perc Room', 'perc', 'perc.wav', 4, 0.008, 0.22),
  legacy('perc-tom', 'Perc Tom', 'perc', 'perc.wav', 2, 0.004, 0.18),
  legacy('perc-click', 'Perc Click', 'perc', 'perc.wav', 1, 0.001, 0.03)
];

function legacy(
  id: string,
  name: string,
  trackId: string,
  file: string,
  voices: number,
  fadeIn: number,
  fadeOut: number
): DrumSound {
  return {
    id,
    name,
    trackId,
    machineId: `core-${trackId}`,
    machine: {
      kind: 'sampler',
      samples: [`./audio/${file}`],
      voices,
      fadeIn,
      fadeOut
    },
    legacy: true
  };
}

/** Un sonido por cada slot de cada drum kit: `909-kick`, `808-clap`, … */
const KIT_SOUNDS: readonly DrumSound[] = DRUM_KITS.flatMap(kit =>
  kit.sounds.map(sound => ({
    id: drumKitSoundId(kit.id, sound.slot),
    name: drumKitSoundName(kit.id, sound.slot),
    trackId: SLOT_TRACK[sound.slot],
    machineId: `kit-${kit.id}`,
    machine: drumSlotMachine(kit.id, sound.slot)
  }))
);

export const DRUM_SOUNDS: readonly DrumSound[] = [
  ...SYNTH_SOUNDS,
  ...KIT_SOUNDS,
  ...BASS_SOUNDS,
  ...LEGACY_SOUNDS
];

export function drumSound(id: string): DrumSound | undefined {
  return DRUM_SOUNDS.find(sound => sound.id === id);
}

export function drumSoundsForTrack(trackId: string): readonly DrumSound[] {
  return DRUM_SOUNDS.filter(sound => sound.trackId === trackId && !sound.legacy);
}

export function drumSoundLabel(slot: DrumSlot): string {
  return SLOT_LABEL[slot];
}
