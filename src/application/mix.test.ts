import { describe, expect, it } from 'vitest';
import { createInitialState } from '../application/initial-state';
import { MixService } from '../application/mix';
import { Store } from '../application/store';
import { kitEffectiveMute } from '../domain/kit';
import { FakeAudioEngine, FakeGenerative } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const engine = new FakeAudioEngine();
  const mix = new MixService(store, engine);
  return { store, engine, mix };
}

describe('MixService', () => {
  it('updates channel volume and sends it to the engine', () => {
    const { store, engine, mix } = setup();

    mix.setChannelVolume('kick', -9);

    expect(store.getState().kit.tracks.kick?.gainDb).toBe(-9);
    expect(engine.volumes.at(-1)).toEqual({ channel: 'kick', db: -9 });
  });

  it('isolates a soloed channel and mutes the rest', () => {
    const { store, engine, mix } = setup();

    mix.toggleSolo('pad');

    const state = store.getState();
    expect(state.kit.tracks.pad?.solo).toBe(true);
    expect(kitEffectiveMute(state.kit, 'pad')).toBe(false);
    expect(kitEffectiveMute(state.kit, 'kick')).toBe(true);

    const lastMutes = engine.mutes.slice(-16);
    expect(lastMutes.find(entry => entry.channel === 'pad')?.muted).toBe(false);
    expect(lastMutes.find(entry => entry.channel === 'kick')?.muted).toBe(true);
  });

  it('mutes a track across the kit and every scene', () => {
    const { store, engine, mix } = setup();

    mix.setTrackMuted('hihat', true);

    const state = store.getState();
    expect(state.kit.tracks.hihat?.muted).toBe(true);
    expect(state.scenes.deriva.kit.tracks.hihat?.muted).toBe(true);
    expect(state.scenes.caos.kit.tracks.hihat?.muted).toBe(true);
    expect(
      engine.mutes.slice(-16).find(entry => entry.channel === 'hihat')?.muted
    ).toBe(true);
  });

  it('keeps the user mute independent from solo isolation', () => {
    const { store, mix } = setup();

    mix.toggleMute('bass');
    mix.toggleSolo('pad');

    expect(store.getState().kit.tracks.bass?.muted).toBe(true);
    expect(kitEffectiveMute(store.getState().kit, 'bass')).toBe(true);
  });

  it('syncs the full mix to the engine', () => {
    const { engine, mix, store } = setup();

    mix.syncAll();

    expect(engine.volumes).toHaveLength(16);
    expect(engine.mutes).toHaveLength(16);
    expect(engine.syncedTracks.at(-1)).toHaveLength(16);
    expect(engine.syncedBusCollections.at(-1)).toHaveLength(2);
    expect(engine.returns.map(entry => entry.busId)).toEqual([
      'reverb-bus',
      'delay-bus'
    ]);
    expect(engine.master.at(-1)).toBe(store.getState().masterVolume);
  });

  it('reads the master level from the engine', () => {
    const { engine, mix } = setup();
    engine.masterLevel = -9;

    expect(mix.getMasterLevel()).toBe(-9);
  });

  it('reads per-track and per-bus levels', () => {
    const { engine, mix } = setup();
    engine.trackLevels.kick = -12;
    engine.busLevels['reverb-bus'] = -18;

    expect(mix.getTrackLevel('kick')).toBe(-12);
    expect(mix.getBusLevel('reverb-bus')).toBe(-18);
    expect(mix.getTrackLevel('nope')).toBe(-Infinity);
  });

  it('ducks and restores the master around transitions', () => {
    const { engine, mix } = setup();

    mix.beginTransition();
    mix.endTransition();

    expect(engine.transitions).toBe(2);
  });

  it('reorders inserts by target index', () => {
    const { store, mix } = setup();
    mix.addInsert('kick', 'filter');
    mix.addInsert('kick', 'filter');
    mix.addInsert('kick', 'filter');

    mix.reorderInsert('kick', 'filter', 2);
    let inserts = store.getState().kit.tracks.kick!.inserts;
    expect(inserts.map(insert => insert.id)).toEqual([
      'filter-2',
      'filter-3',
      'filter'
    ]);

    mix.reorderInsert('kick', 'filter', 0);
    inserts = store.getState().kit.tracks.kick!.inserts;
    expect(inserts.map(insert => insert.id)).toEqual([
      'filter',
      'filter-2',
      'filter-3'
    ]);
  });

  it('adds, edits, bypasses, moves and removes inserts', () => {
    const { store, mix, engine } = setup();

    mix.addInsert('kick', 'filter');
    mix.addInsert('kick', 'filter');

    let inserts = store.getState().kit.tracks.kick!.inserts;
    expect(inserts).toHaveLength(2);
    expect(inserts.map(insert => insert.id)).toEqual(['filter', 'filter-2']);
    expect(inserts[0]?.params.cutoff).toBe(1200);
    expect(engine.inserts.at(-1)?.channel).toBe('kick');

    const first = inserts[0];
    if (!first) throw new Error('Falta el insert');
    mix.setInsertParam('kick', first.id, 'cutoff', 500);
    inserts = store.getState().kit.tracks.kick!.inserts;
    expect(inserts[0]?.params.cutoff).toBe(500);

    mix.setInsertBypass('kick', first.id, true);
    inserts = store.getState().kit.tracks.kick!.inserts;
    expect(inserts[0]?.bypass).toBe(true);

    mix.moveInsert('kick', 'filter-2', -1);
    inserts = store.getState().kit.tracks.kick!.inserts;
    expect(inserts.map(insert => insert.id)).toEqual(['filter-2', 'filter']);

    mix.removeInsert('kick', 'filter-2');
    inserts = store.getState().kit.tracks.kick!.inserts;
    expect(inserts).toHaveLength(1);
  });
});
