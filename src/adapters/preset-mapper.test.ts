import { describe, expect, it } from 'vitest';
import { PresetMapper } from '../adapters/preset-mapper';
import { createInitialState } from '../application/initial-state';
import { Store } from '../application/store';
import { findInsertByPlugin } from '../domain/channels';
import { FakeGenerative } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const mapper = new PresetMapper(generative);
  return { store, mapper };
}

describe('PresetMapper', () => {
  it('maps delay feedback/time and reverb decay from a preset', () => {
    const { store, mapper } = setup();
    const current = store.getState();

    const config = mapper.fromDto(
      {
        bpm: 90,
        masterVolume: -6,
        channels: {
          pad: {
            volume: -10,
            muted: false,
            solo: false,
            effects: {
              delay: { wet: 0.6, feedback: 0.5, delayTime: 0.5 },
              reverb: { wet: 0.7, roomSize: 0.98 }
            }
          }
        }
      },
      current
    );

    expect(config.bpm).toBe(90);
    expect(config.masterVolume).toBe(-6);
    expect(config.kit.tracks.pad?.gainDb).toBe(-10);
    expect(findInsertByPlugin(config.kit.tracks.pad!.inserts, 'delay')?.params).toEqual({
      wet: 0.6,
      feedback: 0.5,
      time: 0.5
    });
    const reverb = findInsertByPlugin(config.kit.tracks.pad!.inserts, 'reverb');
    expect(reverb?.params.wet).toBe(0.7);
    expect(reverb?.params.decay).toBeCloseTo(0.5 + 0.98 * 5.5);
  });

  it('adds effects to channels that do not have them yet', () => {
    const { store, mapper } = setup();
    const current = store.getState();

    const config = mapper.fromDto(
      {
        channels: {
          bass: {
            effects: {
              delay: { wet: 0.6, feedback: 0.5, delayTime: 0.5 },
              reverb: { wet: 0.7, roomSize: 0.9 }
            }
          }
        }
      },
      current
    );

    expect(findInsertByPlugin(config.kit.tracks.bass!.inserts, 'delay')?.params).toEqual({
      wet: 0.6,
      feedback: 0.5,
      time: 0.5
    });
    expect(findInsertByPlugin(config.kit.tracks.bass!.inserts, 'reverb')?.params.wet).toBe(0.7);
  });

  it('maps machines per preset and per scene', () => {
    const { store, mapper } = setup();
    const current = store.getState();

    const config = mapper.fromDto(
      {
        channels: {
          'track-17': { volume: -16, pan: -0.2 }
        },
        machines: {
          'track-08': 'analog-pad',
          'track-17': 'pluck'
        },
        patterns: {
          'track-17': '..x..x..x..x..x.'
        },
        scenes: {
          deriva: {
            machines: { 'track-08': 'bass-synth' }
          }
        }
      },
      current
    );

    expect(config.scenes?.umbral.kit.tracks['track-08']?.machineId).toBe(
      'analog-pad'
    );
    expect(config.scenes?.deriva.kit.tracks['track-08']?.machineId).toBe(
      'bass-synth'
    );
    expect(config.scenes?.caos.kit.tracks['track-17']?.machineId).toBe('pluck');
    expect(config.scenes?.umbral.kit.tracks['track-17']?.gainDb).toBe(-16);
    expect(config.scenes?.umbral.kit.tracks['track-17']?.pan).toBe(-0.2);
    expect(config.scenes?.umbral.pattern.steps['track-17']?.[2]).toBe(1);
  });

  it('maps the acid machine and accent/slide flags', () => {
    const { store, mapper } = setup();
    const current = store.getState();

    const config = mapper.fromDto(
      {
        machines: { bass: 'acid-303' },
        patterns: { bass: 'x.xx.xxx.x.xx.xx' },
        accents: { bass: 'x...x...x...x...' },
        slides: { bass: '...x...x...x...x' },
        scenes: {
          deriva: {
            accents: { bass: '..x...x...x...x.' }
          }
        }
      },
      current
    );

    expect(config.kit.tracks.bass?.machine.kind).toBe('mono');
    expect(config.kit.tracks.bass?.machine.filter?.q).toBeGreaterThan(10);
    expect(config.pattern!.accents.bass?.[0]).toBe(1);
    expect(config.pattern!.accents.bass?.[1]).toBe(0);
    expect(config.pattern!.slides.bass?.[3]).toBe(1);
    expect(config.scenes!.deriva.pattern.accents.bass?.[2]).toBe(1);
  });

  it('maps a full musical preset with scenes, patterns, pan and sends', () => {
    const { store, mapper } = setup();
    const current = store.getState();

    const config = mapper.fromDto(
      {
        bpm: 128,
        masterVolume: -5,
        scene: 'deriva',
        selected: 'track-08',
        harmony: { root: 2, scale: 'dorian', progression: 'pedal', sustain: 0.6 },
        params: { density: 0.4, complexity: 0.3 },
        channels: {
          bass: {
            volume: -9,
            pan: -0.2,
            sends: [{ busId: 'delay-bus', amount: 0.4, preFader: true }]
          }
        },
        patterns: {
          kick: 'x...x...x...x...',
          bass: '..x...x...x...x.',
          'track-08': 'x.x.x.x.x.x.x.x.'
        },
        scenes: {
          deriva: {
            seed: 33,
            patterns: { bass: 'x..x..x...x..x..' }
          }
        }
      },
      current
    );

    expect(config.bpm).toBe(128);
    expect(config.scene).toBe('deriva');
    expect(config.selected).toBe('track-08');
    expect(config.harmony).toEqual({
      root: 2,
      scale: 'dorian',
      progression: 'pedal',
      sustain: 0.6
    });
    expect(config.pattern?.steps.kick?.[0]).toBe(1);
    expect(config.pattern?.steps.bass?.[0]).toBe(1);
    expect(config.pattern?.steps['track-08']?.[0]).toBe(1);
    expect(config.scenes?.umbral.pattern.steps.bass?.[1]).toBe(0);
    expect(config.scenes?.deriva.pattern.steps.kick?.[0]).toBe(1);
    expect(config.scenes?.deriva.seed).toBe(33);
    expect(config.scenes?.deriva.kit.tracks.bass?.gainDb).toBe(-9);
    expect(config.scenes?.deriva.kit.tracks.bass?.pan).toBe(-0.2);
    expect(config.scenes?.deriva.kit.tracks.bass?.sends).toEqual([
      { busId: 'delay-bus', amount: 0.4, preFader: true }
    ]);
    expect(config.scenes?.caos.pattern.steps['track-08']?.[0]).toBe(1);
  });
});
