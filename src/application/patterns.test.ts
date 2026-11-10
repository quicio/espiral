import { describe, expect, it } from 'vitest';
import { createInitialState } from '../application/initial-state';
import { PatternService } from '../application/patterns';
import { PlaybackRuntime } from '../application/runtime';
import { Store } from '../application/store';
import { FakeGenerative, FakeStatus } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const runtime = new PlaybackRuntime();
  const status = new FakeStatus();
  const patterns = new PatternService(store, generative, status, runtime);
  return { generative, store, runtime, status, patterns };
}

describe('PatternService', () => {
  it('toggles a step and can undo it', () => {
    const { store, patterns } = setup();
    expect(store.getState().pattern.steps.kick![0]).toBe(1);

    patterns.toggleStep('kick', 0);

    expect(store.getState().pattern.steps.kick![0]).toBe(0);
    expect(store.getState().history).toHaveLength(1);

    patterns.undo();

    expect(store.getState().pattern.steps.kick![0]).toBe(1);
    expect(store.getState().history).toHaveLength(0);
  });

  it('mutates the selected pattern and increments the mutation counter', () => {
    const { store, patterns } = setup();

    patterns.mutateSelected();

    expect(store.getState().mutationCount).toBe(1);
    expect(store.getState().pattern.steps.kick![0]).toBe(0);
    expect(store.getState().history).toHaveLength(1);
  });

  it('does not mutate a frozen channel', () => {
    const { store, patterns, status } = setup();
    patterns.toggleFreeze('kick');

    patterns.mutateSelected();

    expect(store.getState().pattern.steps.kick![0]).toBe(1);
    expect(status.messages.at(-1)).toContain('congelado');
  });

  it('copies and pastes a pattern', () => {
    const { store, patterns } = setup();
    const kick = store.getState().pattern.steps.kick!;

    patterns.copySelected();
    patterns.selectChannel('bass');
    patterns.pasteSelected();

    expect(store.getState().pattern.steps.bass).toEqual(kick);
  });

  it('resets harmony when the root changes', () => {
    const { patterns, runtime } = setup();
    runtime.lastPadChord = 5;

    patterns.setRoot(7);

    expect(runtime.lastPadChord).toBe(0);
  });

  it('generates only non-frozen patterns', () => {
    const { store, patterns } = setup();
    patterns.toggleFreeze('kick');
    const frozenKick = store.getState().pattern.steps.kick!;

    patterns.generateAll(1234);

    expect(store.getState().pattern.steps.kick).toEqual(frozenKick);
    expect(store.getState().seed).toBe(1234);
  });

  it('selects a generative track but refuses to edit a missing pattern', () => {
    const { store, patterns, status } = setup();

    patterns.selectChannel('pad');

    expect(store.getState().selected).toBe('pad');

    patterns.mutateSelected();

    expect(store.getState().pattern.steps.pad).toBeUndefined();
    expect(status.messages.at(-1)).toContain('generativo');
  });

  it('updates velocity, probability and ratchets for a step', () => {
    const { store, patterns } = setup();

    patterns.setStepVelocity('kick', 2, 0.4);
    patterns.setStepProbability('kick', 2, 0.25);
    patterns.setStepRatchets('kick', 2, 3);

    const state = store.getState();
    expect(state.pattern.velocity.kick?.[2]).toBe(0.4);
    expect(state.pattern.probability.kick?.[2]).toBe(0.25);
    expect(state.pattern.ratchets.kick?.[2]).toBe(3);
  });
});
