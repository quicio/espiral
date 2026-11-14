import { delayInsert, findInsertByPlugin, reverbInsert } from '../domain/channels';
import { createUserTrack } from '../domain/default-kit';
import type { InsertConfig } from '../domain/graph';
import { canEditTrackSound, cloneKit, kitTracks, type KitState } from '../domain/kit';
import { MACHINE_PRESETS, type NoteSource } from '../domain/machines';
import type {
  GenerativeParams,
  HarmonyState,
  InstrumentState,
  ProgressionId,
  ScaleId,
  SceneId
} from '../domain/models';
import {
  countSteps,
  emptyStepValues,
  emptyTrackLocks,
  toPattern,
  type Pattern,
  type PatternState,
  type PatternSteps
} from '../domain/pattern';
import type { GenerativePort, PresetCodec, PresetConfig } from '../domain/ports';
import type { SceneCollection, SceneSnapshot } from '../domain/scene';

const PARAM_KEYS: readonly (keyof GenerativeParams)[] = [
  'density',
  'complexity',
  'variation',
  'stability',
  'randomness'
];

export class PresetMapper implements PresetCodec {
  constructor(private readonly generative: GenerativePort) {}

  fromDto(raw: unknown, current: InstrumentState): PresetConfig {
    const data = asRecord(raw);
    if (!data) throw new Error('Preset inválido');

    const channels = asRecord(data.channels);
    const topMachines = asRecord(data.machines);
    const topPatterns = asRecord(data.patterns);
    const topAccents = asRecord(data.accents);
    const topSlides = asRecord(data.slides);
    const topHarmony = readHarmony(data.harmony, current.harmony, this.generative);
    const topParams = readParams(data.params, current.params);
    const topSeed = numberOr(data.seed, current.seed);
    const masterVolume = clamp(
      numberOr(data.masterVolume, current.masterVolume),
      -60,
      0
    );
    const bpm = clamp(numberOr(data.bpm, current.transport.bpm), 40, 240);
    const sceneDtos = asRecord(data.scenes);

    const scenes: SceneCollection = { ...current.scenes };
    Object.entries(current.scenes).forEach(([id, snapshot]) => {
      const sceneData = asRecord(sceneDtos?.[id]);
      const withTopMachines = applyMachines(snapshot.kit, topMachines, true);
      const withMachines = applyMachines(
        withTopMachines,
        asRecord(sceneData?.machines),
        false
      );
      // Un preset es un estado musical completo: no hereda mutes ni solos
      // de la sesión anterior. Los canales del preset pueden volver a fijarlos.
      const kit = applyMix(resetMixState(withMachines), channels);
      const pattern = applyPatterns(
        snapshot.pattern,
        kit,
        topPatterns,
        asRecord(sceneData?.patterns),
        topAccents,
        asRecord(sceneData?.accents),
        topSlides,
        asRecord(sceneData?.slides)
      );
      const harmony = readHarmony(
        sceneData?.harmony,
        topHarmony,
        this.generative
      );
      const params = readParams(sceneData?.params, topParams);
      const seed = numberOr(sceneData?.seed, topSeed);

      scenes[id as SceneId] = {
        ...snapshot,
        kit,
        pattern,
        harmony,
        seed,
        params,
        masterVolume
      } satisfies SceneSnapshot;
    });

    const scene = isSceneId(data.scene, this.generative)
      ? data.scene
      : current.scene;
    const selectedScene =
      scenes[scene] ??
      current.scenes[current.scene] ??
      Object.values(scenes)[0];
    if (!selectedScene) throw new Error('Preset sin escena');
    const selected =
      typeof data.selected === 'string' &&
      selectedScene.pattern.steps[data.selected] !== undefined
        ? data.selected
        : Object.keys(selectedScene.pattern.steps)[0] ?? 'kick';

    return {
      bpm,
      masterVolume,
      kit: selectedScene.kit,
      pattern: selectedScene.pattern,
      harmony: selectedScene.harmony,
      seed: selectedScene.seed,
      params: selectedScene.params,
      scenes,
      scene,
      selected
    };
  }
}

