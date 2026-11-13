import {
  AUTOMATION_TARGETS,
  type AutomationTargetId
} from '../domain/automation';
import {
  findInsertByPlugin,
  isChannelKey,
  isPatternChannel,
  PATTERN_CHANNELS,
  PATTERN_LENGTH,
  type PatternChannel
} from '../domain/channels';
import {
  DEFAULT_CLIP_QUANTIZE,
  activeClipsForScene,
  clipColorForScene,
  createClipsFromScenes,
  emptyClipPattern,
  materializeClips,
  materializeScenes,
  trackPatternData,
  type ActiveClips,
  type ClipCollection,
  type ClipFollowAction,
  type ClipQuantize,
  type ClipState,
  type TrackPatternData
} from '../domain/clip';
import type { InsertConfig, MachineConfig, SendConfig } from '../domain/graph';
import {
  cloneKit,
  kitTracks,
  type BusState,
  type KitState,
  type TrackRole,
  type TrackState
} from '../domain/kit';
import { captureScene } from '../application/scenes';
import type { NoteSource } from '../domain/machines';
import type { SidechainConfig } from '../domain/sidechain';
import { soundPreset } from '../domain/sound-bank';
import type {
  ArrangementState,
  GenerativeParams,
  InstrumentState,
  ProgressionId,
  ScaleId,
  SceneId
} from '../domain/models';
import type {
  LfoShape,
  ModulationRoute,
  ModulationSource,
  ModulationState
} from '../domain/modulation';
import type { GenerativePort, SessionCodec } from '../domain/ports';
import {
  emptyStepValues,
  emptyTrackLocks,
  isValidPattern,
  toPattern,
  type ParamLock,
  type Pattern,
  type PatternLocks,
  type PatternState,
  type PatternSteps,
  type StepValues
} from '../domain/pattern';
import type { SceneCollection, SceneSnapshot } from '../domain/scene';

export interface SessionInsertDto {
  readonly id: string;
  readonly pluginId: string;
  readonly bypass: boolean;
  readonly params: Readonly<Record<string, number>>;
  readonly latencySamples?: number;
}

export interface SessionTrackDto {
  readonly id: string;
  readonly name: string;
  readonly role: TrackRole;
  readonly hasPattern: boolean;
  readonly machineId: string;
  readonly machine: MachineConfig;
  readonly noteSource: NoteSource;
  readonly macros: readonly number[];
  readonly gainDb: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly inserts: readonly SessionInsertDto[];
  readonly sends: readonly SendConfig[];
  readonly outputBusId?: string;
}

export interface SessionBusDto {
  readonly id: string;
  readonly name: string;
  readonly returnDb: number;
  readonly inserts: readonly SessionInsertDto[];
  readonly sends?: readonly SendConfig[];
}

export interface SessionKitDto {
  readonly id: string;
  readonly name: string;
  readonly tracks: Record<string, SessionTrackDto>;
  readonly buses?: readonly SessionBusDto[];
  readonly sidechain?: SidechainConfig;
}

export interface SessionPatternDto {
  readonly steps: Record<string, readonly number[]>;
  readonly pulses: Record<string, number>;
  readonly frozen: Record<string, boolean>;
  readonly locks?: Record<string, readonly (readonly ParamLock[])[]>;
  readonly velocity?: Record<string, readonly number[]>;
  readonly probability?: Record<string, readonly number[]>;
  readonly ratchets?: Record<string, readonly number[]>;
}

export interface SessionSceneDto {
  readonly id: SceneId;
  readonly name: string;
  readonly kit: SessionKitDto;
  readonly pattern: SessionPatternDto;
  readonly harmony: {
    readonly root: number;
    readonly scale: ScaleId;
    readonly progression: ProgressionId;
    readonly sustain: number;
  };
  readonly seed: number;
  readonly params: GenerativeParams;
  readonly masterVolume: number;
}

export interface SessionClipPatternDto {
  readonly steps: readonly number[];
  readonly pulses: number;
  readonly frozen: boolean;
  readonly locks?: readonly (readonly ParamLock[])[];
  readonly velocity?: readonly number[];
  readonly probability?: readonly number[];
  readonly ratchets?: readonly number[];
}

export interface SessionClipDto {
  readonly id: string;
  readonly trackId: string;
  readonly sceneId: SceneId;
  readonly name: string;
  readonly color: string;
  readonly followAction: ClipFollowAction;
  readonly followAfter: number;
  readonly pattern?: SessionClipPatternDto;
}

export interface SessionDto {
  readonly version: 3;
  readonly seed: number;
  readonly scene: SceneId;
  readonly params: GenerativeParams;
  readonly root: number;
  readonly scale: ScaleId;
  readonly progression: ProgressionId;
  readonly sustain: number;
  readonly automation: {
    readonly enabled: boolean;
    readonly target: AutomationTargetId;
    readonly values: readonly number[];
  };
  readonly pulses: Record<string, number>;
  readonly frozen: Record<string, boolean>;
  readonly patterns: Record<string, readonly number[]>;
  readonly locks?: SessionPatternDto['locks'];
  readonly velocity?: SessionPatternDto['velocity'];
  readonly probability?: SessionPatternDto['probability'];
  readonly ratchets?: SessionPatternDto['ratchets'];
  readonly selected: string;
  readonly bpm: number;
  readonly master: number;
  readonly swing: number;
  readonly humanize: number;
  readonly lookAhead?: number;
  readonly evolve: boolean;
  readonly mutationCount: number;
  readonly evolveCount: number;
  readonly kit: SessionKitDto;
  readonly scenes?: Record<string, SessionSceneDto>;
  readonly clips?: Record<string, SessionClipDto>;
  readonly activeClips?: Record<string, string | null>;
  readonly clipQuantize?: ClipQuantize;
  readonly favorites?: readonly string[];
  readonly recentSounds?: readonly string[];
  readonly arrangement?: ArrangementState;
  readonly modulation?: ModulationState;
}

