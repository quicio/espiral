import { describe, expect, it } from 'vitest';
import { ArrangementService } from './arrangement';
import { createInitialState } from './initial-state';
import { MixService } from './mix';
import { SceneService } from './scenes';
import { Store } from './store';
import { PlaybackRuntime } from './runtime';
import { FakeAudioEngine, FakeGenerative, FakeStatus } from '../test/fakes';

function setup() {
  const store = new Store(createInitialState(new FakeGenerative()));
  const engine = new FakeAudioEngine();
  const status = new FakeStatus();
  const runtime = new PlaybackRuntime();
  const mix = new MixService(store, engine);
  const scenes = new SceneService(store, mix, runtime, status);
  const arrangement = new ArrangementService(store, scenes, status);
  return { store, status, arrangement };
}

describe('ArrangementService', () => {
  it('toggles and advances to the next scene after the block bars', () => {
    const { store, arrangement } = setup();
    arrangement.setBars('block-umbral', 1);
    arrangement.setBars('block-deriva', 1);
    arrangement.toggle();

    expect(store.getState().arrangement.enabled).toBe(true);

    arrangement.onStep(16);

    const state = store.getState();
    expect(state.arrangement.blockIndex).toBe(1);
    expect(state.arrangement.bar).toBe(0);
    expect(state.scene).toBe('deriva');
  });

  it('adds, moves and removes blocks', () => {
    const { store, arrangement } = setup();

    arrangement.addBlock('caos');
    const added = store.getState().arrangement.blocks.at(-1);
    expect(added?.sceneId).toBe('caos');

    arrangement.moveBlock(added!.id, -1);
    expect(
      store.getState().arrangement.blocks.at(-2)?.id
    ).toBe(added!.id);

    arrangement.removeBlock(added!.id);
    expect(store.getState().arrangement.blocks).toHaveLength(4);
  });

  it('resets to the first block', () => {
    const { store, arrangement } = setup();
    arrangement.setBars('block-umbral', 1);
    arrangement.setBars('block-deriva', 1);
    arrangement.toggle();
    arrangement.onStep(16);
    arrangement.reset();

    expect(store.getState().arrangement.blockIndex).toBe(0);
    expect(store.getState().arrangement.bar).toBe(0);
    expect(store.getState().scene).toBe('umbral');
  });

  it('cycles within the loop range', () => {
    const { store, arrangement } = setup();
    store.update(state => ({
      ...state,
      arrangement: {
        ...state.arrangement,
        blocks: state.arrangement.blocks.map(block => ({
          ...block,
          bars: 1
        })),
        loop: true,
        loopStart: 0,
        loopEnd: 2
      }
    }));
    arrangement.toggle();

    arrangement.onStep(16);
    expect(store.getState().arrangement.blockIndex).toBe(1);

    arrangement.onStep(32);
    expect(store.getState().arrangement.blockIndex).toBe(0);
    expect(store.getState().scene).toBe('umbral');
  });

  it('starts reset and playback from the loop start', () => {
    const { store, arrangement } = setup();
    arrangement.setLoopRange(1, 3);
    arrangement.setLoop(true);

    arrangement.reset();
    expect(store.getState().arrangement.blockIndex).toBe(1);

    arrangement.toggle();
    expect(store.getState().arrangement.blockIndex).toBe(1);
    expect(store.getState().scene).toBe('deriva');
  });

  it('clamps the loop range when blocks are removed', () => {
    const { store, arrangement } = setup();
    arrangement.setLoop(true);
    arrangement.setLoopRange(2, 4);

    arrangement.removeBlock('block-caos');

    const state = store.getState().arrangement;
    expect(state.loopStart).toBe(2);
    expect(state.loopEnd).toBe(3);
  });
});
