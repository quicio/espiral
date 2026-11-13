import { describe, expect, it } from 'vitest';
import {
  DRUM_KITS,
  DRUM_SLOTS,
  SAMPLE_KIT_PATH,
  SLOT_LABEL,
  SLOT_TRACK,
  drumKit,
  drumKitSamplePath,
  drumKitSoundId,
  drumKitSoundMap,
  drumKitSoundName,
  drumSlotMachine
} from './drum-kits';

// La existencia real de los wav se valida en scripts/check-drum-kits.ts
// (vite-node), que corre antes de `npm test`.

describe('drum kits', () => {
  it('define ids y códigos únicos', () => {
    const ids = DRUM_KITS.map(kit => kit.id);
    const codes = DRUM_KITS.map(kit => kit.code);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('trae kick, hats y al menos seis slots por kit', () => {
    DRUM_KITS.forEach(kit => {
      const slots = kit.sounds.map(sound => sound.slot);
      expect(slots, kit.id).toContain('kick');
      expect(slots, kit.id).toContain('hat-closed');
      expect(slots, kit.id).toContain('hat-open');
      expect(slots.length, kit.id).toBeGreaterThanOrEqual(6);
      expect(new Set(slots).size, kit.id).toBe(slots.length);
    });
  });

  it('declara licencia, origen y estilos', () => {
    DRUM_KITS.forEach(kit => {
      expect(kit.license, kit.id).toMatch(/Public Domain|CC0/);
      expect(kit.source, kit.id).toMatch(/^https:\/\//);
      expect(kit.styles.length, kit.id).toBeGreaterThan(0);
    });
  });

  it('apunta siempre a un wav dentro del kit', () => {
    DRUM_KITS.forEach(kit => {
      kit.sounds.forEach(sound => {
        const path = drumKitSamplePath(kit.id, sound.file);
        expect(path).toBe(`${SAMPLE_KIT_PATH}${kit.id}/${sound.file}`);
        expect(sound.file.endsWith('.wav')).toBe(true);
      });
    });
  });

  it('mapea cada slot a un track del kit', () => {
    DRUM_SLOTS.forEach(slot => {
      expect(SLOT_TRACK[slot]).toMatch(/^(kick|bass|hihat|perc|track-\d+)$/);
      expect(SLOT_LABEL[slot].length).toBeGreaterThan(0);
    });
  });

  it('arma ids y mapas de sonido estables', () => {
    expect(drumKitSoundId('909', 'kick')).toBe('909-kick');
    expect(drumKitSoundName('909', 'kick')).toBe('TR-909 Kick');
    expect(drumKitSoundMap('808')).toMatchObject({
      kick: '808-kick',
      'track-09': '808-snare',
      'track-11': '808-clap',
      hihat: '808-hat-closed',
      'track-10': '808-hat-open',
      'track-12': '808-tom',
      perc: '808-perc',
      'track-16': '808-rim',
      'track-08': '808-shaker'
    });
    expect(drumKit('nope')).toBeUndefined();
    expect(drumKitSoundMap('nope')).toEqual({});
  });

  it('construye una máquina sampler por slot', () => {
    const machine = drumSlotMachine('pearl', 'kick');
    expect(machine.kind).toBe('sampler');
    expect(machine.samples).toEqual(['./audio/kits/pearl/kick.wav']);
    expect(machine.voices).toBe(1);
    expect(drumSlotMachine('pearl', 'perc').voices).toBe(3);
    expect(drumSlotMachine('nope', 'kick').samples).toEqual([]);
  });
});
