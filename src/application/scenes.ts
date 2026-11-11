import { cloneKit } from '../domain/kit';
import {
  activeClipsForScene,
  applyTrackPatternData,
  materializeClips,
  materializeScenes
} from '../domain/clip';
import type { InstrumentState, SceneId } from '../domain/models';
import { clonePatternState } from '../domain/pattern';
import type { StatusPort } from '../domain/ports';
import { cloneScene, type SceneSnapshot } from '../domain/scene';
import type { MixService } from './mix';
import type { PlaybackRuntime } from './runtime';
import type { Store } from './store';

export class SceneService {
  constructor(
    private readonly store: Store,
    private readonly mix: MixService,
    private readonly runtime: PlaybackRuntime,
    private readonly status: StatusPort
  ) {}

  apply(sceneId: SceneId): void {
    const state = this.store.getState();
    if (sceneId === state.scene) return;
    const target = state.scenes[sceneId];
    if (!target) return;

    const clips = materializeClips(state);
    const materialized = materializeScenes({ ...state, clips });
    const currentPattern =
      materialized[state.scene]?.pattern ?? state.pattern;
    const currentSnapshot = captureScene({
      ...state,
      scenes: materialized,
      clips,
      pattern: currentPattern
    });
    const nextScene = cloneScene(target);
    const targetPattern = Object.values(clips)
      .filter(clip => clip.sceneId === sceneId)
      .reduce(
        (pattern, clip) =>
          applyTrackPatternData(pattern, clip.trackId, clip.pattern),
        clonePatternState(nextScene.pattern)
      );
    const firstTrack = Object.keys(targetPattern.steps)[0] ?? 'kick';
    const selectedTrack =
      targetPattern.steps[state.selected] !== undefined
        ? state.selected
        : firstTrack;

    const next: InstrumentState = {
      ...state,
      scene: sceneId,
      scenes: { ...materialized, [state.scene]: currentSnapshot },
      kit: nextScene.kit,
      pattern: targetPattern,
      clips,
      harmony: nextScene.harmony,
      seed: nextScene.seed,
      params: nextScene.params,
      masterVolume: nextScene.masterVolume,
      selected: selectedTrack,
      activeClips: activeClipsForScene(clips, sceneId),
      history: [],
      clipboard: null
    };

    this.mix.beginTransition();
    try {
      this.store.update(() => next);
      this.mix.syncAll(next, true);
      this.runtime.resetHarmony();
      this.status.generative(
        `Escena ${nextScene.name} · semilla ${nextScene.seed}.`
      );
    } finally {
      this.mix.endTransition();
    }
  }

  captureCurrent(): void {
    this.store.update(current => ({
      ...current,
      scenes: { ...current.scenes, [current.scene]: captureScene(current) }
    }));
  }
}

export function captureScene(state: InstrumentState): SceneSnapshot {
  const scene = state.scenes[state.scene];
  return {
    id: state.scene,
    name: scene?.name ?? state.scene,
    kit: cloneKit(state.kit),
    pattern: clonePatternState(state.pattern),
    harmony: { ...state.harmony },
    seed: state.seed,
    params: { ...state.params },
    masterVolume: state.masterVolume
  };
}
