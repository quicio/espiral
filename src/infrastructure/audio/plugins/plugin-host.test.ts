import { describe, expect, it } from 'vitest';
import type { InsertConfig } from '../../../domain/graph';
import type { PluginDefinition } from '../../../domain/plugin';
import { PluginHost } from './plugin-host';
import type { PluginFactory, PluginInstance } from './types';

const definition: PluginDefinition = {
  id: 'test',
  name: 'Test',
  version: 1,
  kind: 'effect',
  params: [
    { id: 'gain', label: 'Gain', min: -60, max: 6, defaultValue: 0, unit: 'db' },
    { id: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 0.5, unit: '%' }
  ]
};

function factory(): PluginFactory {
  return {
    definition,
    create() {
      const values: Record<string, number> = {};
      const instance: PluginInstance = {
        input: {} as never,
        output: {} as never,
        setParam(id, value) {
          values[id] = value;
        },
        getParam(id) {
          return values[id] ?? 0;
        },
        dispose() {}
      };
      return instance;
    }
  };
}

function config(params: Record<string, number>): InsertConfig {
  return { id: 'insert', pluginId: 'test', bypass: false, params };
}

describe('PluginHost', () => {
  it('registers, lists and finds definitions', () => {
    const host = new PluginHost().register(factory());

    expect(host.list()).toHaveLength(1);
    expect(host.getDefinition('test')?.name).toBe('Test');
    expect(() => host.register(factory())).toThrow('Plugin duplicado');
  });

  it('creates an instance with defaults and clamps config values', () => {
    const host = new PluginHost().register(factory());
    const instance = host.create(config({ gain: 99 }));

    expect(instance.getParam('gain')).toBe(6);
    expect(instance.getParam('mix')).toBe(0.5);
  });

  it('rejects unknown plugins', () => {
    const host = new PluginHost();
    expect(() => host.create(config({}))).toThrow('Plugin desconocido');
  });

  it('reports declared latency', () => {
    const host = new PluginHost().register({
      ...factory(),
      definition: { ...definition, latencySamples: 128 }
    });

    expect(host.getLatencySamples('test')).toBe(128);
  });
});
