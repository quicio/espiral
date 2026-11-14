import { describe, expect, it } from 'vitest';
import { KickVoice } from './kick-voice';

const SAMPLE_RATE = 48_000;

function renderVoice(velocity = 1, seed = 1234, seconds = 0.2): Float32Array {
  const voice = new KickVoice(SAMPLE_RATE);
  voice.trigger(velocity, seed);
  const frames = Math.round(seconds * SAMPLE_RATE);
  const output = new Float32Array(frames);
  for (let index = 0; index < frames; index += 1) {
    output[index] = voice.render();
  }
  return output;
}

function peak(samples: Float32Array): number {
  let value = 0;
  for (const sample of samples) value = Math.max(value, Math.abs(sample));
  return value;
}

function zeroCrossings(samples: Float32Array): number {
  let crossings = 0;
  let previous = 0;
  for (const sample of samples) {
    if (previous !== 0 && sample !== 0 && Math.sign(sample) !== Math.sign(previous)) {
      crossings += 1;
    }
    if (sample !== 0) previous = sample;
  }
  return crossings;
}

describe('KickVoice', () => {
  it('is silent before a trigger', () => {
    const voice = new KickVoice(SAMPLE_RATE);
    for (let index = 0; index < 128; index += 1) {
      expect(voice.render()).toBe(0);
    }
    expect(voice.isActive).toBe(false);
  });

  it('scales its output with velocity', () => {
    const loud = peak(renderVoice(1));
    const soft = peak(renderVoice(0.5));
    expect(loud).toBeGreaterThan(soft * 1.8);
  });

  it('drops its pitch after the attack', () => {
    const samples = renderVoice(1, 1234, 0.15);
    const early = zeroCrossings(
      samples.subarray(0, Math.round(0.03 * SAMPLE_RATE))
    );
    const late = zeroCrossings(
      samples.subarray(
        Math.round(0.1 * SAMPLE_RATE),
        Math.round(0.13 * SAMPLE_RATE)
      )
    );
    expect(early).toBeGreaterThan(late);
  });

  it('is deterministic for the same seed', () => {
    expect(renderVoice(1, 55, 0.5)).toEqual(renderVoice(1, 55, 0.5));
  });

  it('releases after its one-shot length', () => {
    const voice = new KickVoice(SAMPLE_RATE);
    voice.trigger(1, 1234);
    const frames = Math.round(1.5 * SAMPLE_RATE);
    const output = new Float32Array(frames);
    for (let index = 0; index < frames; index += 1) {
      output[index] = voice.render();
    }
    const tail = output.subarray(Math.round(1.45 * SAMPLE_RATE));
    expect(peak(tail)).toBe(0);
    expect(voice.isActive).toBe(false);
  });

  it('does not produce NaN or Infinity', () => {
    const samples = renderVoice(1, 999, 1.5);
    for (const sample of samples) {
      expect(Number.isFinite(sample)).toBe(true);
    }
  });
});