export class SessionMapper implements SessionCodec {
  constructor(private readonly generative: GenerativePort) {}

  toDto(state: InstrumentState): SessionDto {
    const scenes: Record<string, SessionSceneDto> = {};
    const clips = materializeClips(state);
    const materialized = materializeScenes({ ...state, clips });
    const currentPattern =
      materialized[state.scene]?.pattern ?? state.pattern;
    const current = {
      ...state,
      scenes: materialized,
      clips,
      pattern: currentPattern
    };
    Object.entries(materialized).forEach(([id, snapshot]) => {
      scenes[id] = toSceneDto(id === state.scene ? captureScene(current) : snapshot);
    });

    return {
      version: 3,
      seed: state.seed,
      scene: state.scene,
      params: state.params,
      root: state.harmony.root,
      scale: state.harmony.scale,
      progression: state.harmony.progression,
      sustain: state.harmony.sustain,
      automation: {
        enabled: state.automation.enabled,
        target: state.automation.target,
        values: [...state.automation.values]
      },
      pulses: state.pattern.pulses,
      frozen: state.pattern.frozen,
      patterns: Object.fromEntries(
        Object.entries(state.pattern.steps).map(([key, steps]) => [key, [...steps]])
      ),
      locks: toLocksDto(state.pattern),
      velocity: cloneValuesDto(state.pattern.velocity),
      probability: cloneValuesDto(state.pattern.probability),
      ratchets: cloneValuesDto(state.pattern.ratchets),
      selected: state.selected,
      bpm: state.transport.bpm,
      master: state.masterVolume,
      swing: state.transport.swing,
      humanize: state.transport.humanize,
      lookAhead: state.transport.lookAhead,
      evolve: state.evolve,
      mutationCount: state.mutationCount,
      evolveCount: state.evolveCount,
      kit: toKitDto(state.kit),
      scenes,
      clips: toClipsDto(clips),
      activeClips: { ...state.activeClips },
      clipQuantize: state.clipQuantize,
      favorites: [...state.favorites],
      recentSounds: [...state.recentSounds],
      arrangement: state.arrangement,
      modulation: state.modulation
    };
  }

  fromDto(raw: unknown, current: InstrumentState): InstrumentState {
    const data = asRecord(raw);
    if (
      !data ||
      (data.version !== 1 && data.version !== 2 && data.version !== 3)
    ) {
      throw new Error('Sesión inválida');
    }

    const version = data.version as 1 | 2 | 3;
    const scene =
      typeof data.scene === 'string' ? data.scene : current.scene;
    const params = readParams(data.params, this.generative.defaultParams);
    const root =
      typeof data.root === 'number' &&
      Number.isInteger(data.root) &&
      data.root >= 0 &&
      data.root < this.generative.roots.length
        ? data.root
        : current.harmony.root;
    const scale = isScaleId(data.scale, this.generative) ? data.scale : current.harmony.scale;
    const progression = isProgressionId(data.progression, this.generative)
      ? data.progression
      : current.harmony.progression;
    const sustain = clamp(numberOr(data.sustain, current.harmony.sustain), 0, 1);
    const automation = readAutomation(data.automation, current);
    const modulation = readModulation(data.modulation, current.modulation);
    const pulses = readPulses(data.pulses, current.pattern.pulses);
    const frozen = readFrozen(data.frozen, current.pattern.frozen);
    const locks = readLocks(data.locks, current.pattern.locks);
    const velocity = readStepValues(
      data.velocity,
      current.pattern.velocity,
      1,
      0,
      1
    );
    const probability = readStepValues(
      data.probability,
      current.pattern.probability,
      1,
      0,
      1
    );
    const ratchets = readStepValues(
      data.ratchets,
      current.pattern.ratchets,
      1,
      1,
      4,
      true
    );
    const patterns = { ...current.pattern.steps };

    const kit =
      version === 2
        ? readKit(data.kit, current.kit)
        : migrateV1Channels(data.channels, current.kit, patterns);

    if (version === 2) {
      const rawPatterns = asRecord(data.patterns);
      if (rawPatterns) {
        Object.entries(rawPatterns).forEach(([key, value]) => {
          if (isValidPattern(value)) patterns[key] = toPattern(value);
        });
      }
    }

    const patternState = alignPatternToKit(
      { steps: patterns, pulses, frozen, locks, velocity, probability, ratchets },
      kit
    );
    const selected =
      typeof data.selected === 'string' && patternState.steps[data.selected] !== undefined
        ? data.selected
        : Object.keys(patternState.steps)[0] ?? 'kick';

    const base: InstrumentState = {
      ...current,
      scene,
      seed: numberOr(data.seed, current.seed),
      params,
      harmony: { root, scale, progression, sustain },
      pattern: {
        steps: patternState.steps,
        pulses: patternState.pulses,
        frozen: patternState.frozen,
        locks: patternState.locks,
        velocity: patternState.velocity,
        probability: patternState.probability,
        ratchets: patternState.ratchets
      },
      automation,
      modulation,
      selected,
      transport: {
        ...current.transport,
        bpm: clamp(numberOr(data.bpm, current.transport.bpm), 40, 240),
        swing: clamp(numberOr(data.swing, current.transport.swing), 0, 1),
        humanize: clamp(numberOr(data.humanize, current.transport.humanize), 0, 1),
        lookAhead: clamp(
          numberOr(data.lookAhead, current.transport.lookAhead),
          0,
          0.5
        )
      },
      kit,
      masterVolume: clamp(numberOr(data.master, current.masterVolume), -60, 0),
      history: [],
      clipboard: null,
      mutationCount: numberOr(data.mutationCount, 0),
      evolveCount: numberOr(data.evolveCount, 0),
      evolve: typeof data.evolve === 'boolean' ? data.evolve : current.evolve
    };

    const parsedScenes = readScenes(
      data.scenes,
      current.scenes,
      this.generative,
      version
    );
    const resolvedScene = parsedScenes[scene]
      ? scene
      : (Object.keys(parsedScenes)[0] ?? current.scene);
    const withScenes = {
      ...base,
      scene: resolvedScene,
      scenes: parsedScenes
    };
    const clips = readClips(data.clips, withScenes.scenes);
    const activeClips = readActiveClips(
      data.activeClips,
      clips,
      withScenes.scene
    );
    return {
      ...withScenes,
      scenes: {
        ...withScenes.scenes,
        [withScenes.scene]: captureScene(withScenes)
      },
      clips,
      activeClips,
      clipQuantize: readClipQuantize(data.clipQuantize),
      favorites: readSoundIds(data.favorites),
      recentSounds: readSoundIds(data.recentSounds).slice(0, 8),
      arrangement: readArrangement(
        data.arrangement,
        current.arrangement,
        withScenes.scenes
      )
    };
  }
}

