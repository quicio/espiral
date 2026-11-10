import { describe, expect, it } from 'vitest';
import {
  SOUND_BANK,
  SOUND_CATEGORIES,
  soundPreset
} from './sound-bank';

describe('sound bank', () => {
  it('has unique ids and every category covered', () => {
    const ids = SOUND_BANK.map(preset => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    SOUND_CATEGORIES.forEach(category => {
      expect(SOUND_BANK.some(preset => preset.category === category.id)).toBe(true);
    });
  });

  it('describes a machine and a note source for every preset', () => {
    SOUND_BANK.forEach(preset => {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
      expect(preset.machine.kind.length).toBeGreaterThan(0);
      expect(preset.noteSource.kind.length).toBeGreaterThan(0);
      expect(soundPreset(preset.id)).toBe(preset);
    });
  });

  it('returns undefined for unknown presets', () => {
    expect(soundPreset('missing')).toBeUndefined();
  });
});
