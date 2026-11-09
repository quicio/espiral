import { describe, expect, it } from 'vitest';
import { createInitialState } from '../application/initial-state';
import { PlaybackService } from '../application/playback';
import { PlaybackRuntime } from '../application/runtime';
import { Store } from '../application/store';
import {
  FakeAudioEngine,
  FakeAutomation,
  FakeClock,
  FakeEvolver,
  FakeGenerative,
  FakeStatus
} from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const runtime = new PlaybackRuntime();
  const clock = new FakeClock();
  const engine = new FakeAudioEngine();
  const status = new FakeStatus();
  const automation = new FakeAutomation();
  const evolver = new FakeEvolver();
  const playback = new PlaybackService(
    store,
    clock,
    engine,
    generative,
    status,
    automation,
    evolver,
    runtime
  );
  return { store, runtime, clock, engine, status, automation, evolver, playback };
}

describe('PlaybackService', () => {
  it('prepares the engine and starts the clock', async () => {
    const { playback, engine, clock, store } = setup();

    await playback.start();

    expect(engine.prepared).toBe(1);
    expect(clock.started).toBe(1);
    expect(store.getState().transport.playing).toBe(true);
  });

  it('turns the step into sound events and automation', async () => {
    const { playback, clock, engine, automation, store } = setup();
    await playback.start();

    clock.fire(1, 0);

    expect(store.getState().transport.currentStep).toBe(0);
    expect(automation.calls).toEqual([{ step: 0, time: 1 }]);
    expect(engine.events.some(event => event.type === 'kick')).toBe(true);
    expect(
      engine.events.some(event => event.type === 'sample' && event.channel === 'bass')
    ).toBe(true);
    expect(
      engine.events.some(event => event.type === 'sample' && event.channel === 'drone')
    ).toBe(true);
    expect(
      engine.events.some(event => event.type === 'synth' && event.channel === 'pad')
    ).toBe(true);
  });

  it('triggers a user track sample when its step is active', async () => {
    const { playback, clock, engine, store } = setup();
    store.update(state => ({
      ...state,
      pattern: {
        ...state.pattern,
        steps: {
          ...state.pattern.steps,
          'track-08': state.pattern.steps['track-08']!.map((value, index) =>
            index === 0 ? 1 : value
          )
        }
      }
    }));
    await playback.start();
    engine.events.length = 0;

    clock.fire(1, 0);

    const event = engine.events.find(
      entry => entry.type === 'sample' && entry.trackId === 'track-08'
    );
    expect(event).toEqual(
      expect.objectContaining({
        type: 'sample',
        channel: 'perc',
        trackId: 'track-08',
        sampleIndex: 0
      })
    );
  });

  it('applies parameter locks on active steps and restores the base', async () => {
    const { playback, clock, engine, store } = setup();
    store.update(state => {
      const locks: { insertId: string; paramId: string; value: number }[][] =
        Array.from({ length: 16 }, () => []);
      locks[0] = [{ insertId: 'filter', paramId: 'cutoff', value: 400 }];
      return {
        ...state,
        kit: {
          ...state.kit,
          tracks: {
            ...state.kit.tracks,
            kick: {
              ...state.kit.tracks.kick!,
              inserts: [
                {
                  id: 'filter',
                  pluginId: 'filter',
                  bypass: false,
                  params: { cutoff: 1200, q: 1 }
                }
              ]
            }
          }
        },
        pattern: {
          ...state.pattern,
          locks: { ...state.pattern.locks, kick: locks }
        }
      };
    });
    await playback.start();
    engine.params.length = 0;

    clock.fire(1, 0);

    expect(engine.params.at(-1)?.value).toBe(400);

    clock.fire(1.125, 1);

    expect(engine.params.at(-1)?.value).toBe(1200);
  });

  it('restores active locks when the transport stops', async () => {
    const { playback, clock, engine, store } = setup();
    store.update(state => {
      const locks: { insertId: string; paramId: string; value: number }[][] =
        Array.from({ length: 16 }, () => []);
      locks[0] = [{ insertId: 'filter', paramId: 'cutoff', value: 400 }];
      return {
        ...state,
        kit: {
          ...state.kit,
          tracks: {
            ...state.kit.tracks,
            kick: {
              ...state.kit.tracks.kick!,
              inserts: [
                {
                  id: 'filter',
                  pluginId: 'filter',
                  bypass: false,
                  params: { cutoff: 1200, q: 1 }
                }
              ]
            }
          }
        },
        pattern: {
          ...state.pattern,
          locks: { ...state.pattern.locks, kick: locks }
        }
      };
    });
    await playback.start();
    clock.fire(1, 0);
    engine.params.length = 0;

    playback.stop();

    expect(engine.params.at(-1)?.value).toBe(1200);
  });

  it('applies velocity, probability and ratchets to pattern hits', async () => {
    const { playback, clock, engine, store } = setup();
    store.update(state => ({
      ...state,
      pattern: {
        ...state.pattern,
        velocity: {
          ...state.pattern.velocity,
          kick: state.pattern.velocity.kick!.map((value, index) =>
            index === 0 ? 0.5 : value
          )
        },
        probability: {
          ...state.pattern.probability,
          kick: state.pattern.probability.kick!.map((_value, index) =>
            index === 0 ? 1 : 0
          )
        },
        ratchets: {
          ...state.pattern.ratchets,
          kick: state.pattern.ratchets.kick!.map((value, index) =>
            index === 0 ? 3 : value
          )
        }
      }
    }));
    await playback.start();
    engine.events.length = 0;

    clock.fire(1, 0);
    clock.fire(1.125, 1);

    const kicks = engine.events.filter(event => event.type === 'kick');
    expect(kicks).toHaveLength(3);
    expect(kicks.every(event => event.type === 'kick' && event.velocity === 0.5)).toBe(
      true
    );
  });

  it('skips a step when probability is zero', async () => {
    const { playback, clock, engine, store } = setup();
    store.update(state => ({
      ...state,
      pattern: {
        ...state.pattern,
        probability: {
          ...state.pattern.probability,
          kick: state.pattern.probability.kick!.map((value, index) =>
            index === 0 ? 0 : value
          )
        }
      }
    }));
    await playback.start();
    engine.events.length = 0;

    clock.fire(1, 0);

    expect(engine.events.some(event => event.type === 'kick')).toBe(false);
  });

  it('triggers a synth note for a user track with a synth machine', async () => {
    const { playback, clock, engine, store } = setup();
    store.update(state => {
      const track = state.kit.tracks['track-08']!;
      return {
        ...state,
        kit: {
          ...state.kit,
          tracks: {
            ...state.kit.tracks,
            'track-08': {
              ...track,
              machineId: 'analog-pad',
              machine: {
                kind: 'poly',
                oscillator: 'sawtooth',
                envelope: { attack: 1, decay: 1, sustain: 0.8, release: 3 },
                maxPolyphony: 8
              },
              noteSource: { kind: 'fixed', note: 'C4' }
            }
          }
        },
        pattern: {
          ...state.pattern,
          steps: {
            ...state.pattern.steps,
            'track-08': state.pattern.steps['track-08']!.map((value, index) =>
              index === 0 ? 1 : value
            )
          }
        }
      };
    });
    await playback.start();
    engine.events.length = 0;

    clock.fire(1, 0);

    const event = engine.events.find(
      entry => entry.type === 'synth' && entry.trackId === 'track-08'
    );
    expect(event).toEqual(
      expect.objectContaining({
        type: 'synth',
        channel: 'pad',
        trackId: 'track-08',
        notes: 'C4',
        velocity: 1
      })
    );
  });

  it('does not trigger silent steps', async () => {
    const { playback, clock, engine } = setup();
    await playback.start();
    engine.events.length = 0;

    clock.fire(1.125, 1);

    expect(
      engine.events.some(event => event.type === 'sample' && event.channel === 'hihat')
    ).toBe(true);
    expect(engine.events.some(event => event.type === 'kick')).toBe(false);
    expect(
      engine.events.some(event => event.type === 'sample' && event.channel === 'bass')
    ).toBe(false);
  });

  it('retriggers the drone every 16 beats to avoid a long gap', async () => {
    const { playback, clock, engine } = setup();
    await playback.start();
    engine.events.length = 0;

    clock.fire(8, 64);

    expect(
      engine.events.some(event => event.type === 'sample' && event.channel === 'drone')
    ).toBe(true);
  });

  it('evolves every 32 steps when enabled', async () => {
    const { playback, clock, evolver, store } = setup();
    await playback.start();
    store.update(state => ({ ...state, evolve: true }));

    clock.fire(2, 32);

    expect(evolver.count).toBe(1);
  });

  it('stops the clock and the engine', async () => {
    const { playback, clock, engine, store } = setup();
    await playback.start();

    playback.stop();

    expect(clock.stopped).toBe(1);
    expect(engine.stopped).toBe(1);
    expect(store.getState().transport.playing).toBe(false);
    expect(store.getState().transport.currentStep).toBe(-1);
  });

  it('updates bpm, swing and humanize', () => {
    const { playback, store, clock } = setup();

    playback.setBpm(140);
    playback.setSwing(0.3);
    playback.setHumanize(0.5);

    expect(clock.bpm).toBe(140);
    expect(store.getState().transport.bpm).toBe(140);
    expect(store.getState().transport.swing).toBe(0.3);
    expect(store.getState().transport.humanize).toBe(0.5);
  });
});