function toKitDto(kit: KitState): SessionKitDto {
  const tracks: Record<string, SessionTrackDto> = {};
  Object.values(kit.tracks).forEach(track => {
    tracks[track.id] = {
      id: track.id,
      name: track.name,
      role: track.role,
      hasPattern: track.hasPattern,
      machineId: track.machineId,
      machine: track.machine,
      noteSource: track.noteSource,
      macros: [...track.macros],
      gainDb: track.gainDb,
      pan: track.pan,
      muted: track.muted,
      solo: track.solo,
      inserts: track.inserts.map(insert => ({
        ...insert,
        params: { ...insert.params }
      })),
      sends: track.sends.map(send => ({ ...send })),
      ...(track.outputBusId ? { outputBusId: track.outputBusId } : {})
    };
  });
  return {
    id: kit.id,
    name: kit.name,
    tracks,
    ...(kit.sidechain ? { sidechain: { ...kit.sidechain } } : {}),
    buses: kit.buses.map(bus => ({
      id: bus.id,
      name: bus.name,
      returnDb: bus.returnDb,
      inserts: bus.inserts.map(insert => ({
        ...insert,
        params: { ...insert.params }
      })),
      sends: bus.sends.map(send => ({ ...send }))
    }))
  };
}

function toPatternDto(pattern: PatternState): SessionPatternDto {
  return {
    steps: Object.fromEntries(
      Object.entries(pattern.steps).map(([key, steps]) => [key, [...steps]])
    ),
    pulses: { ...pattern.pulses },
    frozen: { ...pattern.frozen },
    locks: toLocksDto(pattern)
  };
}

function toLocksDto(pattern: PatternState): SessionPatternDto['locks'] {
  return Object.fromEntries(
    Object.entries(pattern.locks).map(([key, steps]) => [
      key,
      steps.map(locks => locks.map(lock => ({ ...lock })))
    ])
  );
}

function cloneValuesDto(
  values: Record<string, StepValues>
): Record<string, readonly number[]> {
  return Object.fromEntries(
    Object.entries(values).map(([key, steps]) => [key, [...steps]])
  );
}

function toSceneDto(snapshot: SceneSnapshot): SessionSceneDto {
  return {
    id: snapshot.id,
    name: snapshot.name,
    kit: toKitDto(snapshot.kit),
    pattern: toPatternDto(snapshot.pattern),
    harmony: { ...snapshot.harmony },
    seed: snapshot.seed,
    params: { ...snapshot.params },
    masterVolume: snapshot.masterVolume
  };
}

function readScenes(
  raw: unknown,
  fallback: SceneCollection,
  generative: GenerativePort,
  version: 1 | 2 | 3
): SceneCollection {
  const data = asRecord(raw);
  if (!data) return fallback;

  const template = Object.values(fallback)[0];
  const parsed: Record<string, SceneSnapshot> = {};
  Object.entries(data).forEach(([id, value]) => {
    if (version < 3) {
      if (!isSceneId(id, generative)) return;
    } else if (!isSceneKey(id)) {
      return;
    }
    const sceneData = asRecord(value);
    const previous = fallback[id] ?? template;
    if (!sceneData || !previous) return;

    const root =
      typeof sceneData.root === 'number' &&
      Number.isInteger(sceneData.root) &&
      sceneData.root >= 0 &&
      sceneData.root < generative.roots.length
        ? sceneData.root
        : previous.harmony.root;
    const scale = isScaleId(sceneData.scale, generative)
      ? sceneData.scale
      : previous.harmony.scale;
    const progression = isProgressionId(sceneData.progression, generative)
      ? sceneData.progression
      : previous.harmony.progression;

    const sceneKit = readKit(sceneData.kit, previous.kit);
    const scenePattern = alignPatternToKit(
      readPatternState(sceneData.pattern, previous.pattern),
      sceneKit
    );

    parsed[id] = {
      id,
      name: typeof sceneData.name === 'string' ? sceneData.name : previous.name,
      kit: sceneKit,
      pattern: scenePattern,
      harmony: {
        root,
        scale,
        progression,
        sustain: clamp(numberOr(sceneData.sustain, previous.harmony.sustain), 0, 1)
      },
      seed: numberOr(sceneData.seed, previous.seed),
      params: readParams(sceneData.params, previous.params),
      masterVolume: clamp(
        numberOr(sceneData.masterVolume, previous.masterVolume),
        -60,
        0
      )
    };
  });

  if (version < 3) return { ...fallback, ...parsed };
  const ordered = Object.keys(parsed);
  return ordered.length > 0
    ? (Object.fromEntries(ordered.map(id => [id, parsed[id]!])) as SceneCollection)
    : fallback;
}

