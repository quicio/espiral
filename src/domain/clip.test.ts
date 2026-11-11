import { describe, expect, it } from 'vitest';
import { createInitialState } from '../application/initial-state';
import { FakeGenerative } from '../test/fakes';
import {
  activeClipsForScene,
  addClipsForTrack,
  applyTrackPatternData,
  clipId,
  createClipsFromScenes,
  materializeScenes,
  nextQuantizedStep,
  removeClipsForTrack,
  trackPatternData
} from './clip';

function state() {
  return createInitialState(new FakeGenerative());
}

describe('clip helpers', () => {
  it('creates one clip per pattern track and scene', () => {
    const initial = state();
    const clips = createClipsFromScenes(initial.scenes);
    const patternTracks = Object.values(initial.kit.tracks).filter(
      track => track.hasPattern
    );

    expect(Object.keys(clips)).toHaveLength(patternTracks.length * 4);
    expect(clips[clipId('umbral', 'kick')]?.name).toBe('Kick');
    expect(clips[clipId('caos', 'track-08')]?.color).toBe('#8e7cc3');
  });

  it('maps the active clips of a scene', () => {
    const initial = state();
    const clips = createClipsFromScenes(initial.scenes);
    const active = activeClipsForScene(clips, 'deriva');

    expect(active.kick).toBe(clipId('deriva', 'kick'));
    expect(active['track-09']).toBe(clipId('deriva', 'track-09'));
    expect(active.pad).toBeUndefined();
  });

  it('reads and writes a single track pattern', () => {
    const initial = state();
    const data = trackPatternData(initial.pattern, 'kick');
    expect(data).not.toBeNull();

    const changed = applyTrackPatternData(initial.pattern, 'kick', {
      ...data!,
      pulses: 7
    });

    expect(changed.pulses.kick).toBe(7);
    expect(initial.pattern.pulses.kick).not.toBe(7);
  });

  it('materializes active clips into their source scenes', () => {
    const base = state();
    const initial = {
      ...base,
      pattern: {
        ...base.pattern,
        steps: {
          ...base.pattern.steps,
          kick: base.pattern.steps.kick!.map((value, index) =>
            index === 1 ? 1 : value
          )
        }
      },
      activeClips: {
        ...base.activeClips,
        kick: clipId('deriva', 'kick')
      }
    };

    const scenes = materializeScenes(initial);

    expect(scenes.deriva.pattern.steps.kick?.[1]).toBe(1);
    expect(scenes.umbral.pattern.steps.kick?.[1]).toBe(
      base.scenes.umbral.pattern.steps.kick?.[1]
    );
  });

  it('adds and removes clips for a track', () => {
    const initial = state();
    const clips = createClipsFromScenes(initial.scenes);
    const without = removeClipsForTrack(clips, 'track-09');
    expect(Object.values(without).some(clip => clip.trackId === 'track-09')).toBe(
      false
    );

    const added = addClipsForTrack(without, initial.scenes, 'track-09');
    expect(added[clipId('umbral', 'track-09')]).toBeDefined();
    expect(added[clipId('caos', 'track-09')]).toBeDefined();
  });

  it('calculates the next quantized step', () => {
    expect(nextQuantizedStep(0, 'immediate')).toBe(0);
    expect(nextQuantizedStep(0, 'beat')).toBe(4);
    expect(nextQuantizedStep(2, 'beat')).toBe(4);
    expect(nextQuantizedStep(0, 'bar')).toBe(16);
    expect(nextQuantizedStep(15, 'bar')).toBe(16);
    expect(nextQuantizedStep(16, 'bar')).toBe(32);
    expect(nextQuantizedStep(16, '2bar')).toBe(32);
  });
});
