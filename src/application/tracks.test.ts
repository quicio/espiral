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

  it('adds a user track with a selected synth machine', () => {
    const { store, engine, tracks } = setup();

    tracks.addTrack('analog-pad');

    const track = store.getState().kit.tracks['track-17'];
    expect(track?.machineId).toBe('analog-pad');
    expect(track?.machine.kind).toBe('poly');
    expect(track?.noteSource.kind).toBe('chord');
    expect(engine.added.at(-1)?.machine.kind).toBe('poly');
  });

  it('changes the machine of a user track', () => {
    const { store, engine, tracks } = setup();

    tracks.setMachine('track-08', 'bass-synth');

    const track = store.getState().kit.tracks['track-08'];
    expect(track?.machineId).toBe('bass-synth');
    expect(track?.machine.kind).toBe('mono');
    expect(track?.noteSource).toEqual({
      kind: 'chord',
      degreeOffset: 0,
      octave: 2,
      size: 1
    });
    expect(engine.machines.at(-1)?.trackId).toBe('track-08');
    expect(engine.machines.at(-1)?.machine.kind).toBe('mono');
  });

  it('changes a machine parameter and rebuilds the source', () => {
    const { store, engine, tracks } = setup();
    tracks.addTrack('analog-pad');

    tracks.setMachineParam('track-17', 'attack', 2.5);

    const machine = store.getState().kit.tracks['track-17']?.machine;
    expect(machine?.envelope?.attack).toBe(2.5);
    expect(engine.machines.at(-1)?.trackId).toBe('track-17');
    expect(engine.machines.at(-1)?.machine.envelope?.attack).toBe(2.5);
  });

  it('changes synth filter parameters', () => {
    const { store, tracks } = setup();
    tracks.setMachine('track-08', 'bass-synth');

    tracks.setMachineParam('track-08', 'filter', 1800);

    expect(store.getState().kit.tracks['track-08']?.machine.filter?.frequency).toBe(
      1800
    );
  });

  it('refuses to change the machine of a core track', () => {
    const { store, tracks } = setup();

    tracks.setMachine('kick', 'pluck');

    expect(store.getState().kit.tracks.kick?.machine.kind).toBe('membrane');
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
