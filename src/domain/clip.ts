import type { KitState, TrackState } from './kit';
import { BUILTIN_SCENE_IDS, type BuiltinSceneId, type SceneId } from './models';
import {
  countSteps,
  emptyStepValues,
  emptyTrackLocks,
  type Pattern,
  type PatternState,
  type StepValues,
  type TrackLocks
} from './pattern';
import type { SceneCollection } from './scene';

export type ClipFollowAction =
  | 'none'
  | 'next'
  | 'previous'
  | 'random'
  | 'stop';

export type ClipQuantize = 'immediate' | 'beat' | 'bar' | '2bar';

export const CLIP_SCENE_ORDER: readonly SceneId[] = BUILTIN_SCENE_IDS;

const CLIP_PALETTE: readonly string[] = [
  '#c0816e',
  '#7a9e9f',
  '#b98a4a',
  '#8e7cc3',
  '#6f8f5f',
  '#a86b8c',
  '#5f8399',
  '#9b7b4f'
];

export const CLIP_COLORS: Readonly<Record<BuiltinSceneId, string>> = {
  umbral: CLIP_PALETTE[0]!,
  deriva: CLIP_PALETTE[1]!,
  pulso: CLIP_PALETTE[2]!,
  caos: CLIP_PALETTE[3]!
};

export function clipColorForScene(sceneId: SceneId, index = -1): string {
  const builtin = CLIP_COLORS[sceneId as BuiltinSceneId];
  if (builtin) return builtin;
  if (index >= 0) return CLIP_PALETTE[index % CLIP_PALETTE.length]!;
  let hash = 0;
  for (let position = 0; position < sceneId.length; position += 1) {
    hash = (hash * 31 + sceneId.charCodeAt(position)) | 0;
  }
  return CLIP_PALETTE[Math.abs(hash) % CLIP_PALETTE.length]!;
}

export function sceneIdList(scenes: object): readonly SceneId[] {
  return Object.keys(scenes);
}

export const DEFAULT_CLIP_QUANTIZE: ClipQuantize = 'bar';

export interface ClipState {
  readonly id: string;
  readonly trackId: string;
  readonly sceneId: SceneId;
  readonly name: string;
  readonly color: string;
  readonly followAction: ClipFollowAction;
  readonly followAfter: number;
  readonly pattern: TrackPatternData;
}

export type ClipCollection = Readonly<Record<string, ClipState>>;
export type ActiveClips = Readonly<Record<string, string | null>>;

export interface TrackPatternData {
  readonly steps: Pattern;
  readonly pulses: number;
  readonly frozen: boolean;
  readonly locks: TrackLocks;
  readonly velocity: StepValues;
  readonly probability: StepValues;
  readonly ratchets: StepValues;
  readonly accents: StepValues;
  readonly slides: StepValues;
}

export interface ClipMaterializeState {
  readonly scenes: SceneCollection;
  readonly pattern: PatternState;
  readonly activeClips: ActiveClips;
  readonly clips: ClipCollection;
}

export function clipId(sceneId: SceneId, trackId: string): string {
  return `clip-${sceneId}-${trackId}`;
}

export function createClipsFromScenes(
  scenes: SceneCollection
): ClipCollection {
  const clips: Record<string, ClipState> = {};
  sceneIdList(scenes).forEach((sceneId, sceneIndex) => {
    const scene = scenes[sceneId];
    if (!scene) return;
    Object.values(scene.kit.tracks)
      .filter(track => track.hasPattern)
      .forEach(track => {
        const pattern = trackPatternData(scene.pattern, track.id);
        if (!pattern) return;
        const clip = createClipForTrack(
          sceneId,
          track,
          pattern,
          clipColorForScene(sceneId, sceneIndex)
        );
        clips[clip.id] = clip;
      });
  });
  return clips;
}

export function createClipForTrack(
  sceneId: SceneId,
  track: TrackState,
  pattern: TrackPatternData,
  color = clipColorForScene(sceneId)
): ClipState {
  return {
    id: clipId(sceneId, track.id),
    trackId: track.id,
    sceneId,
    name: track.name,
    color,
    followAction: 'none',
    followAfter: 0,
    pattern
  };
}

export function addClipsForTrack(
  clips: ClipCollection,
  scenes: SceneCollection,
  trackId: string
): ClipCollection {
  const next: Record<string, ClipState> = { ...clips };
  sceneIdList(scenes).forEach((sceneId, sceneIndex) => {
    const scene = scenes[sceneId];
    const track = scene?.kit.tracks[trackId];
    if (!scene || !track?.hasPattern) return;
    const pattern = trackPatternData(scene.pattern, trackId);
    if (!pattern) return;
    const clip = createClipForTrack(
      sceneId,
      track,
      pattern,
      clipColorForScene(sceneId, sceneIndex)
    );
    if (!next[clip.id]) next[clip.id] = clip;
  });
  return next;
}

export function removeClipsForTrack(
  clips: ClipCollection,
  trackId: string
): ClipCollection {
  return Object.fromEntries(
    Object.entries(clips).filter(([, clip]) => clip.trackId !== trackId)
  );
}

export function withoutActiveTrack(
  activeClips: ActiveClips,
  trackId: string
): ActiveClips {
  return Object.fromEntries(
    Object.entries(activeClips).filter(([id]) => id !== trackId)
  );
}

export function activeClipsForScene(
  clips: ClipCollection,
  sceneId: SceneId
): ActiveClips {
  const active: Record<string, string | null> = {};
  Object.values(clips).forEach(clip => {
    if (clip.sceneId === sceneId) active[clip.trackId] = clip.id;
  });
  return active;
}

