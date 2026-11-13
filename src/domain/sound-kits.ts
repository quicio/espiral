import { drumSoundsForTrack } from './drum-sounds';
import { drumKitSoundMap, drumKitSoundName, drumKit } from './drum-kits';
import { SOUND_BANK, type SoundCategory } from './sound-bank';

export interface SoundKit {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sounds: Readonly<Record<string, string>>;
  readonly builtin: boolean;
  /** Drum kit del que salen los slots de batería. */
  readonly drumKitId?: string;
}

export interface SoundOption {
  readonly id: string;
  readonly name: string;
}

export const DEFAULT_KIT_ID = 'techno-kit';

interface SoundKitSpec {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly drumKitId: string;
  /** Sonidos melódicos: bass, pad, lead, drone y los tracks editables. */
  readonly melody: Readonly<Record<string, string>>;
}

const KIT_SPECS: readonly SoundKitSpec[] = [
  {
    id: 'techno-kit',
    name: 'Techno Kit',
    description: 'TR-909 · bajo ácido y hats metálicos',
    drumKitId: '909',
    melody: {
      bass: 'bass-round',
      drone: 'drone-bed',
      pad: 'dust-keys',
      lead: 'fm-metal',
      'track-13': 'dust-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry'
    }
  },
  {
    id: 'house-kit',
    name: 'House Kit',
    description: 'TR-505 · bajo redondo y órgano',
    drumKitId: '505',
    melody: {
      bass: 'bass-round',
      drone: 'drone-bed',
      pad: 'organ-keys',
      lead: 'bell-keys',
      'track-13': 'organ-keys',
      'track-14': 'drone-bed',
      'track-15': 'shaker-dry'
    }
  },
  {
    id: 'trance-kit',
    name: 'Trance Kit',
    description: 'TR-909 SP · hats abiertos y lead brillante',
    drumKitId: '909sp',
    melody: {
      bass: 'bass-round',
      drone: 'dark-drone',
      pad: 'glass-pad',
      lead: 'fm-brass',
      'track-13': 'bell-keys',
      'track-14': 'drone-bed',
      'track-15': 'shaker-air'
    }
  },
  {
    id: 'psy-kit',
    name: 'Psy Kit',
    description: 'TR-909 tight · kick seco y bajo ácido',
    drumKitId: '909t',
    melody: {
      bass: 'acid-bass',
      drone: 'dark-drone',
      pad: 'dust-keys',
      lead: 'fm-metal',
      'track-13': 'dust-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry'
    }
  },
  {
    id: 'dub-kit',
    name: 'Dub Kit',
    description: 'CR-78 · percusión orgánica, sub y eco',
    drumKitId: 'cr78',
    melody: {
      bass: 'bass-dub',
      drone: 'drone-bed',
      pad: 'glass-pad',
      lead: 'fm-bell',
      'track-13': 'organ-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-air'
    }
  },
  {
    id: 'breaks-kit',
    name: 'Breaks Kit',
    description: 'LinnDrum · clap enorme y bajo growl',
    drumKitId: 'linn',
    melody: {
      bass: 'bass-growl',
      drone: 'drone-bed',
      pad: 'dust-keys',
      lead: 'pluck-koto',
      'track-13': 'dust-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry'
    }
  },
  {
    id: 'ambient-kit',
    name: 'Ambient Kit',
    description: 'Pearl Studio acústica · aire y texturas',
    drumKitId: 'pearl',
    melody: {
      bass: 'bass-sub',
      drone: 'drone-bed',
      pad: 'glass-pad',
      lead: 'fm-bell',
      'track-13': 'bell-keys',
      'track-14': 'drone-bed',
      'track-15': 'shaker-air'
    }
  },
  {
    id: 'triphop-kit',
    name: 'Trip-Hop Kit',
    description: 'Rhythm King · sucio, dub y campanas',
    drumKitId: 'mrk2',
    melody: {
      bass: 'bass-dub',
      drone: 'dark-drone',
      pad: 'bell-keys',
      lead: 'fm-bell',
      'track-13': 'bell-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry'
    }
  },
  {
    id: 'hiphop-kit',
    name: 'Hip-Hop Kit',
    description: 'TR-808 · kick largo, clap y cowbell',
    drumKitId: '808',
    melody: {
      bass: 'bass-sub',
      drone: 'drone-bed',
      pad: 'dust-keys',
      lead: 'fm-bell',
      'track-13': 'organ-keys',
      'track-14': 'drone-bed',
      'track-15': 'shaker-dry'
    }
  }
];

export const SOUND_KITS: readonly SoundKit[] = KIT_SPECS.map(spec => ({
  id: spec.id,
  name: spec.name,
  description: spec.description,
  builtin: true,
  drumKitId: spec.drumKitId,
  sounds: {
    ...drumKitSoundMap(spec.drumKitId),
    ...spec.melody
  }
}));

/** Sonidos de un drum kit con nombre listo para mostrar. */
export function drumKitOptions(drumKitId: string): readonly SoundOption[] {
  const kit = drumKit(drumKitId);
  if (!kit) return [];
  return kit.sounds.map(sound => ({
    id: `${kit.id}-${sound.slot}`,
    name: drumKitSoundName(kit.id, sound.slot)
  }));
}

export function soundKit(id: string): SoundKit | undefined {
  return SOUND_KITS.find(kit => kit.id === id);
}

export function soundOptionsForTrack(trackId: string): readonly SoundOption[] {
  const drums = drumSoundsForTrack(trackId);
  const categories = bankCategories(trackId, drums.length > 0);
  const presets = SOUND_BANK.filter(preset => categories.includes(preset.category));
  return [...drums, ...presets].map(sound => ({ id: sound.id, name: sound.name }));
}

export function isSoundOptionForTrack(
  trackId: string,
  soundId: string
): boolean {
  return soundOptionsForTrack(trackId).some(option => option.id === soundId);
}

/**
 * Categorías del banco que se suman a los sonidos de drum kit de un track.
 * Si el track ya tiene una máquina de batería detrás, el banco genérico no
 * aporta: sus presets duplican los mismos dos wavs.
 */
function bankCategories(
  trackId: string,
  hasDrumSounds: boolean
): readonly SoundCategory[] {
  if (trackId === 'bass') return ['bass'];
  if (hasDrumSounds) return [];
  if (trackId === 'pad') return ['keys'];
  if (trackId === 'lead') return ['keys', 'textures'];
  if (trackId === 'drone') return ['textures'];
  if (trackId === 'track-13') return ['keys'];
  if (trackId === 'track-14') return ['textures'];
  return ['drums'];
}
