import { describe, expect, it } from 'vitest';
import { SessionMapper } from '../adapters/session-mapper';
import { ClipService } from '../application/clip';
import { createInitialState } from '../application/initial-state';
import { MixService } from '../application/mix';
import { PlaybackRuntime } from '../application/runtime';
import { SceneService } from '../application/scenes';
import { Store } from '../application/store';
import { TrackService } from '../application/tracks';
import {
  delayInsert,
  findInsertByPlugin,
  reverbInsert
} from '../domain/channels';
import { clipId } from '../domain/clip';
import { FakeAudioEngine, FakeGenerative, FakeStatus } from '../test/fakes';

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
              : index === 3
                ? [{ kind: 'track' as const, paramId: 'pan' as const, value: -0.5 }]
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
            macros: [0.2, 0.8],
            sends: [{ busId: 'reverb-bus', amount: 0.35, preFader: true }]
          },
          'track-09': {
            ...state.kit.tracks['track-09']!,
            machineId: 'plugin-fm-synth',
            machine: {
              kind: 'plugin',
              pluginId: 'fm-synth',
              params: { harmonicity: 3.5 }
            },
            noteSource: { kind: 'scale-degree', degree: 0, octave: 4 }
          }
        },
        buses: state.kit.buses.map(bus =>
          bus.id === 'reverb-bus'
            ? {
                ...bus,
                returnDb: -20,
                sends: [{ busId: 'delay-bus', amount: 0.35, preFader: false }]
              }
            : bus
        )
      },
      transport: { ...state.transport, bpm: 132, swing: 0.2, humanize: 0.05, lookAhead: 0.15 },
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
    expect(restored.transport.lookAhead).toBe(0.15);
    expect(restored.masterVolume).toBe(-7);
    expect(restored.selected).toBe('track-08');
    expect(restored.pattern.steps['track-08']?.[4]).toBe(1);
    expect(restored.pattern.pulses['track-08']).toBe(5);
    expect(restored.pattern.frozen['track-08']).toBe(true);
    expect(restored.pattern.locks.kick?.[2]).toEqual([
      { insertId: 'drive', paramId: 'drive', value: 0.7 }
    ]);
    expect(restored.pattern.locks.kick?.[3]).toEqual([
      { kind: 'track', paramId: 'pan', value: -0.5 }
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
    expect(restored.kit.tracks['track-08']?.macros).toEqual([0.2, 0.8]);
    expect(restored.kit.tracks['track-09']?.machine.kind).toBe('plugin');
    expect(restored.kit.tracks['track-09']?.machine.pluginId).toBe('fm-synth');
    expect(restored.kit.tracks['track-09']?.machine.params).toEqual({
      harmonicity: 3.5
    });
    expect(restored.kit.tracks['track-08']?.sends).toEqual([
      { busId: 'reverb-bus', amount: 0.35, preFader: true }
    ]);
    expect(restored.kit.buses.find(bus => bus.id === 'reverb-bus')?.returnDb).toBe(-20);
    expect(restored.kit.buses.find(bus => bus.id === 'reverb-bus')?.sends).toEqual([
      { busId: 'delay-bus', amount: 0.35, preFader: false }
    ]);
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
    expect(() => mapper.fromDto({ version: 4 }, store.getState())).toThrow('Sesión inválida');
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

  it('round-trips a sound bank preset', () => {
    const { store, mapper } = setup();
    const tracks = new TrackService(store, new FakeAudioEngine(), new FakeStatus());

    tracks.applySoundPreset('fm-bell', 'track-08');

    const restored = mapper.fromDto(
      JSON.parse(JSON.stringify(mapper.toDto(store.getState()))),
      store.getState()
    );

    expect(restored.kit.tracks['track-08']?.machineId).toBe('plugin-fm-synth');
    expect(restored.kit.tracks['track-08']?.machine.params?.harmonicity).toBe(3.5);
    expect(restored.kit.tracks['track-08']?.noteSource).toEqual({
      kind: 'scale-degree',
      degree: 0,
      octave: 5
    });
  });

  it('round-trips clips, active clips and follow settings', () => {
    const { store, mapper } = setup();
    const clips = new ClipService(store, new PlaybackRuntime(), new FakeStatus());
    const derivaKick = clipId('deriva', 'kick');

    clips.launchClip(derivaKick);
    clips.setFollowAction(derivaKick, 'next');
    clips.setFollowAfter(derivaKick, 2);
    clips.setQuantize('beat');

    const restored = mapper.fromDto(
      JSON.parse(JSON.stringify(mapper.toDto(store.getState()))),
      store.getState()
    );

    expect(restored.activeClips.kick).toBe(derivaKick);
    expect(restored.clips[derivaKick]?.followAction).toBe('next');
    expect(restored.clips[derivaKick]?.followAfter).toBe(2);
    expect(restored.clipQuantize).toBe('beat');
    expect(restored.pattern.steps.kick).toEqual(
      restored.scenes.deriva.pattern.steps.kick
    );
  });

  it('round-trips dynamic scenes, their order and their clips', () => {
    const { store, mapper } = setup();
    const scenes = new SceneService(
      store,
      new MixService(store, new FakeAudioEngine()),
      new PlaybackRuntime(),
      new FakeStatus()
    );
    const dynamicId = scenes.addScene()!;
    scenes.moveScene(dynamicId, -1);

    const original = store.getState();
    const restored = mapper.fromDto(
      JSON.parse(JSON.stringify(mapper.toDto(original))),
      original
    );

    expect(Object.keys(restored.scenes)).toEqual(
      Object.keys(original.scenes)
    );
    expect(restored.scenes[dynamicId]?.name).toBe('Escena 5');
    expect(restored.clips[clipId(dynamicId, 'kick')]?.pattern.steps).toEqual(
      original.clips[clipId(dynamicId, 'kick')]?.pattern.steps
    );
  });

  it('loads version 2 sessions with the four base scenes', () => {
    const { store, mapper } = setup();
    const dto = JSON.parse(JSON.stringify(mapper.toDto(store.getState())));

    const restored = mapper.fromDto({ ...dto, version: 2 }, store.getState());

    expect(Object.keys(restored.scenes)).toEqual([
      'umbral',
      'deriva',
      'pulso',
      'caos'
    ]);
    expect(restored.clips[clipId('umbral', 'kick')]).toBeDefined();
  });

  it('round-trips a session after removing a scene', () => {
    const { store, mapper } = setup();
    const scenes = new SceneService(
      store,
      new MixService(store, new FakeAudioEngine()),
      new PlaybackRuntime(),
      new FakeStatus()
    );
    scenes.removeScene('caos');

    const original = store.getState();
    const restored = mapper.fromDto(
      JSON.parse(JSON.stringify(mapper.toDto(original))),
      original
    );

    expect(Object.keys(restored.scenes)).toEqual(['umbral', 'deriva', 'pulso']);
    expect(restored.clips[clipId('caos', 'kick')]).toBeUndefined();
  });

  it('round-trips browser favorites and recents', () => {
    const { store, mapper } = setup();
    store.update(state => ({
      ...state,
      favorites: ['warm-pad'],
      recentSounds: ['acid-bass', 'warm-pad']
    }));

    const restored = mapper.fromDto(
      JSON.parse(JSON.stringify(mapper.toDto(store.getState()))),
      store.getState()
    );

    expect(restored.favorites).toEqual(['warm-pad']);
    expect(restored.recentSounds).toEqual(['acid-bass', 'warm-pad']);
  });

  it('discards unknown browser ids when loading', () => {
    const { store, mapper } = setup();
    const dto = JSON.parse(JSON.stringify(mapper.toDto(store.getState())));

    const restored = mapper.fromDto(
      { ...dto, favorites: ['no-existe', 'warm-pad'], recentSounds: ['no-existe'] },
      store.getState()
    );

    expect(restored.favorites).toEqual(['warm-pad']);
    expect(restored.recentSounds).toEqual([]);
  });

  it('round-trips the arrangement', () => {
    const { store, mapper } = setup();
    store.update(state => ({
      ...state,
      arrangement: {
        enabled: true,
        blocks: [
          { id: 'a', sceneId: 'pulso', bars: 2 },
          { id: 'b', sceneId: 'caos', bars: 6 }
        ],
        blockIndex: 1,
        bar: 3
      }
    }));

    const restored = mapper.fromDto(
      JSON.parse(JSON.stringify(mapper.toDto(store.getState()))),
      store.getState()
    );

    expect(restored.arrangement.enabled).toBe(true);
    expect(restored.arrangement.blocks).toEqual([
      { id: 'a', sceneId: 'pulso', bars: 2 },
      { id: 'b', sceneId: 'caos', bars: 6 }
    ]);
    expect(restored.arrangement.blockIndex).toBe(1);
    expect(restored.arrangement.bar).toBe(3);
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
