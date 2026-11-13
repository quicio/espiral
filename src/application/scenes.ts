import { cloneKit } from '../domain/kit';
import {
  activeClipsForScene,
  applyTrackPatternData,
  clipColorForScene,
  cloneTrackPatternData,
  createClipForTrack,
  materializeClips,
  materializeScenes,
  sceneIdList
} from '../domain/clip';
import type { InstrumentState, SceneId } from '../domain/models';
import { clonePatternState } from '../domain/pattern';
import type { StatusPort } from '../domain/ports';
import { cloneScene, type SceneCollection, type SceneSnapshot } from '../domain/scene';
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

  addScene(): SceneId | null {
    const state = this.store.getState();
    const clips = materializeClips(state);
    const materialized = materializeScenes({ ...state, clips });
    const source = materialized[state.scene];
    if (!source) return null;

    const sceneIds = sceneIdList(state.scenes);
    const id = nextSceneId(state.scenes);
    const scene = cloneScene({
      ...source,
      id,
      name: `Escena ${id.split('-').at(-1)}`
    });
    const color = clipColorForScene(id, sceneIds.length);
    const copied = Object.values(clips)
      .filter(clip => clip.sceneId === state.scene)
      .flatMap(clip => {
        const track = state.kit.tracks[clip.trackId];
        if (!track?.hasPattern) return [];
        const created = createClipForTrack(
          id,
          track,
          cloneTrackPatternData(clip.pattern),
          color
        );
        return [{ ...created, name: clip.name }];
      });

    this.store.update(current => ({
      ...current,
      scenes: { ...current.scenes, [id]: scene },
      clips: {
        ...current.clips,
        ...Object.fromEntries(copied.map(clip => [clip.id, clip]))
      }
    }));
    this.status.generative(`${scene.name} agregada.`);
    return id;
  }

  moveScene(sceneId: SceneId, offset: number): void {
    const state = this.store.getState();
    const ids = [...sceneIdList(state.scenes)];
    const from = ids.indexOf(sceneId);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= ids.length || offset === 0) return;
    const [moved] = ids.splice(from, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    const scenes = Object.fromEntries(
      ids.map(id => [id, state.scenes[id]!])
    ) as SceneCollection;
    this.store.update(current => ({ ...current, scenes }));
    this.status.generative('Escena movida.');
  }

  removeScene(sceneId: SceneId): void {
    const state = this.store.getState();
    const ids = sceneIdList(state.scenes);
    if (!state.scenes[sceneId]) return;
    if (ids.length <= 1) {
      this.status.generative('Tiene que quedar al menos una escena.');
      return;
    }
    if (sceneId === state.scene) {
      this.status.generative('Cambiá de escena antes de eliminar la actual.');
      return;
    }

    const removedClipIds = new Set(
      Object.values(state.clips)
        .filter(clip => clip.sceneId === sceneId)
        .map(clip => clip.id)
    );
    const scenes = Object.fromEntries(
      ids.filter(id => id !== sceneId).map(id => [id, state.scenes[id]!])
    ) as SceneCollection;
    const clips = Object.fromEntries(
      Object.entries(state.clips).filter(
        ([, clip]) => clip.sceneId !== sceneId
      )
    );
    const activeClips = Object.fromEntries(
      Object.entries(state.activeClips).map(([trackId, activeId]) => [
        trackId,
        activeId && removedClipIds.has(activeId) ? null : activeId
      ])
    );
    removedClipIds.forEach(id => {
      const clip = state.clips[id];
      if (clip) delete this.runtime.clipStartedAt[clip.trackId];
    });
    this.runtime.pendingClipActions = this.runtime.pendingClipActions.filter(
      action => action.kind !== 'clip' || !removedClipIds.has(action.clipId)
    );
    const blocks = state.arrangement.blocks.filter(
      block => block.sceneId !== sceneId
    );
    const blockIndex =
      blocks.length === 0
        ? 0
        : Math.min(state.arrangement.blockIndex, blocks.length - 1);

    this.store.update(current => ({
      ...current,
      scenes,
      clips,
      activeClips,
      arrangement: {
        ...current.arrangement,
        blocks,
        blockIndex,
        bar: 0
      }
    }));
    this.status.generative('Escena eliminada.');
  }

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

function nextSceneId(scenes: SceneCollection): SceneId {
  let index = Object.keys(scenes).length + 1;
  while (scenes[`escena-${index}`]) index += 1;
  return `escena-${index}`;
}