function isSceneKey(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/i.test(value);
}

function readPatternState(raw: unknown, fallback: PatternState): PatternState {
  const data = asRecord(raw);
  if (!data) return fallback;

  const steps: PatternSteps = { ...fallback.steps };
  const rawSteps = asRecord(data.steps);
  if (rawSteps) {
    const keys = new Set([...Object.keys(fallback.steps), ...Object.keys(rawSteps)]);
    keys.forEach(key => {
      if (isValidPattern(rawSteps[key])) steps[key] = toPattern(rawSteps[key]);
    });
  }

  return {
    steps,
    pulses: readPulses(data.pulses, fallback.pulses),
    frozen: readFrozen(data.frozen, fallback.frozen),
    locks: readLocks(data.locks, fallback.locks),
    velocity: readStepValues(data.velocity, fallback.velocity, 1, 0, 1),
    probability: readStepValues(data.probability, fallback.probability, 1, 0, 1),
    ratchets: readStepValues(data.ratchets, fallback.ratchets, 1, 1, 4, true)
  };
}

function readKit(raw: unknown, current: KitState): KitState {
  const data = asRecord(raw);
  if (!data) return cloneKit(current);

  const tracksData = asRecord(data.tracks);
  if (!tracksData) return cloneKit(current);

  const tracks: Record<string, TrackState> = {};
  Object.entries(tracksData).forEach(([id, value]) => {
    const trackData = asRecord(value);
    if (!trackData) return;
    const currentTrack =
      current.tracks[id] ??
      Object.values(current.tracks).find(track => track.role === trackData.role);
    const machine = readMachine(trackData.machine) ?? currentTrack?.machine;
    if (!machine) return;

    const role: TrackRole =
      typeof trackData.role === 'string' &&
      (isChannelKey(trackData.role) || trackData.role === 'user')
        ? (trackData.role as TrackRole)
        : (currentTrack?.role ?? 'user');

    const hasPattern =
      typeof trackData.hasPattern === 'boolean'
        ? trackData.hasPattern
        : currentTrack?.hasPattern ??
          (isChannelKey(role)
            ? PATTERN_CHANNELS.includes(role as PatternChannel)
            : role === 'user');

    const machineId =
      typeof trackData.machineId === 'string'
        ? trackData.machineId
        : currentTrack?.machineId ??
          (role === 'user' ? 'sampler' : `core-${role}`);
    const noteSource = readNoteSource(
      trackData.noteSource,
      currentTrack?.noteSource ?? { kind: 'fixed', note: 'C4' }
    );
    const macros = readMacros(trackData.macros, currentTrack?.macros ?? [0.5, 0.5]);

    tracks[id] = {
      id,
      name: typeof trackData.name === 'string' ? trackData.name : id,
      role,
      hasPattern,
      machineId,
      machine,
      noteSource,
      macros,
      gainDb: clamp(numberOr(trackData.gainDb, currentTrack?.gainDb ?? 0), -60, 6),
      pan: clamp(numberOr(trackData.pan, currentTrack?.pan ?? 0), -1, 1),
      muted:
        typeof trackData.muted === 'boolean'
          ? trackData.muted
          : (currentTrack?.muted ?? false),
      solo:
        typeof trackData.solo === 'boolean'
          ? trackData.solo
          : (currentTrack?.solo ?? false),
      ...(typeof trackData.outputBusId === 'string'
        ? { outputBusId: trackData.outputBusId }
        : currentTrack?.outputBusId
          ? { outputBusId: currentTrack.outputBusId }
          : {}),
      inserts: readInserts(trackData.inserts) ?? currentTrack?.inserts ?? [],
      sends: readSends(trackData.sends) ?? currentTrack?.sends ?? []
    };
  });

  if (Object.keys(tracks).length === 0) return cloneKit(current);

  return {
    id: typeof data.id === 'string' ? data.id : current.id,
    name: typeof data.name === 'string' ? data.name : current.name,
    tracks,
    buses: readBuses(data.buses, current.buses),
    ...(readSidechain(data.sidechain, current.sidechain)
      ? { sidechain: readSidechain(data.sidechain, current.sidechain) }
      : {})
  };
}

function readSidechain(
  raw: unknown,
  fallback: SidechainConfig | undefined
): SidechainConfig | undefined {
  const data = asRecord(raw);
  if (!data) return fallback;
  if (
    typeof data.sourceTrackId !== 'string' ||
    typeof data.targetTrackId !== 'string'
  ) {
    return fallback;
  }
  return {
    enabled: data.enabled !== false,
    sourceTrackId: data.sourceTrackId,
    targetTrackId: data.targetTrackId,
    depthDb: clamp(numberOr(data.depthDb, fallback?.depthDb ?? 4), 0, 24),
    attack: clamp(numberOr(data.attack, fallback?.attack ?? 0.006), 0, 2),
    release: clamp(numberOr(data.release, fallback?.release ?? 0.16), 0, 4)
  };
}