export function clipsForTrack(
  clips: ClipCollection,
  trackId: string,
  sceneOrder: readonly SceneId[] = CLIP_SCENE_ORDER
): readonly ClipState[] {
  return Object.values(clips)
    .filter(clip => clip.trackId === trackId)
    .sort(
      (a, b) => sceneIndex(sceneOrder, a.sceneId) - sceneIndex(sceneOrder, b.sceneId)
    );
}

function sceneIndex(order: readonly SceneId[], sceneId: SceneId): number {
  const index = order.indexOf(sceneId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function trackPatternData(
  pattern: PatternState,
  trackId: string
): TrackPatternData | null {
  const steps = pattern.steps[trackId];
  if (!steps) return null;
  return {
    steps,
    pulses: pattern.pulses[trackId] ?? countSteps(steps),
    frozen: pattern.frozen[trackId] ?? false,
    locks: pattern.locks[trackId] ?? emptyTrackLocks(),
    velocity: pattern.velocity[trackId] ?? emptyStepValues(1),
    probability: pattern.probability[trackId] ?? emptyStepValues(1),
    ratchets: pattern.ratchets[trackId] ?? emptyStepValues(1),
    accents: pattern.accents[trackId] ?? emptyStepValues(0),
    slides: pattern.slides[trackId] ?? emptyStepValues(0)
  };
}

export function emptyClipPattern(): TrackPatternData {
  return {
    steps: Array.from({ length: 16 }, () => 0 as const),
    pulses: 4,
    frozen: false,
    locks: emptyTrackLocks(),
    velocity: emptyStepValues(1),
    probability: emptyStepValues(1),
    ratchets: emptyStepValues(1),
    accents: emptyStepValues(0),
    slides: emptyStepValues(0)
  };
}

export function cloneTrackPatternData(
  data: TrackPatternData
): TrackPatternData {
  return {
    steps: [...data.steps],
    pulses: data.pulses,
    frozen: data.frozen,
    locks: data.locks.map(step => step.map(lock => ({ ...lock }))),
    velocity: [...data.velocity],
    probability: [...data.probability],
    ratchets: [...data.ratchets],
    accents: [...data.accents],
    slides: [...data.slides]
  };
}

export function applyTrackPatternData(
  pattern: PatternState,
  trackId: string,
  data: TrackPatternData
): PatternState {
  return {
    steps: { ...pattern.steps, [trackId]: data.steps },
    pulses: { ...pattern.pulses, [trackId]: data.pulses },
    frozen: { ...pattern.frozen, [trackId]: data.frozen },
    locks: { ...pattern.locks, [trackId]: data.locks },
    velocity: { ...pattern.velocity, [trackId]: data.velocity },
    probability: { ...pattern.probability, [trackId]: data.probability },
    ratchets: { ...pattern.ratchets, [trackId]: data.ratchets },
    accents: { ...pattern.accents, [trackId]: data.accents },
    slides: { ...pattern.slides, [trackId]: data.slides }
  };
}

/**
 * Copia el patrón vivo de cada clip activo a su escena de origen.
 * La grilla usa escenas como backing store de los clips: el patrón activo
 * vive en `state.pattern` y se persiste acá antes de guardar/exportar.
 */
export function materializeScenes(
  state: ClipMaterializeState
): SceneCollection {
  const scenes: Record<string, SceneCollection[SceneId]> = {
    ...state.scenes
  };

  Object.entries(state.activeClips).forEach(([trackId, activeId]) => {
    if (!activeId) return;
    const clip = state.clips[activeId];
    if (!clip || clip.trackId !== trackId) return;
    const data = trackPatternData(state.pattern, trackId);
    if (!data) return;
    const scene = scenes[clip.sceneId];
    if (!scene) return;

    scenes[clip.sceneId] = {
      ...scene,
      kit: withTrackHasPattern(scene.kit, trackId, true),
      pattern: applyTrackPatternData(scene.pattern, trackId, data)
    };
  });

  return scenes as SceneCollection;
}

export function withSceneTrackPattern(
  scenes: SceneCollection,
  sceneId: SceneId,
  trackId: string,
  data: TrackPatternData
): SceneCollection {
  const scene = scenes[sceneId];
  if (!scene) return scenes;
  return {
    ...scenes,
    [sceneId]: {
      ...scene,
      kit: withTrackHasPattern(scene.kit, trackId, true),
      pattern: applyTrackPatternData(scene.pattern, trackId, data)
    }
  };
}

/**
 * Copia el patrón vivo de cada clip activo a su propio ClipState.
 * Es la fuente de verdad para persistir clips independientes de las escenas.
 */
export function materializeClips(
  state: ClipMaterializeState
): ClipCollection {
  const clips: Record<string, ClipState> = { ...state.clips };
  Object.entries(state.activeClips).forEach(([trackId, activeId]) => {
    if (!activeId) return;
    const clip = clips[activeId];
    if (!clip || clip.trackId !== trackId) return;
    const data = trackPatternData(state.pattern, trackId);
    if (!data) return;
    clips[activeId] = { ...clip, pattern: data };
  });
  return clips;
}

export function quantizeSteps(quantize: ClipQuantize): number {
  if (quantize === 'immediate') return 0;
  if (quantize === 'beat') return 4;
  if (quantize === 'bar') return 16;
  return 32;
}

export function nextQuantizedStep(
  currentStep: number,
  quantize: ClipQuantize
): number {
  const steps = quantizeSteps(quantize);
  if (steps === 0) return currentStep;
  return Math.floor(currentStep / steps + 1) * steps;
}

function withTrackHasPattern(
  kit: KitState,
  trackId: string,
  hasPattern: boolean
): KitState {
  const track = kit.tracks[trackId];
  if (!track) return kit;
  return {
    ...kit,
    tracks: {
      ...kit.tracks,
      [trackId]: { ...track, hasPattern }
    }
  };
}
