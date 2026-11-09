import { describe, expect, it } from 'vitest';
import { createInitialState } from '../application/initial-state';
import { MixService } from '../application/mix';
import { PatternService } from '../application/patterns';
import { PlaybackRuntime } from '../application/runtime';
import { SceneService } from '../application/scenes';
import { Store } from '../application/store';
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
});