function readNoteSource(raw: unknown, fallback: NoteSource): NoteSource {
  const data = asRecord(raw);
  if (!data) return fallback;

  if (data.kind === 'fixed' && typeof data.note === 'string') {
    return { kind: 'fixed', note: data.note };
  }
  if (data.kind === 'scale-degree') {
    return {
      kind: 'scale-degree',
      degree: Math.round(numberOr(data.degree, 0)),
      octave: clamp(Math.round(numberOr(data.octave, 4)), -2, 8)
    };
  }
  if (data.kind === 'chord') {
    return {
      kind: 'chord',
      degreeOffset: Math.round(numberOr(data.degreeOffset, 0)),
      octave: clamp(Math.round(numberOr(data.octave, 3)), -2, 8),
      size: clamp(Math.round(numberOr(data.size, 4)), 1, 8)
    };
  }

  return fallback;
}

function readMacros(raw: unknown, fallback: readonly number[]): readonly number[] {
  if (!Array.isArray(raw)) return fallback;
  return [0, 1].map(index =>
    clamp(numberOr(raw[index], fallback[index] ?? 0.5), 0, 1)
  );
}

function readBuses(
  raw: unknown,
  fallback: readonly BusState[]
): readonly BusState[] {
  if (!Array.isArray(raw)) {
    return fallback.map(bus => ({
      ...bus,
      inserts: bus.inserts.map(insert => ({
        ...insert,
        params: { ...insert.params }
      })),
      sends: bus.sends.map(send => ({ ...send }))
    }));
  }

  const buses: BusState[] = [];
  raw.forEach(value => {
    const data = asRecord(value);
    if (!data || typeof data.id !== 'string') return;
    buses.push({
      id: data.id,
      name: typeof data.name === 'string' ? data.name : data.id,
      returnDb: clamp(numberOr(data.returnDb, -14), -60, 6),
      inserts: readInserts(data.inserts) ?? [],
      sends: readSends(data.sends) ?? []
    });
  });

  return buses.length > 0 ? buses : fallback;
}

function migrateV1Channels(
  raw: unknown,
  current: KitState,
  patterns: PatternSteps
): KitState {
  const kit = cloneKit(current);
  const tracks = { ...kit.tracks };
  const channels = asRecord(raw);
  if (!channels) return kit;

  Object.entries(channels).forEach(([key, value]) => {
    if (!isChannelKey(key)) return;
    const config = asRecord(value);
    if (!config) return;
    const track = tracks[key] ?? Object.values(tracks).find(entry => entry.role === key);
    if (!track) return;

    let next: TrackState = track;
    if (typeof config.volume === 'number') {
      next = { ...next, gainDb: clamp(config.volume, -60, 6) };
    }
    if (typeof config.muted === 'boolean') {
      next = { ...next, muted: config.muted };
    }
    if (typeof config.solo === 'boolean') {
      next = { ...next, solo: config.solo };
    }

    const delay = findInsertByPlugin(next.inserts, 'delay');
    if (delay) {
      const params = { ...delay.params };
      if (typeof config.delay === 'number') params.wet = clamp(config.delay, 0, 1);
      if (typeof config.delayFeedback === 'number') {
        params.feedback = clamp(config.delayFeedback, 0, 1);
      }
      if (typeof config.delayTime === 'number') {
        params.time = clamp(config.delayTime, 0.01, 2);
      }
      next = {
        ...next,
        inserts: next.inserts.map(insert =>
          insert.id === delay.id ? { ...insert, params } : insert
        )
      };
    }

    const reverb = findInsertByPlugin(next.inserts, 'reverb');
    if (reverb) {
      const params = { ...reverb.params };
      if (typeof config.reverb === 'number') params.wet = clamp(config.reverb, 0, 1);
      if (typeof config.reverbDecay === 'number') {
        params.decay = clamp(config.reverbDecay, 0.1, 10);
      }
      next = {
        ...next,
        inserts: next.inserts.map(insert =>
          insert.id === reverb.id ? { ...insert, params } : insert
        )
      };
    }

    if (isPatternChannel(key) && isValidPattern(config.pattern)) {
      patterns[key] = toPattern(config.pattern);
    }

    tracks[next.id] = next;
  });

  return { ...kit, tracks };
}

function readMachine(raw: unknown): MachineConfig | null {
  const data = asRecord(raw);
  if (!data) return null;
  const kind = data.kind;
  if (
    kind !== 'membrane' &&
    kind !== 'poly' &&
    kind !== 'mono' &&
    kind !== 'pluck' &&
    kind !== 'sampler' &&
    kind !== 'plugin'
  ) {
    return null;
  }

  const filter = asRecord(data.filter);
  const pluck = asRecord(data.pluck);
  const pluginParams = asRecord(data.params);
  const machine: MachineConfig = {
    kind,
    ...(typeof data.pluginId === 'string' ? { pluginId: data.pluginId } : {}),
    ...(pluginParams
      ? {
          params: Object.fromEntries(
            Object.entries(pluginParams)
              .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
              .map(([key, value]) => [key, value as number])
          )
        }
      : {}),
    ...(typeof data.oscillator === 'string'
      ? { oscillator: data.oscillator as MachineConfig['oscillator'] }
      : {}),
    ...(Array.isArray(data.samples)
      ? { samples: data.samples.filter((sample): sample is string => typeof sample === 'string') }
      : {}),
    ...(typeof data.voices === 'number' ? { voices: Math.max(1, Math.round(data.voices)) } : {}),
    ...(typeof data.maxPolyphony === 'number'
      ? { maxPolyphony: Math.max(1, Math.round(data.maxPolyphony)) }
      : {}),
    ...(typeof data.fadeIn === 'number' ? { fadeIn: Math.max(0, data.fadeIn) } : {}),
    ...(typeof data.fadeOut === 'number' ? { fadeOut: Math.max(0, data.fadeOut) } : {}),
    ...(readEnvelope(data.envelope) ? { envelope: readEnvelope(data.envelope)! } : {}),
    ...(filter
      ? {
          filter: {
            frequency: clamp(numberOr(filter.frequency, 800), 20, 20000),
            q: clamp(numberOr(filter.q, 1), 0.1, 20)
          }
        }
      : {}),
    ...(pluck
      ? {
          pluck: {
            attackNoise: clamp(numberOr(pluck.attackNoise, 1.2), 0.1, 20),
            dampening: clamp(numberOr(pluck.dampening, 4000), 0, 7000),
            resonance: clamp(numberOr(pluck.resonance, 0.9), 0, 1),
            release: clamp(numberOr(pluck.release, 1.1), 0.01, 5)
          }
        }
      : {})
  };
  return machine;
}

