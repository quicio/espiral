import { describe, expect, it } from 'vitest';
import { createInitialState } from './initial-state';
import { LocksService } from './locks';
import { MixService } from './mix';
import { Store } from './store';
import { FakeAudioEngine, FakeGenerative } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const engine = new FakeAudioEngine();
  const mix = new MixService(store, engine);
  const locks = new LocksService(store, engine);
  mix.addInsert('kick', 'filter');
  return { store, engine, locks };
}

describe('LocksService', () => {
  it('sets and replaces a lock on a step', () => {
    const { store, locks } = setup();

    locks.setLock('kick', 0, 'filter', 'cutoff', 500);
    locks.setLock('kick', 0, 'filter', 'cutoff', 900);

    expect(store.getState().pattern.locks.kick?.[0]).toEqual([
      { insertId: 'filter', paramId: 'cutoff', value: 900 }
    ]);
  });

  it('clamps the lock to the plugin parameter range', () => {
    const { store, locks } = setup();

    locks.setLock('kick', 3, 'filter', 'cutoff', 99999);

    expect(store.getState().pattern.locks.kick?.[3]?.[0]?.value).toBe(20000);
  });

  it('removes a lock without touching other locks on the step', () => {
    const { store, locks } = setup();

    locks.setLock('kick', 0, 'filter', 'cutoff', 500);
    locks.setLock('kick', 0, 'filter', 'q', 4);
    locks.removeLock('kick', 0, 'filter', 'cutoff');

    expect(store.getState().pattern.locks.kick?.[0]).toEqual([
      { insertId: 'filter', paramId: 'q', value: 4 }
    ]);
  });

  it('ignores unknown inserts and parameters', () => {
    const { store, locks } = setup();

    locks.setLock('kick', 0, 'nope', 'cutoff', 500);
    locks.setLock('kick', 0, 'filter', 'nope', 500);

    expect(store.getState().pattern.locks.kick?.[0]).toEqual([]);
  });
});
