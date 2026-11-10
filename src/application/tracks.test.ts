import { describe, expect, it } from 'vitest';
import { createInitialState } from './initial-state';
import { Store } from './store';
import { TrackService } from './tracks';
import { clipId } from '../domain/clip';
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
    expect(state.clips[clipId('umbral', 'track-17')]).toBeDefined();
    expect(state.activeClips['track-17']).toBe(clipId('umbral', 'track-17'));
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

  it('adds a user track from an instrument plugin', () => {
    const { store, engine, tracks } = setup();

    tracks.addTrack('plugin-fm-synth');

    const track = store.getState().kit.tracks['track-17'];
    expect(track?.machineId).toBe('plugin-fm-synth');
    expect(track?.machine.kind).toBe('plugin');
    expect(track?.machine.pluginId).toBe('fm-synth');
    expect(track?.machine.params).toEqual({ harmonicity: 2 });
    expect(track?.noteSource.kind).toBe('scale-degree');
    expect(engine.added.at(-1)?.machine.kind).toBe('plugin');
  });

  it('edits plugin instrument parameters', () => {
    const { store, engine, tracks } = setup();
    tracks.addTrack('plugin-fm-synth');

    tracks.setMachineParam('track-17', 'harmonicity', 4.5);

    const machine = store.getState().kit.tracks['track-17']?.machine;
    expect(machine?.params?.harmonicity).toBe(4.5);
    expect(engine.machines.at(-1)?.machine.params?.harmonicity).toBe(4.5);
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

  it('applies a sound bank preset to a user track', () => {
    const { store, engine, status, tracks } = setup();

    tracks.applySoundPreset('acid-bass', 'track-08');

    const track = store.getState().kit.tracks['track-08'];
    expect(track?.machineId).toBe('bass-synth');
    expect(track?.machine.kind).toBe('mono');
    expect(track?.machine.oscillator).toBe('sawtooth');
    expect(track?.machine.filter?.frequency).toBe(680);
    expect(track?.noteSource).toEqual({
      kind: 'chord',
      degreeOffset: 0,
      octave: 2,
      size: 1
    });
    expect(engine.machines.at(-1)?.trackId).toBe('track-08');
    expect(engine.machines.at(-1)?.machine.oscillator).toBe('sawtooth');
    expect(status.messages.at(-1)).toContain('Acid Bass');
  });

  it('keeps the bank away from core tracks', () => {
    const { store, status, tracks } = setup();

    tracks.applySoundPreset('warm-pad', 'kick');

    expect(store.getState().kit.tracks.kick?.machine.kind).toBe('membrane');
    expect(status.messages.at(-1)).toContain('editables');
  });

  it('rejects unknown sound bank presets', () => {
    const { status, tracks } = setup();

    tracks.applySoundPreset('missing', 'track-08');

    expect(status.messages.at(-1)).toContain('Sonido desconocido');
  });

  it('changes the machine of generative tracks', () => {
    const { store, engine, tracks } = setup();

    tracks.setMachine('pad', 'pluck');

    const pad = store.getState().kit.tracks.pad;
    expect(pad?.machineId).toBe('pluck');
    expect(pad?.machine.kind).toBe('pluck');
    expect(pad?.noteSource.kind).toBe('scale-degree');
    expect(engine.machines.at(-1)?.trackId).toBe('pad');
  });

  it('adds and removes a pattern on generative tracks', () => {
    const { store, status, tracks } = setup();

    expect(store.getState().kit.tracks.pad?.hasPattern).toBe(false);

    tracks.togglePattern('pad');

    const withPattern = store.getState();
    expect(withPattern.kit.tracks.pad?.hasPattern).toBe(true);
    expect(withPattern.pattern.steps.pad).toHaveLength(16);
    expect(withPattern.pattern.pulses.pad).toBeGreaterThan(0);
    expect(withPattern.scenes.deriva.kit.tracks.pad?.hasPattern).toBe(true);
    expect(withPattern.scenes.deriva.pattern.steps.pad).toEqual(
      withPattern.pattern.steps.pad
    );
    expect(withPattern.clips[clipId('umbral', 'pad')]).toBeDefined();
    expect(withPattern.activeClips.pad).toBe(clipId('umbral', 'pad'));
    expect(withPattern.selected).toBe('pad');
    expect(status.messages.at(-1)).toContain('patrón');

    tracks.togglePattern('pad');

    const withoutPattern = store.getState();
    expect(withoutPattern.kit.tracks.pad?.hasPattern).toBe(false);
    expect(withoutPattern.pattern.steps.pad).toBeUndefined();
    expect(withoutPattern.scenes.caos.pattern.steps.pad).toBeUndefined();
    expect(withoutPattern.clips[clipId('umbral', 'pad')]).toBeUndefined();
    expect(withoutPattern.activeClips.pad).toBeUndefined();
    expect(withoutPattern.selected).toBe('pad');
  });

  it('does not toggle patterns on drum tracks', () => {
    const { store, status, tracks } = setup();

    tracks.togglePattern('kick');

    expect(store.getState().kit.tracks.kick?.hasPattern).toBe(true);
    expect(status.messages.at(-1)).toContain('drone, pad y lead');
  });

  it('applies a sound bank preset to a generative track', () => {
    const { store, engine, tracks } = setup();

    tracks.applySoundPreset('fm-bell', 'lead');

    const lead = store.getState().kit.tracks.lead;
    expect(lead?.machineId).toBe('plugin-fm-synth');
    expect(lead?.machine.kind).toBe('plugin');
    expect(lead?.machine.params?.harmonicity).toBe(3.5);
    expect(engine.machines.at(-1)?.trackId).toBe('lead');
  });

  it('applies a drum kit sound to a core track across scenes', () => {
    const { store, engine, tracks } = setup();

    tracks.applyKitSound('kick', 'kick-deep');

    const state = store.getState();
    expect(state.kit.tracks.kick?.machine.envelope?.decay).toBe(0.5);
    expect(state.scenes.caos.kit.tracks.kick?.machine.envelope?.decay).toBe(0.5);
    expect(engine.machines.at(-1)?.trackId).toBe('kick');
    expect(engine.machines.at(-1)?.machine.envelope?.decay).toBe(0.5);
  });

  it('applies an editable kit sound across scenes', () => {
    const { store, engine, tracks } = setup();

    tracks.applyKitSound('track-08', 'glass-pad');

    const state = store.getState();
    expect(state.kit.tracks['track-08']?.machineId).toBe('soft-pad');
    expect(state.kit.tracks['track-08']?.machine.kind).toBe('poly');
    expect(state.scenes.deriva.kit.tracks['track-08']?.machineId).toBe('soft-pad');
    expect(engine.machines.at(-1)?.trackId).toBe('track-08');
  });

  it('rejects a sound from another core track', () => {
    const { store, tracks } = setup();

    tracks.applyKitSound('hihat', 'kick-deep');

    expect(store.getState().kit.tracks.hihat?.machine.samples).toHaveLength(8);
  });

  it('refuses to change the machine of a core track', () => {
    const { store, tracks } = setup();

    tracks.setMachine('kick', 'pluck');

    expect(store.getState().kit.tracks.kick?.machine.kind).toBe('membrane');
  });

  it('updates and clamps track macros', () => {
    const { store, tracks } = setup();

    tracks.setTrackMacro('track-08', 0, 0.75);
    tracks.setTrackMacro('track-08', 1, 2);

    expect(store.getState().kit.tracks['track-08']?.macros).toEqual([0.75, 1]);
  });

  it('removes track-macro modulation routes when deleting the track', () => {
    const { store, tracks } = setup();
    store.update(state => ({
      ...state,
      modulation: {
        ...state.modulation,
        routes: [
          {
            id: 'route-1',
            sourceId: 'track-macro:track-09:0',
            target: { trackId: 'track-09', insertId: 'delay', paramId: 'wet' },
            amount: 0.5,
            bipolar: false
          }
        ]
      }
    }));

    tracks.removeTrack('track-09');

    expect(store.getState().modulation.routes).toEqual([]);
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
    expect(state.clips[clipId('umbral', 'track-09')]).toBeUndefined();
    expect(state.activeClips['track-09']).toBeUndefined();
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