function readEnvelope(raw: unknown): MachineConfig['envelope'] | null {
  const data = asRecord(raw);
  if (!data) return null;
  const attack = numberOr(data.attack, 0);
  const decay = numberOr(data.decay, 0);
  const sustain = numberOr(data.sustain, 0);
  const release = numberOr(data.release, 0);
  return { attack, decay, sustain, release };
}

function readInserts(raw: unknown): readonly InsertConfig[] | null {
  if (!Array.isArray(raw)) return null;

  const inserts: InsertConfig[] = [];
  raw.forEach(entry => {
    const data = asRecord(entry);
    if (!data) return;
    const id = typeof data.id === 'string' ? data.id : null;
    const pluginId = typeof data.pluginId === 'string' ? data.pluginId : null;
    const params = asRecord(data.params);
    if (!id || !pluginId || !params) return;

    const values: Record<string, number> = {};
    Object.entries(params).forEach(([param, value]) => {
      if (typeof value === 'number' && Number.isFinite(value)) values[param] = value;
    });

    inserts.push({
      id,
      pluginId,
      bypass: data.bypass === true,
      params: values,
      ...(typeof data.latencySamples === 'number'
        ? { latencySamples: Math.max(0, data.latencySamples) }
        : {})
    });
  });

  return inserts;
}

function readSends(raw: unknown): readonly SendConfig[] | null {
  if (!Array.isArray(raw)) return null;
  const sends: SendConfig[] = [];
  raw.forEach(entry => {
    const data = asRecord(entry);
    if (!data || typeof data.busId !== 'string') return;
    sends.push({
      busId: data.busId,
      amount: clamp(numberOr(data.amount, 0), 0, 1),
      preFader: data.preFader === true
    });
  });
  return sends;
}

function readParams(raw: unknown, defaults: GenerativeParams): GenerativeParams {
  const data = asRecord(raw);
  const value = (key: keyof GenerativeParams): number =>
    clamp(numberOr(data?.[key], defaults[key]), 0, 1);

  return {
    density: value('density'),
    complexity: value('complexity'),
    variation: value('variation'),
    stability: value('stability'),
    randomness: value('randomness')
  };
}

function readAutomation(raw: unknown, current: InstrumentState) {
  const data = asRecord(raw);
  if (!data) return current.automation;

  const target =
    typeof data.target === 'string' &&
    Object.prototype.hasOwnProperty.call(AUTOMATION_TARGETS, data.target)
      ? (data.target as AutomationTargetId)
      : current.automation.target;
  const values =
    Array.isArray(data.values) && data.values.length === 16
      ? data.values.map(value => clamp(numberOr(value, 0), 0, 1))
      : current.automation.values;

  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : current.automation.enabled,
    target,
    values
  };
}

function readModulation(raw: unknown, current: ModulationState): ModulationState {
  const data = asRecord(raw);
  if (!data) return current;

  const sources = readModulationSources(data.sources, current.sources);
  const sourceIds = new Set(sources.map(source => source.id));
  const routes = readModulationRoutes(data.routes, sourceIds);

  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : current.enabled,
    sources,
    routes
  };
}

function readModulationSources(
  raw: unknown,
  fallback: readonly ModulationSource[]
): readonly ModulationSource[] {
  if (!Array.isArray(raw)) return fallback;

  const sources: ModulationSource[] = [];
  const ids = new Set<string>();
  raw.forEach(value => {
    const data = asRecord(value);
    if (!data || typeof data.id !== 'string' || ids.has(data.id)) return;
    const kind = data.kind;
    if (kind !== 'lfo' && kind !== 'macro' && kind !== 'step') return;
    ids.add(data.id);

    const shape = readLfoShape(data.shape);
    sources.push({
      id: data.id,
      kind,
      name: typeof data.name === 'string' ? data.name : data.id,
      ...(kind === 'lfo'
        ? { shape: shape ?? 'sine', rate: clamp(numberOr(data.rate, 0.25), 0.01, 20) }
        : {}),
      ...(kind === 'macro' ? { value: clamp(numberOr(data.value, 0.5), 0, 1) } : {})
    });
  });

  return sources.length > 0 ? sources : fallback;
}

function readModulationRoutes(
  raw: unknown,
  sourceIds: ReadonlySet<string>
): readonly ModulationRoute[] {
  if (!Array.isArray(raw)) return [];

  const routes: ModulationRoute[] = [];
  const ids = new Set<string>();
  raw.forEach(value => {
    const data = asRecord(value);
    if (!data || typeof data.id !== 'string' || ids.has(data.id)) return;
    if (typeof data.sourceId !== 'string' || !sourceIds.has(data.sourceId)) return;

    const target = asRecord(data.target);
    if (
      !target ||
      typeof target.trackId !== 'string' ||
      typeof target.insertId !== 'string' ||
      typeof target.paramId !== 'string'
    ) {
      return;
    }

    ids.add(data.id);
    routes.push({
      id: data.id,
      sourceId: data.sourceId,
      target: {
        trackId: target.trackId,
        insertId: target.insertId,
        paramId: target.paramId
      },
      amount: clamp(numberOr(data.amount, 0), -1, 1),
      bipolar: data.bipolar === true
    });
  });

  return routes;
}

