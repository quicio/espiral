import { drumSoundsForTrack } from './drum-sounds';
import { SOUND_BANK, type SoundCategory } from './sound-bank';

export interface SoundKit {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly sounds: Readonly<Record<string, string>>;
  readonly builtin: boolean;
}

export interface SoundOption {
  readonly id: string;
  readonly name: string;
}

export const DEFAULT_KIT_ID = 'techno-kit';

export const SOUND_KITS: readonly SoundKit[] = [
  {
    id: 'techno-kit',
    name: 'Techno Kit',
    description: 'Kick seco, hats cerrados y bajo rodante',
    builtin: true,
    sounds: {
      kick: 'kick-tight',
      bass: 'bass-round',
      hihat: 'hat-tight',
      perc: 'perc-dry',
      'track-08': 'shaker-air',
      'track-09': 'rim-tick',
      'track-10': 'hat-tight',
      'track-11': 'clap-soft',
      'track-12': 'tom-floor',
      'track-13': 'organ-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry',
      'track-16': 'rim-tick',
      drone: 'drone-bed',
      pad: 'warm-pad',
      lead: 'fm-brass'
    }
  },
  {
    id: 'dub-kit',
    name: 'Dub Kit',
    description: 'Graves largos, hats suaves y eco',
    builtin: true,
    sounds: {
      kick: 'kick-deep',
      bass: 'bass-sub',
      hihat: 'hat-soft',
      perc: 'perc-room',
      'track-08': 'shaker-air',
      'track-09': 'rim-tick',
      'track-10': 'hat-tight',
      'track-11': 'clap-soft',
      'track-12': 'tom-floor',
      'track-13': 'organ-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry',
      'track-16': 'rim-tick',
      drone: 'drone-bed',
      pad: 'glass-pad',
      lead: 'fm-bell'
    }
  },
  {
    id: 'breaks-kit',
    name: 'Breaks Kit',
    description: 'Kick con click, percusión rota y bajo growl',
    builtin: true,
    sounds: {
      kick: 'kick-click',
      bass: 'bass-growl',
      hihat: 'hat-tight',
      perc: 'perc-room',
      'track-08': 'shaker-air',
      'track-09': 'rim-tick',
      'track-10': 'clap-soft',
      'track-11': 'clap-soft',
      'track-12': 'tom-floor',
      'track-13': 'dust-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry',
      'track-16': 'rim-tick',
      drone: 'drone-bed',
      pad: 'dust-keys',
      lead: 'pluck-koto'
    }
  },
  {
    id: 'ambient-kit',
    name: 'Ambient Kit',
    description: 'Kick profundo, aire y texturas',
    builtin: true,
    sounds: {
      kick: 'kick-deep',
      bass: 'bass-sub',
      hihat: 'hat-soft',
      perc: 'perc-room',
      'track-08': 'shaker-air',
      'track-09': 'rim-tick',
      'track-10': 'hat-tight',
      'track-11': 'clap-soft',
      'track-12': 'tom-floor',
      'track-13': 'bell-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry',
      'track-16': 'rim-tick',
      drone: 'drone-bed',
      pad: 'glass-pad',
      lead: 'fm-bell'
    }
  },
  {
    id: 'house-kit',
    name: 'House Kit',
    description: 'Kick seco, hats cerrados y órgano',
    builtin: true,
    sounds: {
      kick: 'kick-tight',
      bass: 'bass-round',
      hihat: 'hat-closed',
      perc: 'perc-dry',
      'track-08': 'shaker-dry',
      'track-09': 'hat-pedal',
      'track-10': 'clap-soft',
      'track-11': 'clap-soft',
      'track-12': 'tom-floor',
      'track-13': 'organ-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry',
      'track-16': 'rim-tick',
      drone: 'dark-drone',
      pad: 'organ-keys',
      lead: 'bell-keys'
    }
  },
  {
    id: 'trance-kit',
    name: 'Trance Kit',
    description: 'Hats abiertos, kick firme y lead brillante',
    builtin: true,
    sounds: {
      kick: 'kick-tight',
      bass: 'bass-round',
      hihat: 'hat-open',
      perc: 'perc-room',
      'track-08': 'shaker-air',
      'track-09': 'hat-pedal',
      'track-10': 'tom-floor',
      'track-11': 'clap-soft',
      'track-12': 'tom-floor',
      'track-13': 'bell-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry',
      'track-16': 'rim-tick',
      drone: 'dark-drone',
      pad: 'glass-pad',
      lead: 'fm-brass'
    }
  },
  {
    id: 'psy-kit',
    name: 'Psy Kit',
    description: 'Kick click, percusión seca y metal FM',
    builtin: true,
    sounds: {
      kick: 'kick-click',
      bass: 'bass-growl',
      hihat: 'hat-tight',
      perc: 'perc-click',
      'track-08': 'shaker-dry',
      'track-09': 'rim-tick',
      'track-10': 'hat-pedal',
      'track-11': 'clap-soft',
      'track-12': 'tom-floor',
      'track-13': 'dust-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry',
      'track-16': 'rim-tick',
      drone: 'dark-drone',
      pad: 'dust-keys',
      lead: 'fm-metal'
    }
  },
  {
    id: 'triphop-kit',
    name: 'Trip-Hop Kit',
    description: 'Graves dub, percusión rota y campanas',
    builtin: true,
    sounds: {
      kick: 'kick-deep',
      bass: 'bass-dub',
      hihat: 'hat-soft',
      perc: 'perc-tom',
      'track-08': 'shaker-air',
      'track-09': 'rim-tick',
      'track-10': 'clap-soft',
      'track-11': 'clap-soft',
      'track-12': 'tom-floor',
      'track-13': 'bell-keys',
      'track-14': 'dark-drone',
      'track-15': 'shaker-dry',
      'track-16': 'rim-tick',
      drone: 'dark-drone',
      pad: 'bell-keys',
      lead: 'fm-bell'
    }
  }
];

export function soundKit(id: string): SoundKit | undefined {
  return SOUND_KITS.find(kit => kit.id === id);
}

export function soundOptionsForTrack(trackId: string): readonly SoundOption[] {
  const drums = drumSoundsForTrack(trackId);
  if (drums.length > 0) {
    return drums.map(sound => ({ id: sound.id, name: sound.name }));
  }

  const categories = categoriesForTrack(trackId);
  return SOUND_BANK.filter(preset => categories.includes(preset.category)).map(
    preset => ({ id: preset.id, name: preset.name })
  );
}

export function isSoundOptionForTrack(
  trackId: string,
  soundId: string
): boolean {
  return soundOptionsForTrack(trackId).some(option => option.id === soundId);
}

function categoriesForTrack(trackId: string): readonly SoundCategory[] {
  if (trackId === 'pad') return ['keys'];
  if (trackId === 'lead') return ['keys', 'textures'];
  if (trackId === 'drone') return ['textures'];
  if (trackId === 'track-13') return ['keys'];
  if (trackId === 'track-14') return ['textures'];
  return ['drums'];
}
