import { describe, expect, it } from 'vitest';
import { MACHINE_PRESETS, USER_MACHINE_IDS, machinePreset } from './machines';
import { SOUND_BANK } from './sound-bank';

describe('Acid 303', () => {
  it('exposes a dedicated mono preset with filter envelope and glide', () => {
    const preset = MACHINE_PRESETS['acid-303'];

    expect(USER_MACHINE_IDS).toContain('acid-303');
    expect(preset?.machine.kind).toBe('mono');
    expect(preset?.machine.oscillator).toBe('sawtooth');
    expect(preset?.machine.filter?.q).toBeGreaterThan(10);
    expect(preset?.machine.filterEnvelope?.octaves).toBeGreaterThan(2);
    expect(preset?.machine.glide).toBeGreaterThan(0);
    expect(machinePreset('acid-303').name).toBe('Acid 303');
  });

  it('has editable filter envelope and glide params', () => {
    const preset = machinePreset('acid-303');
    const env = preset.params.find(param => param.id === 'filterEnv-octaves');
    const glide = preset.params.find(param => param.id === 'glide');

    expect(env).toBeDefined();
    expect(glide).toBeDefined();

    const withEnv = env!.set(preset.machine, 4.5);
    expect(env!.get(withEnv)).toBe(4.5);
    const withGlide = glide!.set(preset.machine, 0.12);
    expect(glide!.get(withGlide)).toBe(0.12);
  });

  it('is also available as a sound bank preset', () => {
    const preset = SOUND_BANK.find(entry => entry.id === 'acid-303');

    expect(preset?.machineId).toBe('acid-303');
    expect(preset?.machine.filterEnvelope?.octaves).toBe(3.2);
    expect(preset?.noteSource.kind).toBe('scale-degree');
  });
});