function readLfoShape(value: unknown): LfoShape | null {
  return value === 'sine' ||
    value === 'triangle' ||
    value === 'square' ||
    value === 'saw'
    ? value
    : null;
}

function readPulses(
  raw: unknown,
  current: PatternState['pulses']
): PatternState['pulses'] {
  const data = asRecord(raw);
  const next = { ...current };
  if (!data) return next;
  const keys = new Set([...Object.keys(current), ...Object.keys(data)]);
  keys.forEach(key => {
    next[key] = clamp(Math.round(numberOr(data[key], current[key] ?? 4)), 1, 16);
  });
  return next;
}

function readFrozen(
  raw: unknown,
  current: PatternState['frozen']
): PatternState['frozen'] {
  const data = asRecord(raw);
  const next = { ...current };
  if (!data) return next;
  const keys = new Set([...Object.keys(current), ...Object.keys(data)]);
  keys.forEach(key => {
    if (typeof data[key] === 'boolean') next[key] = data[key];
  });
  return next;
}

function readLocks(
  raw: unknown,
  fallback: PatternLocks
): PatternLocks {
  const data = asRecord(raw);
  const next = cloneLocks(fallback);
  if (!data) return next;

  Object.entries(data).forEach(([trackId, value]) => {
    if (!Array.isArray(value)) return;
    const steps: ParamLock[][] = Array.from(
      { length: PATTERN_LENGTH },
      () => []
    );
    value.forEach((stepValue, index) => {
      if (index >= PATTERN_LENGTH || !Array.isArray(stepValue)) return;
      steps[index] = stepValue
        .map(readLock)
        .filter((lock): lock is ParamLock => lock !== null);
    });
    next[trackId] = steps;
  });

  return next;
}

function readLock(value: unknown): ParamLock | null {
  const data = asRecord(value);
  if (!data || typeof data.value !== 'number' || !Number.isFinite(data.value)) {
    return null;
  }
  if (data.kind === 'track') {
    if (data.paramId === 'gain' || data.paramId === 'pan') {
      return { kind: 'track', paramId: data.paramId, value: data.value };
    }
    return null;
  }
  if (typeof data.insertId !== 'string' || typeof data.paramId !== 'string') {
    return null;
  }
  return {
    insertId: data.insertId,
    paramId: data.paramId,
    value: data.value
  };
}

function cloneLocks(locks: PatternLocks): PatternLocks {
  return Object.fromEntries(
    Object.entries(locks).map(([key, steps]) => [
      key,
      steps.map(step => step.map(lock => ({ ...lock })))
    ])
  );
}

function readStepValues(
  raw: unknown,
  fallback: Record<string, StepValues>,
  defaultValue: number,
  min: number,
  max: number,
  integer = false
): Record<string, StepValues> {
  const data = asRecord(raw);
  const next: Record<string, StepValues> = Object.fromEntries(
    Object.entries(fallback).map(([key, steps]) => [key, [...steps]])
  );
  if (!data) return next;

  const keys = new Set([...Object.keys(fallback), ...Object.keys(data)]);
  keys.forEach(key => {
    const values = data[key];
    if (!Array.isArray(values)) return;
    const steps = Array.from({ length: PATTERN_LENGTH }, (_, index) => {
      const rawValue = values[index];
      const value =
        typeof rawValue === 'number' && Number.isFinite(rawValue)
          ? rawValue
          : defaultValue;
      const clamped = clamp(value, min, max);
      return integer ? Math.round(clamped) : clamped;
    });
    next[key] = steps;
  });
  return next;
}

function emptyPattern(): Pattern {
  return Array.from({ length: 16 }, () => 0 as const);
}

function alignPatternToKit(pattern: PatternState, kit: KitState): PatternState {
  const ids = new Set(
    kitTracks(kit)
      .filter(track => track.hasPattern)
      .map(track => track.id)
  );
  const steps: PatternSteps = {};
  const pulses: Record<string, number> = {};
  const frozen: Record<string, boolean> = {};
  const locks: PatternLocks = {};
  const velocity: Record<string, StepValues> = {};
  const probability: Record<string, StepValues> = {};
  const ratchets: Record<string, StepValues> = {};
  ids.forEach(id => {
    steps[id] = pattern.steps[id] ?? emptyPattern();
    pulses[id] = pattern.pulses[id] ?? 4;
    frozen[id] = pattern.frozen[id] ?? false;
    locks[id] = pattern.locks[id] ?? emptyTrackLocks();
    velocity[id] = pattern.velocity[id] ?? emptyStepValues(1);
    probability[id] = pattern.probability[id] ?? emptyStepValues(1);
    ratchets[id] = pattern.ratchets[id] ?? emptyStepValues(1);
  });
  return { steps, pulses, frozen, locks, velocity, probability, ratchets };
}

function toClipsDto(clips: ClipCollection): Record<string, SessionClipDto> {
  return Object.fromEntries(
    Object.entries(clips).map(([id, clip]) => [id, { ...clip }])
  );
}

