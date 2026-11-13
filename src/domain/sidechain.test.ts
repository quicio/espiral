import { describe, expect, it } from 'vitest';
import { dbToGain, sidechainPoints } from './sidechain';

describe('sidechainPoints', () => {
  it('returns three points with the exact ducked gain', () => {
    const points = sidechainPoints(2, 4, 0.006, 0.16);

    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ time: 2, gain: 1 });
    expect(points[1]?.gain).toBeCloseTo(dbToGain(-4), 10);
    expect(points[2]?.time).toBeCloseTo(2.166, 10);
    expect(points[2]?.gain).toBe(1);
  });

  it('keeps times monotonic for any positive attack and release', () => {
    const points = sidechainPoints(0.5, 6, 0.01, 0.2);

    expect(points[1]!.time).toBeGreaterThan(points[0]!.time);
    expect(points[2]!.time).toBeGreaterThan(points[1]!.time);
  });

  it('does not duck when depth is zero', () => {
    const points = sidechainPoints(1, 0, 0.006, 0.16);

    points.forEach(point => expect(point.gain).toBe(1));
  });

  it('clamps negative times to the event time', () => {
    const points = sidechainPoints(1, 3, -0.01, -0.01);

    expect(points[1]?.time).toBe(1);
    expect(points[2]?.time).toBe(1);
  });
});

describe('dbToGain', () => {
  it('maps the usual sidechain depths', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(-4)).toBeCloseTo(0.631, 3);
  });
});
