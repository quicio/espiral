import { describe, expect, it } from 'vitest';
import {
  clampPluginParam,
  defaultPluginState,
  denormalizePluginParam,
  normalizePluginParam,
  type PluginDefinition
} from './plugin';

const definition: PluginDefinition = {
  id: 'test',
  name: 'Test',
  version: 1,
  kind: 'effect',
  params: [
    { id: 'gain', label: 'Gain', min: -60, max: 6, defaultValue: 0, unit: 'db' },
    {
      id: 'cutoff',
      label: 'Cutoff',
      min: 20,
      max: 20000,
      defaultValue: 1200,
      unit: 'hz',
      curve: 'log'
    },
    { id: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 0.5, unit: '%' }
  ]
};

describe('plugin parameters', () => {
  it('builds default state and clamps values', () => {
    expect(defaultPluginState(definition)).toEqual({ gain: 0, cutoff: 1200, mix: 0.5 });
    expect(clampPluginParam(definition.params[0]!, 99)).toBe(6);
    expect(clampPluginParam(definition.params[2]!, -1)).toBe(0);
  });

  it('round-trips normalized values for linear and log curves', () => {
    const linear = definition.params[0]!;
    const log = definition.params[1]!;

    expect(normalizePluginParam(linear, 0)).toBeCloseTo(60 / 66);
    expect(denormalizePluginParam(linear, normalizePluginParam(linear, -12))).toBeCloseTo(-12);
    expect(denormalizePluginParam(log, normalizePluginParam(log, 1200))).toBeCloseTo(1200);
    expect(denormalizePluginParam(log, 0)).toBeCloseTo(20);
    expect(denormalizePluginParam(log, 1)).toBeCloseTo(20000);
  });

  it('clamps normalized values', () => {
    expect(normalizePluginParam(definition.params[0]!, 99)).toBe(1);
    expect(normalizePluginParam(definition.params[0]!, -99)).toBe(0);
    expect(denormalizePluginParam(definition.params[0]!, 2)).toBe(6);
  });
});
