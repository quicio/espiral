import { describe, expect, it } from 'vitest';
import { BitcrusherEffect } from './bitcrusher-effect';
import { CompressorEffect } from './compressor-effect';
import { DelayEffect } from './delay-effect';
import { Eq3Effect } from './eq3-effect';
import { DriveEffect } from './drive-effect';
import type { StereoFrame } from './effect';
import { InsertChain } from './insert-chain';
import { ReverbEffect } from './reverb-effect';
import { TremoloEffect } from './tremolo-effect';

const SAMPLE_RATE = 48_000;

function frame(left = 0, right = 0): StereoFrame {
  return { left, right };
}

describe('DelayEffect', () => {
  it('delays the input by its time', () => {
    const effect = new DelayEffect(SAMPLE_RATE, {
      wet: 1,
      feedback: 0,
      time: 0.01
    });
    const input = frame(1, 1);
    effect.process(input);

    let peakBefore = 0;
    let peakAtDelay = 0;
    for (let index = 0; index < 700; index += 1) {
      const output = frame();
      effect.process(output);
      if (index < 450) peakBefore = Math.max(peakBefore, Math.abs(output.left));
      if (index >= 450 && index < 550) {
        peakAtDelay = Math.max(peakAtDelay, Math.abs(output.left));
      }
    }
    expect(peakBefore).toBe(0);
    expect(peakAtDelay).toBeGreaterThan(0.5);
  });
});

describe('ReverbEffect', () => {
  it('produces a finite tail', () => {
    const effect = new ReverbEffect(SAMPLE_RATE, { wet: 1, decay: 2 });
    effect.process(frame(1, 1));
    let tail = 0;
    for (let index = 0; index < 12_000; index += 1) {
      const output = frame();
      effect.process(output);
      expect(Number.isFinite(output.left)).toBe(true);
      if (index > 2_000) tail = Math.max(tail, Math.abs(output.left));
    }
    expect(tail).toBeGreaterThan(0.0001);
  });
});

describe('CompressorEffect', () => {
  it('reduces a loud signal', () => {
    const effect = new CompressorEffect(SAMPLE_RATE, {
      threshold: -18,
      ratio: 4,
      attack: 0.001,
      release: 0.2
    });
    let first = 0;
    let last = 0;
    for (let index = 0; index < 4_800; index += 1) {
      const output = frame(1, 1);
      effect.process(output);
      if (index < 100) first = Math.max(first, Math.abs(output.left));
      if (index > 4_700) last = Math.max(last, Math.abs(output.left));
    }
    expect(last).toBeLessThan(first * 0.5);
  });
});

describe('DriveEffect', () => {
  it('saturates without leaving the safe range', () => {
    const effect = new DriveEffect(SAMPLE_RATE, { drive: 1, mix: 1 });
    const output = frame(0.5, 0.5);
    effect.process(output);
    expect(output.left).toBeGreaterThan(0);
    expect(output.left).toBeLessThan(1);
    expect(Number.isFinite(output.left)).toBe(true);
  });
});

describe('Eq3Effect, TremoloEffect and BitcrusherEffect', () => {
  it('processes without NaN', () => {
    const eq = new Eq3Effect(SAMPLE_RATE, {
      low: 6,
      mid: -3,
      high: 4,
      lowFrequency: 250,
      highFrequency: 3000
    });
    const tremolo = new TremoloEffect(SAMPLE_RATE, {
      rate: 4,
      depth: 0.5,
      wet: 1
    });
    const crusher = new BitcrusherEffect({ bits: 4, wet: 0.5 });
    let min = 1;
    let max = -1;
    for (let index = 0; index < 2_000; index += 1) {
      const output = frame(0.5, 0.5);
      eq.process(output);
      tremolo.process(output);
      crusher.process(output);
      expect(Number.isFinite(output.left)).toBe(true);
      min = Math.min(min, output.left);
      max = Math.max(max, output.left);
    }
    expect(max).toBeGreaterThan(min);
  });

  it('updates parameters in place', () => {
    const delay = new DelayEffect(SAMPLE_RATE, {
      wet: 0,
      feedback: 0,
      time: 0.01
    });
    delay.setParam('wet', 1);
    delay.setParam('time', 0.02);
    const output = frame(1, 1);
    delay.process(output);
    expect(output.left).toBe(0);
  });
});

describe('InsertChain', () => {
  it('skips bypassed and unknown inserts', () => {
    const chain = new InsertChain(
      [
        {
          id: 'drive',
          pluginId: 'drive',
          bypass: true,
          params: { drive: 1, mix: 1 }
        },
        {
          id: 'unknown',
          pluginId: 'unknown',
          bypass: false,
          params: {}
        }
      ],
      SAMPLE_RATE
    );
    const output = frame(0.25, 0.25);
    chain.process(output);
    expect(output.left).toBe(0.25);
    expect(output.right).toBe(0.25);
  });
});