function resetMixState(kit: KitState): KitState {
  return {
    ...kit,
    tracks: Object.fromEntries(
      kitTracks(kit).map(track => [
        track.id,
        { ...track, muted: false, solo: false }
      ])
    )
  };
}

function applyMachines(
  kit: KitState,
  machines: Record<string, unknown> | null,
  allowCreate: boolean
): KitState {
  const cloned = cloneKit(kit);
  const tracks = { ...cloned.tracks };

  Object.entries(machines ?? {}).forEach(([trackId, value]) => {
    const override = readMachineOverride(value);
    if (!override) return;
    const preset = MACHINE_PRESETS[override.presetId];
    if (!preset) return;

    const existing = tracks[trackId];
    if (existing) {
      if (!canEditTrackSound(existing)) return;
      tracks[trackId] = {
        ...existing,
        machineId: preset.id,
        machine: preset.machine,
        noteSource: override.noteSource ?? preset.noteSource
      };
      return;
    }

    if (!allowCreate) return;
    const index = trackIndex(trackId);
    if (index === null) return;
    tracks[trackId] = createUserTrack(index, preset.id, preset);
  });

  return { ...cloned, tracks };
}

function readMachineOverride(
  value: unknown
): { presetId: string; noteSource?: NoteSource } | null {
  if (typeof value === 'string') return { presetId: value };
  const data = asRecord(value);
  if (!data) return null;
  const presetId =
    typeof data.preset === 'string'
      ? data.preset
      : typeof data.machine === 'string'
        ? data.machine
        : typeof data.id === 'string'
          ? data.id
          : null;
  if (!presetId) return null;
  const noteSource = readNoteSource(data.noteSource);
  return noteSource ? { presetId, noteSource } : { presetId };
}

function readNoteSource(raw: unknown): NoteSource | null {
  const data = asRecord(raw);
  if (!data) return null;
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
  return null;
}

function trackIndex(trackId: string): number | null {
  const match = /^track-(\d+)$/.exec(trackId);
  return match ? Number(match[1]) : null;
}

function applyMix(
  kit: KitState,
  channels: Record<string, unknown> | null
): KitState {
  const cloned = cloneKit(kit);
  if (!channels) return cloned;

  const tracks = { ...cloned.tracks };
  Object.entries(channels).forEach(([key, value]) => {
    const config = asRecord(value);
    if (!config) return;
    const track =
      tracks[key] ?? Object.values(tracks).find(entry => entry.role === key);
    if (!track) return;

    let next = track;
    if (typeof config.volume === 'number') {
      next = { ...next, gainDb: clamp(config.volume, -60, 6) };
    }
    if (typeof config.pan === 'number') {
      next = { ...next, pan: clamp(config.pan, -1, 1) };
    }
    if (typeof config.muted === 'boolean') {
      next = { ...next, muted: config.muted };
    }
    if (typeof config.solo === 'boolean') {
      next = { ...next, solo: config.solo };
    }

    const effects = asRecord(config.effects);
    if (effects) {
      next = applyEffects(next, effects);
    }

    if (Array.isArray(config.sends)) {
      const sends = config.sends
        .map(readSend)
        .filter(
          (send): send is { busId: string; amount: number; preFader: boolean } =>
            send !== null && cloned.buses.some(bus => bus.id === send.busId)
        );
      next = { ...next, sends };
    }

    tracks[next.id] = next;
  });

  return { ...cloned, tracks };
}

