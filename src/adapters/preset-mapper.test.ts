import { describe, expect, it } from 'vitest';
import { PresetMapper } from '../adapters/preset-mapper';
import { createInitialState } from '../application/initial-state';
import { Store } from '../application/store';
import { findInsertByPlugin } from '../domain/channels';
import { FakeGenerative } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const mapper = new PresetMapper();
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

  it('does not add effects to channels that do not support them', () => {
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

    expect(findInsertByPlugin(config.kit.tracks.bass!.inserts, 'delay')).toBeUndefined();
    expect(findInsertByPlugin(config.kit.tracks.bass!.inserts, 'reverb')).toBeUndefined();
  });
});
