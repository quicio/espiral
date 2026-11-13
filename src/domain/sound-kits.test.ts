import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KIT_ID,
  SOUND_KITS,
  drumKitOptions,
  isSoundOptionForTrack,
  soundKit,
  soundOptionsForTrack
} from './sound-kits';
import { DRUM_KITS } from './drum-kits';

describe('sound kits', () => {
  it('define un kit por defecto y nueve kits built-in', () => {
    expect(soundKit(DEFAULT_KIT_ID)?.name).toBe('Techno Kit');
    expect(SOUND_KITS.filter(kit => kit.builtin)).toHaveLength(9);
  });

  it('asigna un drum kit distinto a cada kit built-in', () => {
    const drumKitIds = SOUND_KITS.map(kit => kit.drumKitId);
    expect(drumKitIds.every(Boolean)).toBe(true);
    expect(new Set(drumKitIds).size).toBe(SOUND_KITS.length);
    drumKitIds.forEach(id => {
      expect(DRUM_KITS.some(kit => kit.id === id), id).toBe(true);
    });
  });

  it('ofrece sonidos para cada elemento del wizard', () => {
    const elements = [
      'kick',
      'bass',
      'hihat',
      'perc',
      'track-08',
      'track-09',
      'track-10',
      'track-11',
      'track-12',
      'drone',
      'pad',
      'lead',
      'track-13',
      'track-14',
      'track-15',
      'track-16'
    ];

    elements.forEach(trackId => {
      expect(soundOptionsForTrack(trackId).length, trackId).toBeGreaterThan(0);
    });
  });

  it('mantiene válido cada sonido de cada kit', () => {
    SOUND_KITS.forEach(kit => {
      Object.entries(kit.sounds).forEach(([trackId, soundId]) => {
        expect(isSoundOptionForTrack(trackId, soundId), `${kit.id}: ${trackId}`).toBe(true);
      });
    });
  });

  it('ofrece una variante por máquina en cada slot de batería', () => {
    const kickOptions = soundOptionsForTrack('kick').map(option => option.id);
    expect(kickOptions.slice(0, 4)).toEqual([
      'kick-tight',
      'kick-deep',
      'kick-click',
      'kick-sub'
    ]);
    DRUM_KITS.forEach(kit => {
      expect(kickOptions, kit.id).toContain(`${kit.id}-kick`);
      expect(
        soundOptionsForTrack('hihat').map(option => option.id),
        kit.id
      ).toContain(`${kit.id}-hat-closed`);
    });
  });

  it('mezcla bajos muestreados y sintetizados en el track de bajo', () => {
    const bass = soundOptionsForTrack('bass').map(option => option.id);
    expect(bass).toContain('bass-round');
    expect(bass).toContain('acid-bass');
    expect(bass).toContain('reese-bass');
  });

  it('oculta los sonidos legacy de los selects', () => {
    const hats = soundOptionsForTrack('hihat').map(option => option.id);
    expect(hats).not.toContain('hat-tight');
    expect(hats).not.toContain('hat-metal');
  });

  it('expone los sonidos de un drum kit con nombre corto', () => {
    expect(drumKitOptions('808')[0]).toEqual({ id: '808-kick', name: 'TR-808 Kick' });
    expect(drumKitOptions('nope')).toEqual([]);
  });
});
