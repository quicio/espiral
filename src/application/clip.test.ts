import { describe, expect, it } from 'vitest';
import { ClipService } from './clip';
import { createInitialState } from './initial-state';
import { PlaybackRuntime } from './runtime';
import { Store } from './store';
import { FakeGenerative, FakeStatus } from '../test/fakes';
import { clipId } from '../domain/clip';

function setup() {
  const store = new Store(createInitialState(new FakeGenerative()));
  const runtime = new PlaybackRuntime();
  const status = new FakeStatus();
  const clips = new ClipService(store, runtime, status);
  return { store, runtime, status, clips };
}

describe('ClipService', () => {
  it('launches a clip immediately while stopped', () => {
    const { store, clips } = setup();

    clips.launchClip(clipId('deriva', 'kick'));

    const state = store.getState();
    expect(state.activeClips.kick).toBe(clipId('deriva', 'kick'));
    expect(state.pattern.steps.kick).toEqual(
      state.scenes.deriva.pattern.steps.kick
    );
  });

  it('saves the outgoing live pattern into its clip', () => {
    const { store, clips } = setup();
    const kick = store.getState().pattern.steps.kick!.map((value, index) =>
      index === 1 ? 1 : value
    );
    store.update(state => ({
      ...state,
      pattern: {
        ...state.pattern,
        steps: { ...state.pattern.steps, kick }
      }
    }));

    clips.launchClip(clipId('deriva', 'kick'));

    expect(
      store.getState().clips[clipId('umbral', 'kick')]?.pattern.steps
    ).toEqual(kick);
  });

  it('schedules a quantized launch while playing', () => {
    const { store, runtime, clips } = setup();
    store.update(state => ({
      ...state,
      transport: { ...state.transport, playing: true }
    }));
    runtime.absoluteStep = 0;

    clips.launchClip(clipId('deriva', 'kick'), 'bar');

    expect(store.getState().activeClips.kick).toBe(clipId('umbral', 'kick'));
    expect(runtime.pendingClipActions.at(-1)?.targetStep).toBe(16);

    clips.applyPending(15);
    expect(store.getState().activeClips.kick).toBe(clipId('umbral', 'kick'));

    clips.applyPending(16);
    expect(store.getState().activeClips.kick).toBe(clipId('deriva', 'kick'));
  });

  it('launches a whole scene row', () => {
    const { store, clips } = setup();

    clips.launchScene('pulso');

    const state = store.getState();
    expect(state.activeClips.kick).toBe(clipId('pulso', 'kick'));
    expect(state.activeClips['track-09']).toBe(clipId('pulso', 'track-09'));
  });

  it('stops a track without losing its last pattern', () => {
    const { store, clips } = setup();

    clips.stopTrack('kick');

    const state = store.getState();
    expect(state.activeClips.kick).toBeNull();
    expect(state.pattern.steps.kick).toHaveLength(16);
  });

  it('applies follow actions after the configured bars', () => {
    const { store, runtime, clips } = setup();
    const umbralKick = clipId('umbral', 'kick');
    clips.setFollowAction(umbralKick, 'next');
    clips.setFollowAfter(umbralKick, 1);
    runtime.clipStartedAt.kick = 0;

    runtime.absoluteStep = 16;
    clips.applyPending(16);

    expect(store.getState().activeClips.kick).toBe(clipId('deriva', 'kick'));
  });

  it('cancels a pending launch for a track', () => {
    const { store, runtime, clips } = setup();
    store.update(state => ({
      ...state,
      transport: { ...state.transport, playing: true }
    }));
    runtime.absoluteStep = 0;

    clips.launchClip(clipId('deriva', 'kick'), 'bar');
    expect(runtime.pendingClipActions).toHaveLength(1);

    clips.cancelPending('kick');

    expect(runtime.pendingClipActions).toHaveLength(0);
  });

  it('creates, renames, colors and removes clips', () => {
    const { store, clips } = setup();
    const kick = clipId('umbral', 'kick');

    clips.removeClip(kick);
    expect(store.getState().clips[kick]).toBeUndefined();

    clips.createClip('umbral', 'kick');
    const created = store.getState().clips[kick];
    expect(created?.pattern.steps).toHaveLength(16);

    clips.renameClip(kick, 'Kick A');
    clips.setClipColor(kick, '#aabbcc');
    expect(store.getState().clips[kick]?.name).toBe('Kick A');
    expect(store.getState().clips[kick]?.color).toBe('#aabbcc');

    clips.removeClip(kick);
    expect(store.getState().clips[kick]).toBeUndefined();
  });

  it('duplicates a clip into a free scene slot', () => {
    const { store, clips } = setup();
    clips.removeClip(clipId('umbral', 'kick'));

    clips.duplicateClip(clipId('deriva', 'kick'));

    const copy = store.getState().clips[clipId('umbral', 'kick')];
    expect(copy?.pattern.steps).toEqual(
      store.getState().clips[clipId('deriva', 'kick')]?.pattern.steps
    );
  });

  it('persists clip patterns independently from scenes', () => {
    const { store, clips } = setup();
    const derivaKick = clipId('deriva', 'kick');
    clips.launchClip(derivaKick);
    const kick = store.getState().pattern.steps.kick!.map((value, index) =>
      index === 2 ? 1 : value
    );
    store.update(state => ({
      ...state,
      pattern: {
        ...state.pattern,
        steps: { ...state.pattern.steps, kick }
      }
    }));

    clips.launchClip(clipId('umbral', 'kick'));
    expect(store.getState().clips[derivaKick]?.pattern.steps).toEqual(kick);

    clips.launchClip(derivaKick);
    expect(store.getState().pattern.steps.kick).toEqual(kick);
  });

  it('persists quantize and clip follow settings in state', () => {
    const { store, clips } = setup();
    const kick = clipId('umbral', 'kick');

    clips.setQuantize('2bar');
    clips.setFollowAction(kick, 'random');
    clips.setFollowAfter(kick, 4);

    const state = store.getState();
    expect(state.clipQuantize).toBe('2bar');
    expect(state.clips[kick]?.followAction).toBe('random');
    expect(state.clips[kick]?.followAfter).toBe(4);
  });
});
