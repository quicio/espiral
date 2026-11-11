import { describe, expect, it } from 'vitest';
import { createInitialState } from '../application/initial-state';
import { FakeGenerative } from '../test/fakes';
import { countSteps } from './pattern';
import {
  defaultGroovePattern,
  defaultProbability,
  defaultRatchets,
  defaultVelocity
} from './default-groove';

const SCENES = ['umbral', 'deriva', 'pulso', 'caos'] as const;
const LAYERS = ['kick', 'bass', 'hihat', 'perc', 'track-08', 'track-09'] as const;

describe('defaultGroovePattern', () => {
  it('curates a non-empty pattern for every scene layer', () => {
    SCENES.forEach(scene => {
      LAYERS.forEach(trackId => {
        const pattern = defaultGroovePattern(scene, trackId);
        expect(pattern).not.toBeNull();
        expect(countSteps(pattern!)).toBeGreaterThan(0);
      });
    });
  });

  it('leaves tracks without a curated groove blank', () => {
    expect(defaultGroovePattern('umbral', 'track-13')).toBeNull();
    expect(defaultGroovePattern('umbral', 'track-16')).toBeNull();
  });
});

describe('default dynamics', () => {
  it('returns one value per step with accents and ghost notes', () => {
    const velocity = defaultVelocity('kick');
    expect(velocity).toHaveLength(16);
    expect(velocity[0]).toBe(1);
    expect(velocity[15]).toBe(0.55);
    expect(defaultProbability('kick')[15]).toBe(0.55);
    expect(defaultRatchets('track-08')[6]).toBe(2);
    expect(defaultRatchets('track-08')[14]).toBe(2);
  });

  it('falls back to neutral values for unknown tracks', () => {
    expect(defaultVelocity('track-16')).toEqual(Array.from({ length: 16 }, () => 1));
    expect(defaultProbability('track-16')).toEqual(Array.from({ length: 16 }, () => 1));
    expect(defaultRatchets('track-16')).toEqual(Array.from({ length: 16 }, () => 1));
  });
});

describe('default state groove', () => {
  it('wires curated patterns and pulses into every scene', () => {
    const state = createInitialState(new FakeGenerative());

    SCENES.forEach(scene => {
      const snapshot = state.scenes[scene];
      const kick = defaultGroovePattern(scene, 'kick');
      expect(snapshot.pattern.steps.kick).toEqual(kick);
      expect(snapshot.pattern.pulses.kick).toBe(countSteps(kick!));
    });
  });

  it('adds panned percussion layers with sends', () => {
    const state = createInitialState(new FakeGenerative());
    const shaker = state.kit.tracks['track-08'];
    const perc = state.kit.tracks['track-09'];

    expect(shaker?.pan).toBeGreaterThan(0);
    expect(shaker?.sends.length).toBeGreaterThan(0);
    expect(perc?.pan).toBeLessThan(0);
    expect(perc?.sends.length).toBeGreaterThan(0);
    expect(state.pattern.steps['track-08']).toEqual(
      defaultGroovePattern('umbral', 'track-08')
    );
  });
});
