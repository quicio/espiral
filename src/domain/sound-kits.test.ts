import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KIT_ID,
  SOUND_KITS,
  isSoundOptionForTrack,
  soundKit,
  soundOptionsForTrack
} from './sound-kits';

describe('sound kits', () => {
  it('defines a default kit and four built-in kits', () => {
    expect(soundKit(DEFAULT_KIT_ID)?.name).toBe('Techno Kit');
    expect(SOUND_KITS.filter(kit => kit.builtin)).toHaveLength(4);
  });

  it('offers sounds for every wizard element', () => {
    const elements = [
      'kick',
      'bass',
      'hihat',
      'perc',
      'track-08',
      'track-09',
      'track-10',
      'drone',
      'pad',
      'lead'
    ];

    elements.forEach(trackId => {
      expect(soundOptionsForTrack(trackId).length).toBeGreaterThan(0);
    });
  });

  it('keeps every kit sound valid for its track', () => {
    SOUND_KITS.forEach(kit => {
      Object.entries(kit.sounds).forEach(([trackId, soundId]) => {
        expect(isSoundOptionForTrack(trackId, soundId)).toBe(true);
      });
    });
  });

  it('separates core drum sounds from editable track presets', () => {
    expect(soundOptionsForTrack('kick').map(option => option.id)).toEqual([
      'kick-tight',
      'kick-deep',
      'kick-click'
    ]);
    expect(
      soundOptionsForTrack('pad').some(option => option.id === 'warm-pad')
    ).toBe(true);
    expect(
      soundOptionsForTrack('track-08').some(option => option.id === 'shaker-air')
    ).toBe(true);
  });
});
