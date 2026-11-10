import type { KitState, TrackState } from './kit';
import type { SceneId } from './models';
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

export const CLIP_SCENE_ORDER: readonly SceneId[] = [
  'umbral',
  'deriva',
  'pulso',
  'caos'
];

export const CLIP_COLORS: Readonly<Record<SceneId, string>> = {
  umbral: '#c0816e',
  deriva: '#7a9e9f',
  pulso: '#b98a4a',
  caos: '#8e7cc3'
};

export const DEFAULT_CLIP_QUANTIZE: ClipQuantize = 'bar';

export interface ClipState {
  readonly id: string;
  readonly trackId: string;
  readonly sceneId: SceneId;
  readonly name: string;
  readonly color: string;
  readonly followAction: ClipFollowAction;
  readonly followAfter: number;
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
  CLIP_SCENE_ORDER.forEach(sceneId => {
    const scene = scenes[sceneId];
    if (!scene) return;
    Object.values(scene.kit.tracks)
      .filter(track => track.hasPattern)
      .forEach(track => {
        const clip = createClipForTrack(sceneId, track);
        clips[clip.id] = clip;
      });
  });
  return clips;
}

export function createClipForTrack(
  sceneId: SceneId,
  track: TrackState
): ClipState {
  return {
    id: clipId(sceneId, track.id),
    trackId: track.id,
    sceneId,
    name: track.name,
    color: CLIP_COLORS[sceneId],
    followAction: 'none',
    followAfter: 0
  };
}

export function addClipsForTrack(
  clips: ClipCollection,
  scenes: SceneCollection,
  trackId: string
): ClipCollection {
  const next: Record<string, ClipState> = { ...clips };
  CLIP_SCENE_ORDER.forEach(sceneId => {
    const scene = scenes[sceneId];
    const track = scene?.kit.tracks[trackId];
    if (!scene || !track?.hasPattern) return;
    const clip = createClipForTrack(sceneId, track);
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
  trackId: string
): readonly ClipState[] {
  return Object.values(clips)
    .filter(clip => clip.trackId === trackId)
    .sort(
      (a, b) =>
        CLIP_SCENE_ORDER.indexOf(a.sceneId) -
        CLIP_SCENE_ORDER.indexOf(b.sceneId)
    );
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
    ratchets: pattern.ratchets[trackId] ?? emptyStepValues(1)
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
    ratchets: { ...pattern.ratchets, [trackId]: data.ratchets }
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