function readClips(raw: unknown, scenes: SceneCollection): ClipCollection {
  const derived = createClipsFromScenes(scenes);
  const data = asRecord(raw);
  if (!data) return derived;

  const clips: Record<string, ClipState> = { ...derived };
  Object.entries(data).forEach(([id, value]) => {
    const record = asRecord(value);
    if (!record) return;
    const rawSceneId = record.sceneId;
    const sceneId =
      typeof rawSceneId === 'string' && isSceneKey(rawSceneId)
        ? rawSceneId
        : null;
    const trackId = typeof record.trackId === 'string' ? record.trackId : null;
    if (!sceneId || !trackId) return;
    const scene = scenes[sceneId];
    const track = scene?.kit.tracks[trackId];
    if (!scene || !track?.hasPattern) return;

    const existing = clips[id];
    clips[id] = {
      id,
      trackId,
      sceneId,
      name:
        typeof record.name === 'string'
          ? record.name
          : (existing?.name ?? track.name),
      color:
        typeof record.color === 'string'
          ? record.color
          : (existing?.color ?? clipColorForScene(sceneId)),
      followAction: isClipFollowAction(record.followAction)
        ? record.followAction
        : (existing?.followAction ?? 'none'),
      followAfter:
        typeof record.followAfter === 'number'
          ? clamp(record.followAfter, 0, 16)
          : (existing?.followAfter ?? 0),
      pattern: readClipPattern(
        record.pattern,
        existing?.pattern ??
          trackPatternData(scene.pattern, trackId) ??
          emptyClipPattern()
      )
    };
  });
  return clips;
}

function readArrangement(
  raw: unknown,
  fallback: ArrangementState,
  scenes: SceneCollection
): ArrangementState {
  const data = asRecord(raw);
  if (!data || !Array.isArray(data.blocks)) return fallback;
  const rawBlocks = data.blocks;
  const blocks = rawBlocks.flatMap(value => {
    const record = asRecord(value);
    if (!record || !isClipSceneId(record.sceneId)) return [];
    if (!scenes[record.sceneId]) return [];
    const id = typeof record.id === 'string' ? record.id : null;
    if (!id) return [];
    return [
      {
        id,
        sceneId: record.sceneId,
        bars: clamp(numberOr(record.bars, 4), 1, 64)
      }
    ];
  });
  const blockIndex = Math.round(
    clamp(numberOr(data.blockIndex, 0), 0, Math.max(0, blocks.length - 1))
  );
  const bar = Math.round(
    clamp(numberOr(data.bar, 0), 0, Math.max(0, (blocks[blockIndex]?.bars ?? 1) - 1))
  );
  const total = blocks.length;
  const loopStart =
    total === 0
      ? 0
      : Math.round(
          clamp(numberOr(data.loopStart, fallback.loopStart), 0, total - 1)
        );
  const loopEnd =
    total === 0
      ? 0
      : Math.round(
          clamp(
            numberOr(data.loopEnd, fallback.loopEnd),
            loopStart + 1,
            total
          )
        );
  return {
    enabled: typeof data.enabled === 'boolean' ? data.enabled : fallback.enabled,
    recording: false,
    blocks,
    blockIndex,
    bar,
    loop: typeof data.loop === 'boolean' ? data.loop : fallback.loop,
    loopStart,
    loopEnd
  };
}

function readClipPattern(
  raw: unknown,
  fallback: TrackPatternData
): TrackPatternData {
  const data = asRecord(raw);
  if (!data) return fallback;
  const pattern = readPatternState(
    {
      steps: { clip: data.steps },
      pulses: { clip: data.pulses },
      frozen: { clip: data.frozen },
      locks: { clip: data.locks },
      velocity: { clip: data.velocity },
      probability: { clip: data.probability },
      ratchets: { clip: data.ratchets }
    },
    {
      steps: { clip: fallback.steps },
      pulses: { clip: fallback.pulses },
      frozen: { clip: fallback.frozen },
      locks: { clip: fallback.locks },
      velocity: { clip: fallback.velocity },
      probability: { clip: fallback.probability },
      ratchets: { clip: fallback.ratchets }
    }
  );
  return trackPatternData(pattern, 'clip') ?? fallback;
}

function readActiveClips(
  raw: unknown,
  clips: ClipCollection,
  sceneId: SceneId
): ActiveClips {
  const data = asRecord(raw);
  if (!data) return activeClipsForScene(clips, sceneId);

  const active: Record<string, string | null> = {};
  Object.entries(data).forEach(([trackId, value]) => {
    if (value !== null && typeof value !== 'string') return;
    if (typeof value === 'string' && clips[value]?.trackId !== trackId) return;
    active[trackId] = value;
  });
  return Object.keys(active).length > 0
    ? active
    : activeClipsForScene(clips, sceneId);
}

function readClipQuantize(raw: unknown): ClipQuantize {
  return raw === 'immediate' ||
    raw === 'beat' ||
    raw === 'bar' ||
    raw === '2bar'
    ? raw
    : DEFAULT_CLIP_QUANTIZE;
}

function readSoundIds(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  raw.forEach(value => {
    if (typeof value !== 'string' || seen.has(value) || !soundPreset(value)) {
      return;
    }
    seen.add(value);
    ids.push(value);
  });
  return ids;
}

function isClipSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && isSceneKey(value);
}

function isClipFollowAction(value: unknown): value is ClipFollowAction {
  return (
    value === 'none' ||
    value === 'next' ||
    value === 'previous' ||
    value === 'random' ||
    value === 'stop'
  );
}

function isSceneId(value: unknown, generative: GenerativePort): value is SceneId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(generative.scenes, value)
  );
}

function isScaleId(value: unknown, generative: GenerativePort): value is ScaleId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(generative.scales, value)
  );
}

function isProgressionId(value: unknown, generative: GenerativePort): value is ProgressionId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(generative.progressions, value)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
