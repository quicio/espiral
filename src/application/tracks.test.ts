import { describe, expect, it } from 'vitest';
import { createInitialState } from './initial-state';
import { Store } from './store';
import { TrackService } from './tracks';
import { FakeAudioEngine, FakeGenerative, FakeStatus } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const engine = new FakeAudioEngine();
  const status = new FakeStatus();
  const tracks = new TrackService(store, engine, status);
  return { store, engine, status, tracks };
}

describe('TrackService', () => {
  it('adds a user sampler track with an empty pattern in every scene', () => {
    const { store, engine, tracks } = setup();

    tracks.addTrack();

    const state = store.getState();
    const track = state.kit.tracks['track-17'];
    expect(track?.role).toBe('user');
    expect(track?.machine.kind).toBe('sampler');
    expect(state.selected).toBe('track-17');
    expect(state.pattern.steps['track-17']).toHaveLength(16);
    expect(state.pattern.steps['track-17']?.every(step => step === 0)).toBe(true);
    expect(state.scenes.deriva.kit.tracks['track-17']).toBeDefined();
    expect(state.scenes.caos.pattern.steps['track-17']).toBeDefined();
    expect(engine.added.at(-1)?.id).toBe('track-17');
  });

  it('removes a user track from the kit, patterns and every scene', () => {
    const { store, engine, tracks } = setup();

    tracks.removeTrack('track-09');

    const state = store.getState();
    expect(state.kit.tracks['track-09']).toBeUndefined();
    expect(state.pattern.steps['track-09']).toBeUndefined();
    expect(state.pattern.pulses['track-09']).toBeUndefined();
    expect(state.pattern.frozen['track-09']).toBeUndefined();
    expect(state.scenes.umbral.kit.tracks['track-09']).toBeUndefined();
    expect(state.scenes.umbral.pattern.steps['track-09']).toBeUndefined();
    expect(state.selected).not.toBe('track-09');
    expect(engine.removed.at(-1)).toBe('track-09');
  });

  it('refuses to remove a core track', () => {
    const { store, tracks } = setup();

    tracks.removeTrack('kick');

    expect(store.getState().kit.tracks.kick).toBeDefined();
  });

  it('selects the first remaining pattern track after removing the selected one', () => {
    const { store, tracks } = setup();
    store.update(state => ({ ...state, selected: 'track-12' }));

    tracks.removeSelectedTrack();

    expect(store.getState().selected).toBe('kick');
  });
});
