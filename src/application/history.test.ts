import { describe, expect, it } from 'vitest';
import { createInitialState } from './initial-state';
import { HistoryService } from './history';
import { Store } from './store';
import { FakeGenerative } from '../test/fakes';

function setup() {
  let clock = 0;
  const store = new Store(createInitialState(new FakeGenerative()));
  const history = new HistoryService(store, 0, () => clock++);
  return { store, history };
}

describe('HistoryService', () => {
  it('undoes and redoes musical changes', () => {
    const { store, history } = setup();
    const original = store.getState().masterVolume;

    store.update(state => ({ ...state, masterVolume: original - 6 }));
    expect(history.canUndo).toBe(true);

    history.undo();
    expect(store.getState().masterVolume).toBe(original);

    history.redo();
    expect(store.getState().masterVolume).toBe(original - 6);
  });

  it('ignores transport playback changes', () => {
    const { store, history } = setup();

    store.update(state => ({
      ...state,
      transport: { ...state.transport, playing: true, currentStep: 3 }
    }));

    expect(history.canUndo).toBe(false);
  });

  it('records tempo changes', () => {
    const { store, history } = setup();
    const bpm = store.getState().transport.bpm;

    store.update(state => ({
      ...state,
      transport: { ...state.transport, bpm: bpm + 10 }
    }));
    history.undo();

    expect(store.getState().transport.bpm).toBe(bpm);
  });

  it('keeps undo and redo bounded', () => {
    const { store, history } = setup();

    for (let index = 0; index < 60; index += 1) {
      store.update(state => ({ ...state, masterVolume: -index - 1 }));
    }

    for (let index = 0; index < 60; index += 1) history.undo();

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
  });
});
