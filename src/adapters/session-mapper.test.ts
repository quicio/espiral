import { describe, expect, it } from 'vitest';
import { SessionMapper } from '../adapters/session-mapper';
import { createInitialState } from '../application/initial-state';
import { Store } from '../application/store';
import {
  delayInsert,
  findInsertByPlugin,
  reverbInsert
} from '../domain/channels';
import { FakeGenerative } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const mapper = new SessionMapper(generative);
  return { store, mapper };
}

describe('SessionMapper', () => {
  it('round-trips a session', () => {
    const { store, mapper } = setup();
    store.update(state => ({
      ...state,
      seed: 99,
      pattern: {
        ...state.pattern,
        steps: {
          ...state.pattern.steps,
          kick: state.pattern.steps.kick!.map((value, index) =>
            index === 0 ? 0 : value
          ),
          'track-08': state.pattern.steps['track-08']!.map((value, index) =>
            index === 4 ? 1 : value
          )
        },
        pulses: { ...state.pattern.pulses, 'track-08': 5 },
        frozen: { ...state.pattern.frozen, 'track-08': true },
        locks: {
          ...state.pattern.locks,
          kick: state.pattern.locks.kick!.map((locks, index) =>
            index === 2
              ? [{ insertId: 'drive', paramId: 'drive', value: 0.7 }]
              : locks
          )
        },
        velocity: {
          ...state.pattern.velocity,
          kick: state.pattern.velocity.kick!.map((value, index) =>
            index === 2 ? 0.4 : value
          )
        },
        probability: {
          ...state.pattern.probability,
          kick: state.pattern.probability.kick!.map((value, index) =>
            index === 2 ? 0.3 : value
          )
        },
        ratchets: {
          ...state.pattern.ratchets,
          kick: state.pattern.ratchets.kick!.map((value, index) =>
            index === 2 ? 3 : value
          )
        }
      },
      selected: 'track-08',
      harmony: { ...state.harmony, root: 7, scale: 'major', progression: 'cadencia', sustain: 0.8 },
      kit: {
        ...state.kit,
        tracks: {
          ...state.kit.tracks,
          kick: {
            ...state.kit.tracks.kick!,
            gainDb: -9,
            muted: true,
            inserts: [
              {
                id: 'drive',
                pluginId: 'drive',
                bypass: false,
                params: { drive: 0.7, mix: 0.4 }
              }
            ]
          },
          pad: {
            ...state.kit.tracks.pad!,
            inserts: [delayInsert(0.6, 0.5, 0.5), reverbInsert(0.9, 6)]
          },
          'track-08': {
            ...state.kit.tracks['track-08']!,
            gainDb: -13,
            machineId: 'analog-pad',
            machine: {
              kind: 'poly',
              oscillator: 'sawtooth',
              envelope: { attack: 1, decay: 1, sustain: 0.8, release: 3 },
              maxPolyphony: 8
            },
            noteSource: { kind: 'fixed', note: 'A3' },
            sends: [{ busId: 'reverb-bus', amount: 0.35, preFader: true }]
          }
        },
        buses: state.kit.buses.map(bus =>
          bus.id === 'reverb-bus' ? { ...bus, returnDb: -20 } : bus
        )
      },
      transport: { ...state.transport, bpm: 132, swing: 0.2, humanize: 0.05 },
      modulation: {
        ...state.modulation,
        enabled: true,
        routes: [
          {
            id: 'route-1',
            sourceId: 'lfo-1',
            target: { trackId: 'pad', insertId: 'delay', paramId: 'wet' },
            amount: -0.6,
            bipolar: true
          }
        ]
      },
      masterVolume: -7
    }));

    const original = store.getState();
    const dto = mapper.toDto(original);
    const restored = mapper.fromDto(JSON.parse(JSON.stringify(dto)), original);

    expect(restored.seed).toBe(99);
    expect(restored.pattern.steps.kick?.[0]).toBe(0);
    expect(restored.harmony).toEqual(original.harmony);
    expect(restored.kit.tracks.kick?.gainDb).toBe(-9);
    expect(restored.kit.tracks.kick?.muted).toBe(true);
    expect(restored.kit.tracks.kick?.inserts).toEqual([
      {
        id: 'drive',
        pluginId: 'drive',
        bypass: false,
        params: { drive: 0.7, mix: 0.4 }
      }
    ]);
    expect(findInsertByPlugin(restored.kit.tracks.pad!.inserts, 'delay')?.params).toEqual({
      wet: 0.6,
      feedback: 0.5,
      time: 0.5
    });
    expect(findInsertByPlugin(restored.kit.tracks.pad!.inserts, 'reverb')?.params).toEqual({
      wet: 0.9,
      decay: 6
    });
    expect(restored.transport.bpm).toBe(132);
    expect(restored.masterVolume).toBe(-7);
    expect(restored.selected).toBe('track-08');
    expect(restored.pattern.steps['track-08']?.[4]).toBe(1);
    expect(restored.pattern.pulses['track-08']).toBe(5);
    expect(restored.pattern.frozen['track-08']).toBe(true);
    expect(restored.pattern.locks.kick?.[2]).toEqual([
      { insertId: 'drive', paramId: 'drive', value: 0.7 }
    ]);
    expect(restored.pattern.velocity.kick?.[2]).toBe(0.4);
    expect(restored.pattern.probability.kick?.[2]).toBe(0.3);
    expect(restored.pattern.ratchets.kick?.[2]).toBe(3);
    expect(restored.kit.tracks['track-08']?.gainDb).toBe(-13);
    expect(restored.kit.tracks['track-08']?.machineId).toBe('analog-pad');
    expect(restored.kit.tracks['track-08']?.machine.kind).toBe('poly');
    expect(restored.kit.tracks['track-08']?.noteSource).toEqual({
      kind: 'fixed',
      note: 'A3'
    });
    expect(restored.kit.tracks['track-08']?.sends).toEqual([
      { busId: 'reverb-bus', amount: 0.35, preFader: true }
    ]);
    expect(restored.kit.buses.find(bus => bus.id === 'reverb-bus')?.returnDb).toBe(-20);
    expect(restored.modulation.enabled).toBe(true);
    expect(restored.modulation.routes).toEqual(original.modulation.routes);
    expect(restored.scenes.umbral.kit.tracks.kick?.gainDb).toBe(-9);
    expect(restored.scenes.umbral.pattern.steps.kick?.[0]).toBe(0);
    expect(restored.scenes.umbral.pattern.locks.kick?.[2]).toEqual([
      { insertId: 'drive', paramId: 'drive', value: 0.7 }
    ]);
    expect(restored.scenes.deriva.pattern.steps.kick).toEqual(
      original.scenes.deriva.pattern.steps.kick
    );
  });

  it('rejects an invalid version', () => {
    const { store, mapper } = setup();
    expect(() => mapper.fromDto({ version: 3 }, store.getState())).toThrow('Sesión inválida');
  });

  it('loads legacy sessions without inserts', () => {
    const { store, mapper } = setup();
    const current = store.getState();

    const restored = mapper.fromDto(
      {
        version: 1,
        channels: {
          hihat: {
            delay: 0.5,
            delayFeedback: 0.2,
            delayTime: 0.4,
            reverb: 0.6,
            reverbDecay: 3
          }
        }
      },
      current
    );

    expect(findInsertByPlugin(restored.kit.tracks.hihat!.inserts, 'delay')?.params).toEqual({
      wet: 0.5,
      feedback: 0.2,
      time: 0.4
    });
    expect(findInsertByPlugin(restored.kit.tracks.hihat!.inserts, 'reverb')?.params).toEqual({
      wet: 0.6,
      decay: 3
    });
  });

  it('ignores invalid session values', () => {
    const { store, mapper } = setup();
    const current = store.getState();

    const restored = mapper.fromDto(
      {
        version: 1,
        selected: 'nope',
        scale: 'nope',
        root: 999,
        channels: {
          bass: { pattern: [1, 1, 1] },
          unknown: { volume: -1 }
        }
      },
      current
    );

    expect(restored.selected).toBe('kick');
    expect(restored.harmony.scale).toBe(current.harmony.scale);
    expect(restored.harmony.root).toBe(current.harmony.root);
    expect(restored.pattern.steps.bass).toEqual(current.pattern.steps.bass);
  });
});
