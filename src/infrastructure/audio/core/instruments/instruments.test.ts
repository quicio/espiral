import { describe, expect, it } from 'vitest';
import type { MachineConfig } from '../../../../domain/graph';
import { FmInstrument } from './fm-instrument';
import { MonoVoice } from './mono-voice';
import { PluckInstrument } from './pluck-instrument';
import { PolyInstrument } from './poly-instrument';
import { SamplerInstrument } from './sampler-instrument';

const SAMPLE_RATE = 48_000;

const monoMachine: MachineConfig = {
  kind: 'mono',
  oscillator: 'sawtooth',
  envelope: { attack: 0.001, decay: 0.1, sustain: 0.4, release: 0.1 },
  filter: { frequency: 900, q: 4 },
  filterEnvelope: {
    octaves: 2,
    attack: 0.001,
    decay: 0.15,
    sustain: 0.2,
    release: 0.1
  }
};

function peak(samples: Float32Array): number {
  let value = 0;
  for (const sample of samples) value = Math.max(value, Math.abs(sample));
  return value;
}

function renderInstrument(
  instrument: { render(): number },
  seconds: number
): Float32Array {
  const frames = Math.round(seconds * SAMPLE_RATE);
  const output = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    output[index] = instrument.render();
  }
  return output;
}

describe('MonoVoice', () => {
  it('renders a note and releases it', () => {
    const voice = new MonoVoice(monoMachine, SAMPLE_RATE);
    voice.trigger(45, 1, 0.2, false, false);
    const samples = renderInstrument(voice, 0.5);
    expect(peak(samples)).toBeGreaterThan(0.01);
    expect(samples.some(sample => !Number.isFinite(sample))).toBe(false);
  });

  it('supports accent and glide', () => {
    const voice = new MonoVoice(
      { ...monoMachine, glide: 0.05 },
      SAMPLE_RATE
    );
    voice.trigger(45, 1, 0.2, true, true, 40);
    const samples = renderInstrument(voice, 0.3);
    expect(peak(samples)).toBeGreaterThan(0.01);
  });
});

describe('PolyInstrument', () => {
  it('renders chords with a fixed voice pool', () => {
    const instrument = new PolyInstrument(
      {
        ...monoMachine,
        kind: 'poly',
        maxPolyphony: 4
      },
      SAMPLE_RATE
    );
    instrument.triggerSynth([60, 64, 67], 0.2, 1, false, false);
    const samples = renderInstrument(instrument, 0.4);
    expect(peak(samples)).toBeGreaterThan(0.01);
    expect(samples.some(sample => !Number.isFinite(sample))).toBe(false);
  });
});

describe('PluckInstrument', () => {
  it('rings and decays deterministically', () => {
    const machine: MachineConfig = {
      kind: 'pluck',
      pluck: {
        attackNoise: 1,
        dampening: 4000,
        resonance: 0.9,
        release: 1
      }
    };
    const first = new PluckInstrument(machine, SAMPLE_RATE);
    const second = new PluckInstrument(machine, SAMPLE_RATE);
    first.triggerSynth([60], 0.2, 1, false, false, 1234);
    second.triggerSynth([60], 0.2, 1, false, false, 1234);
    const firstSamples = renderInstrument(first, 0.5);
    const secondSamples = renderInstrument(second, 0.5);
    expect(firstSamples).toEqual(secondSamples);
    expect(peak(firstSamples)).toBeGreaterThan(0.01);
    expect(peak(firstSamples.subarray(0, 2_400))).toBeGreaterThan(
      peak(firstSamples.subarray(21_600, 24_000))
    );
  });
});

describe('FmInstrument', () => {
  it('renders the fm-synth plugin', () => {
    const machine: MachineConfig = {
      kind: 'plugin',
      pluginId: 'fm-synth',
      params: {
        harmonicity: 2,
        modulationIndex: 5,
        attack: 0.01,
        decay: 0.2,
        sustain: 0.4,
        release: 0.3
      }
    };
    const instrument = new FmInstrument(machine, SAMPLE_RATE);
    instrument.triggerSynth([60], 0.2, 1, false, false);
    const samples = renderInstrument(instrument, 0.4);
    expect(peak(samples)).toBeGreaterThan(0.01);
    expect(samples.some(sample => !Number.isFinite(sample))).toBe(false);
  });
});

describe('SamplerInstrument', () => {
  it('plays a sample with duration and gain', () => {
    const machine: MachineConfig = {
      kind: 'sampler',
      voices: 2,
      fadeIn: 0.001,
      fadeOut: 0.01
    };
    const sample = {
      sampleRate: SAMPLE_RATE,
      channels: [new Float32Array(4_800).fill(0.5)]
    };
    const instrument = new SamplerInstrument(
      machine,
      [sample],
      SAMPLE_RATE
    );
    instrument.triggerSample(0, 1, 0.05, -6, 1);
    const samples = renderInstrument(instrument, 0.1);
    expect(peak(samples)).toBeGreaterThan(0.1);
    expect(peak(samples.subarray(4_000))).toBe(0);
  });
});