function applyEffects(
  track: KitState['tracks'][string],
  effects: Record<string, unknown>
): KitState['tracks'][string] {
  let inserts = track.inserts;

  const delay = asRecord(effects.delay);
  if (delay) {
    const current = findInsertByPlugin(inserts, 'delay');
    const fallback = current ?? delayInsert(0.3, 0.35, 0.25);
    const params = {
      wet: clamp(numberOr(delay.wet, fallback.params.wet ?? 0.3), 0, 1),
      feedback: clamp(
        numberOr(delay.feedback, fallback.params.feedback ?? 0.35),
        0,
        1
      ),
      time: clamp(
        numberOr(delay.delayTime, fallback.params.time ?? 0.25),
        0.01,
        2
      )
    };
    inserts = upsertInsert(
      inserts,
      current?.id ?? uniqueInsertId(inserts, 'delay'),
      'delay',
      params
    );
  }

  const reverb = asRecord(effects.reverb);
  if (reverb) {
    const current = findInsertByPlugin(inserts, 'reverb');
    const fallback = current ?? reverbInsert(0.5, 4);
    const decay =
      typeof reverb.decay === 'number'
        ? clamp(reverb.decay, 0.1, 10)
        : typeof reverb.roomSize === 'number'
          ? clamp(0.5 + reverb.roomSize * 5.5, 0.1, 10)
          : fallback.params.decay ?? 4;
    const params = {
      wet: clamp(numberOr(reverb.wet, fallback.params.wet ?? 0.5), 0, 1),
      decay
    };
    inserts = upsertInsert(
      inserts,
      current?.id ?? uniqueInsertId(inserts, 'reverb'),
      'reverb',
      params
    );
  }

  return { ...track, inserts };
}

function upsertInsert(
  inserts: readonly InsertConfig[],
  id: string,
  pluginId: string,
  params: Readonly<Record<string, number>>
): readonly InsertConfig[] {
  if (inserts.some(insert => insert.id === id)) {
    return inserts.map(insert =>
      insert.id === id ? { ...insert, params: { ...params } } : insert
    );
  }
  return [
    ...inserts,
    { id, pluginId, bypass: false, params: { ...params } }
  ];
}

function uniqueInsertId(
  inserts: readonly InsertConfig[],
  pluginId: string
): string {
  const ids = new Set(inserts.map(insert => insert.id));
  if (!ids.has(pluginId)) return pluginId;
  let index = 2;
  while (ids.has(`${pluginId}-${index}`)) index += 1;
  return `${pluginId}-${index}`;
}

function readSend(
  value: unknown
): { busId: string; amount: number; preFader: boolean } | null {
  const data = asRecord(value);
  if (!data || typeof data.busId !== 'string') return null;
  return {
    busId: data.busId,
    amount: clamp(numberOr(data.amount, 0), 0, 1),
    preFader: data.preFader === true
  };
}

