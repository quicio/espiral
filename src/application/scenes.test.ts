import { describe, expect, it } from 'vitest';
import { createInitialState } from '../application/initial-state';
import { MixService } from '../application/mix';
import { PatternService } from '../application/patterns';
import { PlaybackRuntime } from '../application/runtime';
import { SceneService } from '../application/scenes';
import { Store } from '../application/store';
import { clipId } from '../domain/clip';
import { FakeAudioEngine, FakeGenerative, FakeStatus } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const runtime = new PlaybackRuntime();
  const status = new FakeStatus();
  const engine = new FakeAudioEngine();
  const mix = new MixService(store, engine);
  const patterns = new PatternService(store, generative, status, runtime);
  const scenes = new SceneService(store, mix, runtime, status);
  return { store, runtime, mix, patterns, scenes };
}

describe('SceneService', () => {
  it('captures the current scene and restores it later', () => {
    const { store, runtime, mix, patterns, scenes } = setup();
    patterns.toggleStep('kick', 0);
    mix.setChannelVolume('kick', -12);
    runtime.lastPadChord = 3;

    scenes.apply('deriva');

    expect(store.getState().scene).toBe('deriva');
    expect(store.getState().harmony.root).toBe(2);
    expect(runtime.lastPadChord).toBe(0);

    scenes.apply('umbral');

    expect(store.getState().scene).toBe('umbral');
    expect(store.getState().pattern.steps.kick?.[0]).toBe(0);
    expect(store.getState().kit.tracks.kick?.gainDb).toBe(-12);
  });

  it('captures the current scene snapshot explicitly', () => {
    const { store, mix, scenes } = setup();
    mix.setChannelVolume('bass', -14);

    scenes.captureCurrent();

    expect(store.getState().scenes.umbral.kit.tracks.bass?.gainDb).toBe(-14);
  });

  it('sets active clips to the applied scene row', () => {
    const { store, scenes } = setup();

    scenes.apply('deriva');

    const state = store.getState();
    expect(state.activeClips.kick).toBe(clipId('deriva', 'kick'));
    expect(state.activeClips['track-08']).toBe(clipId('deriva', 'track-08'));
    expect(state.pattern.steps.kick).toEqual(
      state.scenes.deriva.pattern.steps.kick
    );
  });

  it('adds a scene duplicating the current row and its clips', () => {
    const { store, scenes } = setup();
    const before = Object.keys(store.getState().scenes);

    const id = scenes.addScene();

    expect(id).toBe('escena-5');
    const state = store.getState();
    expect(Object.keys(state.scenes)).toEqual([...before, 'escena-5']);
    expect(state.scenes['escena-5']?.name).toBe('Escena 5');
    expect(state.scene).toBe('umbral');
    expect(state.clips[clipId('escena-5', 'kick')]?.pattern.steps).toEqual(
      state.clips[clipId('umbral', 'kick')]?.pattern.steps
    );
  });

  it('reorders scenes without touching the current one', () => {
    const { store, scenes } = setup();

    scenes.moveScene('caos', -1);

    expect(Object.keys(store.getState().scenes)).toEqual([
      'umbral',
      'deriva',
      'caos',
      'pulso'
    ]);
    expect(store.getState().scene).toBe('umbral');
  });

  it('removes a non-active scene, its clips and its arrangement blocks', () => {
    const { store, scenes } = setup();

    scenes.removeScene('deriva');

    const state = store.getState();
    expect(Object.keys(state.scenes)).toEqual(['umbral', 'pulso', 'caos']);
    expect(state.clips[clipId('deriva', 'kick')]).toBeUndefined();
    expect(
      state.arrangement.blocks.some(block => block.sceneId === 'deriva')
    ).toBe(false);
  });

  it('refuses to remove the active scene or the last scene', () => {
    const { store, scenes } = setup();

    scenes.removeScene('umbral');
    expect(Object.keys(store.getState().scenes)).toHaveLength(4);

    scenes.removeScene('deriva');
    scenes.removeScene('pulso');
    scenes.removeScene('caos');
    expect(Object.keys(store.getState().scenes)).toEqual(['umbral']);
    scenes.removeScene('umbral');
    expect(Object.keys(store.getState().scenes)).toHaveLength(1);
  });
});
