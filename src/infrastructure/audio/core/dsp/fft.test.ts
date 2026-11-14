import { describe, expect, it } from 'vitest';
import { spectrumBins } from './fft';

describe('spectrumBins', () => {
  it('finds the tone and stays finite', () => {
    const samples = new Float32Array(128);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin((2 * Math.PI * 8 * index) / samples.length);
    }
    const bins = spectrumBins(samples, 32);
    expect(bins).toHaveLength(32);
    expect(Math.max(...bins)).toBeGreaterThan(0.1);
    expect(bins.every(value => Number.isFinite(value))).toBe(true);
  });

  it('returns zero for silence', () => {
    const bins = spectrumBins(new Float32Array(128), 32);
    expect(Math.max(...bins)).toBe(0);
  });
});