function applyPatterns(
  base: PatternState,
  kit: KitState,
  topPatterns: Record<string, unknown> | null,
  scenePatterns: Record<string, unknown> | null,
  topAccents: Record<string, unknown> | null,
  sceneAccents: Record<string, unknown> | null,
  topSlides: Record<string, unknown> | null,
  sceneSlides: Record<string, unknown> | null
): PatternState {
  const steps: PatternSteps = {};
  const pulses: Record<string, number> = {};
  const frozen: Record<string, boolean> = {};
  const locks: PatternState['locks'] = {};
  const velocity: PatternState['velocity'] = {};
  const probability: PatternState['probability'] = {};
  const ratchets: PatternState['ratchets'] = {};
  const accents: PatternState['accents'] = {};
  const slides: PatternState['slides'] = {};

  kitTracks(kit)
    .filter(track => track.hasPattern)
    .forEach(track => {
      const override =
        readPattern(scenePatterns?.[track.id]) ??
        readPattern(topPatterns?.[track.id]);

      if (override) {
        steps[track.id] = override;
        pulses[track.id] = clamp(countSteps(override), 1, 16);
        frozen[track.id] = false;
        locks[track.id] = emptyTrackLocks();
        velocity[track.id] = emptyStepValues(1);
        probability[track.id] = emptyStepValues(1);
        ratchets[track.id] = emptyStepValues(1);
        accents[track.id] =
          readStepFlags(sceneAccents?.[track.id]) ??
          readStepFlags(topAccents?.[track.id]) ??
          emptyStepValues(0);
        slides[track.id] =
          readStepFlags(sceneSlides?.[track.id]) ??
          readStepFlags(topSlides?.[track.id]) ??
          emptyStepValues(0);
        return;
      }

      steps[track.id] = base.steps[track.id] ?? emptyPattern();
      pulses[track.id] = base.pulses[track.id] ?? 4;
      frozen[track.id] = base.frozen[track.id] ?? false;
      locks[track.id] = base.locks[track.id] ?? emptyTrackLocks();
      velocity[track.id] = base.velocity[track.id] ?? emptyStepValues(1);
      probability[track.id] = base.probability[track.id] ?? emptyStepValues(1);
      ratchets[track.id] = base.ratchets[track.id] ?? emptyStepValues(1);
      accents[track.id] =
        readStepFlags(sceneAccents?.[track.id]) ??
        readStepFlags(topAccents?.[track.id]) ??
        base.accents[track.id] ??
        emptyStepValues(0);
      slides[track.id] =
        readStepFlags(sceneSlides?.[track.id]) ??
        readStepFlags(topSlides?.[track.id]) ??
        base.slides[track.id] ??
        emptyStepValues(0);
    });

  return { steps, pulses, frozen, locks, velocity, probability, ratchets, accents, slides };
}

function readStepFlags(value: unknown): readonly number[] | null {
  if (typeof value === 'string') {
    return Array.from({ length: 16 }, (_, index) => {
      const char = value[index] ?? '.';
      return char === 'x' || char === 'X' || char === '1' ? 1 : 0;
    });
  }
  if (Array.isArray(value)) {
    return Array.from({ length: 16 }, (_, index) => (value[index] ? 1 : 0));
  }
  return null;
}

function readPattern(value: unknown): Pattern | null {
  if (typeof value === 'string') {
    const chars = value.slice(0, 16).split('');
    while (chars.length < 16) chars.push('.');
    return toPattern(
      chars.map(char => (char === 'x' || char === 'X' || char === '1' ? 1 : 0))
    );
  }

  if (Array.isArray(value)) {
    return toPattern(value.map(entry => (Number(entry) ? 1 : 0)));
  }

  return null;
}

function emptyPattern(): Pattern {
  return Array.from({ length: 16 }, () => 0 as const);
}

function readHarmony(
  raw: unknown,
  fallback: HarmonyState,
  generative: GenerativePort
): HarmonyState {
  const data = asRecord(raw);
  if (!data) return fallback;

  const root =
    typeof data.root === 'number' &&
    Number.isInteger(data.root) &&
    data.root >= 0 &&
    data.root < generative.roots.length
      ? data.root
      : fallback.root;
  const scale =
    typeof data.scale === 'string' &&
    Object.prototype.hasOwnProperty.call(generative.scales, data.scale)
      ? (data.scale as ScaleId)
      : fallback.scale;
  const progression =
    typeof data.progression === 'string' &&
    Object.prototype.hasOwnProperty.call(generative.progressions, data.progression)
      ? (data.progression as ProgressionId)
      : fallback.progression;

  return {
    root,
    scale,
    progression,
    sustain: clamp(numberOr(data.sustain, fallback.sustain), 0, 1)
  };
}

function readParams(
  raw: unknown,
  fallback: GenerativeParams
): GenerativeParams {
  const data = asRecord(raw);
  if (!data) return fallback;
  const next = { ...fallback };
  PARAM_KEYS.forEach(key => {
    if (typeof data[key] === 'number') {
      next[key] = clamp(data[key], 0, 1);
    }
  });
  return next;
}

function isSceneId(value: unknown, generative: GenerativePort): value is SceneId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(generative.scenes, value)
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
