import { describe, expect, it } from 'vitest';
import { createInitialState } from './initial-state';
import { MixService } from './mix';
import { ModulationService } from './modulation';
import { Store } from './store';
import { FakeAudioEngine, FakeGenerative } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const engine = new FakeAudioEngine();
  const mix = new MixService(store, engine);
  const modulation = new ModulationService(store, engine, {
    start: () => () => {}
  });
  mix.addInsert('kick', 'filter');
  return { store, engine, mix, modulation };
}

const cutoffTarget = {
  trackId: 'kick',
  insertId: 'filter',
  paramId: 'cutoff'
};

describe('ModulationService', () => {
  it('only runs the control-rate ticker while enabled', () => {
    const { store, engine } = setup();
    let starts = 0;
    let stops = 0;
    const modulation = new ModulationService(store, engine, {
      start: () => {
        starts += 1;
        return () => {
          stops += 1;
        };
      }
    });

    modulation.start();
    expect(starts).toBe(0);

    modulation.setEnabled(true);
    expect(starts).toBe(1);

    modulation.setEnabled(false);
    expect(stops).toBe(1);
  });

  it('applies an LFO to a plugin parameter', () => {
    const { engine, modulation } = setup();
    modulation.addRoute('lfo-1', cutoffTarget, 0.5, false);
    modulation.setEnabled(true);

    modulation.tick(0);

    const value = engine.params.at(-1);
    expect(value?.trackId).toBe('kick');
    expect(value?.paramId).toBe('cutoff');
    expect(value?.value).toBeCloseTo(6195, 0);
  });

  it('uses bipolar macros to move around the base value', () => {
    const { store, engine, modulation } = setup();
    modulation.addRoute('macro-1', cutoffTarget, 0.1, true);
    modulation.setEnabled(true);
    modulation.setMacro('macro-1', 0.5);

    modulation.tick(0);

    expect(engine.params.at(-1)?.value).toBeCloseTo(1200, 0);

    modulation.setMacro('macro-1', 1);
    modulation.tick(0);

    expect(engine.params.at(-1)?.value).toBeCloseTo(3198, 0);
    expect(store.getState().modulation.sources[2]?.value).toBe(1);
  });

  it('routes LFO modulation through the audio-rate engine path when available', () => {
    const { store, engine, modulation } = setup();
    engine.audioModulationSupport = true;
    modulation.addRoute('lfo-1', cutoffTarget, 0.5, true);
    modulation.setEnabled(true);

    modulation.tick(0);

    const audio = engine.audioModulations.at(-1);
    expect(audio?.source.shape).toBe('sine');
    expect(audio?.target).toEqual(cutoffTarget);
    expect(audio?.bipolar).toBe(true);
    expect(engine.params.some(entry => entry.paramId === 'cutoff')).toBe(false);

    const routeId = store.getState().modulation.routes[0]!.id;
    modulation.removeRoute(routeId);
    modulation.tick(1);

    expect(engine.removedAudioModulations).toContain(routeId);
  });

  it('keeps macros on the control-rate path even with audio support', () => {
    const { engine, modulation } = setup();
    engine.audioModulationSupport = true;
    modulation.addRoute('macro-1', cutoffTarget, 0.1, false);
    modulation.setEnabled(true);
    modulation.setMacro('macro-1', 1);

    modulation.tick(0);

    expect(engine.audioModulations).toHaveLength(0);
    expect(engine.params.at(-1)?.paramId).toBe('cutoff');
  });

  it('applies a track macro as a modulation source', () => {
    const { store, engine, modulation } = setup();
    store.update(state => ({
      ...state,
      kit: {
        ...state.kit,
        tracks: {
          ...state.kit.tracks,
          kick: {
            ...state.kit.tracks.kick!,
            macros: [1, 0.5]
          }
        }
      }
    }));
    modulation.addRoute('track-macro:kick:0', cutoffTarget, 0.1, false);
    modulation.setEnabled(true);

    modulation.tick(0);

    expect(engine.params.at(-1)?.value).toBeCloseTo(3198, 0);
  });

  it('restores the base value when modulation is disabled', () => {
    const { engine, modulation } = setup();
    modulation.addRoute('macro-1', cutoffTarget, 0.5, false);
    modulation.setEnabled(true);
    modulation.setMacro('macro-1', 1);
    modulation.tick(0);

    modulation.setEnabled(false);

    expect(engine.params.at(-1)?.value).toBe(1200);
  });

  it('restores the target when a route is removed', () => {
    const { store, engine, modulation } = setup();
    modulation.addRoute('macro-1', cutoffTarget, 0.5, false);
    modulation.setEnabled(true);
    modulation.setMacro('macro-1', 1);
    modulation.tick(0);
    const routeId = store.getState().modulation.routes[0]!.id;

    modulation.removeRoute(routeId);
    modulation.tick(1);

    expect(engine.params.at(-1)?.value).toBe(1200);
  });

  it('ignores duplicate routes and invalid targets', () => {
    const { store, modulation } = setup();

    modulation.addRoute('lfo-1', cutoffTarget, 0.5, false);
    modulation.addRoute('lfo-1', cutoffTarget, 0.7, false);
    modulation.addRoute('nope', cutoffTarget, 0.5, false);

    expect(store.getState().modulation.routes).toHaveLength(1);
  });

  it('clamps the modulated value to the parameter range', () => {
    const { engine, modulation } = setup();
    modulation.addRoute('macro-1', cutoffTarget, 1, false);
    modulation.setEnabled(true);
    modulation.setMacro('macro-1', 1);

    modulation.tick(0);

    expect(engine.params.at(-1)?.value).toBe(20000);
  });
});
