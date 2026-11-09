import { describe, expect, it } from 'vitest';
import type { PluginDefinition } from '../../../domain/plugin';
import { InstrumentPluginHost } from './instrument-host';
import type { InstrumentPluginFactory } from './types';

const definition: PluginDefinition = {
  id: 'test-instrument',
  name: 'Test Instrument',
  version: 1,
  kind: 'instrument',
  params: [
    { id: 'gain', label: 'Gain', min: 0, max: 10, defaultValue: 5, unit: 'none' }
  ]
};

function factory(): InstrumentPluginFactory {
  return {
    definition,
    create(state) {
      const values: Record<string, number> = { ...state };
      return {
        output: {} as never,
        trigger() {},
        release() {},
        setParam(id, value) {
          values[id] = value;
        },
        getParam(id) {
          return values[id] ?? 0;
        },
        dispose() {}
      };
    }
  };
}

describe('InstrumentPluginHost', () => {
  it('registers and lists instrument definitions', () => {
    const host = new InstrumentPluginHost().register(factory());

    expect(host.list()).toHaveLength(1);
    expect(host.getDefinition('test-instrument')?.name).toBe('Test Instrument');
    expect(() => host.register(factory())).toThrow('Instrumento duplicado');
  });

  it('creates an instrument with default and clamped params', () => {
    const host = new InstrumentPluginHost().register(factory());

    const instance = host.create('test-instrument', { gain: 99 });

    expect(instance.getParam('gain')).toBe(10);
  });

  it('rejects unknown instruments', () => {
    const host = new InstrumentPluginHost();
    expect(() => host.create('nope')).toThrow('Instrumento desconocido');
  });
});
