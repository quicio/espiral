import {
  applyTrackPatternData,
  clipsForTrack,
  CLIP_SCENE_ORDER,
  CLIP_COLORS,
  clipId,
  createClipForTrack,
  emptyClipPattern,
  nextQuantizedStep,
  trackPatternData,
  type ClipFollowAction,
  type ClipQuantize,
  type ClipState
} from '../domain/clip';
import type { InstrumentState, SceneId } from '../domain/models';
import type { StatusPort } from '../domain/ports';
import type { PendingClipAction, PlaybackRuntime } from './runtime';
import type { Store } from './store';

const FOLLOW_BAR_STEPS = 16;

export class ClipService {
  constructor(
    private readonly store: Store,
    private readonly runtime: PlaybackRuntime,
    private readonly status: StatusPort
  ) {}

  setQuantize(quantize: ClipQuantize): void {
    this.store.update(state => ({ ...state, clipQuantize: quantize }));
  }

  setFollowAction(clipId: string, action: ClipFollowAction): void {
    this.updateClip(clipId, clip => ({ ...clip, followAction: action }));
  }

  setFollowAfter(clipId: string, bars: number): void {
    this.updateClip(clipId, clip => ({
      ...clip,
      followAfter: Math.max(0, Math.min(16, Math.round(bars)))
    }));
  }

  createClip(sceneId: SceneId, trackId: string): void {
    const state = this.store.getState();
    const scene = state.scenes[sceneId];
    const track = state.kit.tracks[trackId];
    if (!scene || !track || !track.hasPattern) return;
    const id = clipId(sceneId, trackId);
    if (state.clips[id]) return;

    const pattern =
      trackPatternData(scene.pattern, trackId) ?? emptyClipPattern();
    const clip = createClipForTrack(sceneId, track, pattern);
    this.store.update(current => ({
      ...current,
      clips: { ...current.clips, [clip.id]: clip },
      selected: trackId
    }));
    this.status.generative(`${clip.name} creado.`);
  }

  duplicateClip(sourceId: string): void {
    const state = this.store.getState();
    const source = state.clips[sourceId];
    if (!source) return;
    const emptyScene = CLIP_SCENE_ORDER.find(
      sceneId => !state.clips[clipId(sceneId, source.trackId)]
    );
    if (!emptyScene) {
      this.status.generative('No hay un slot libre para duplicar el clip.');
      return;
    }
    const track = state.kit.tracks[source.trackId];
    const scene = state.scenes[emptyScene];
    if (!track || !scene) return;
    const copy = {
      ...source,
      id: clipId(emptyScene, source.trackId),
      sceneId: emptyScene,
      name: source.name,
      color: CLIP_COLORS[emptyScene] ?? source.color
    };
    this.store.update(current => ({
      ...current,
      clips: { ...current.clips, [copy.id]: copy },
      selected: source.trackId
    }));
    this.status.generative(`${copy.name} duplicado en ${emptyScene}.`);
  }

  renameClip(clipId: string, name: string): void {
    const next = name.trim();
    if (!next) return;
    this.updateClip(clipId, clip => ({ ...clip, name: next }));
  }

  setClipColor(clipId: string, color: string): void {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    this.updateClip(clipId, clip => ({ ...clip, color }));
  }

  removeClip(clipId: string): void {
    const state = this.store.getState();
    const clip = state.clips[clipId];
    if (!clip) return;
    const active = state.activeClips[clip.trackId] === clipId;
    const clips = Object.fromEntries(
      Object.entries(state.clips).filter(([id]) => id !== clipId)
    );
    const activeClips = active
      ? { ...state.activeClips, [clip.trackId]: null }
      : state.activeClips;
    this.store.update(current => ({
      ...current,
      clips,
      activeClips
    }));
    if (active) delete this.runtime.clipStartedAt[clip.trackId];
    this.status.generative(`${clip.name} eliminado.`);
  }

  launchClip(clipId: string, quantize = this.store.getState().clipQuantize): void {
    const clip = this.store.getState().clips[clipId];
    if (!clip) return;
    this.schedule({ kind: 'clip', targetStep: 0, clipId }, quantize);
    this.status.generative(`${clip.name} programado.`);
  }

  launchScene(
    sceneId: SceneId,
    quantize = this.store.getState().clipQuantize
  ): void {
    const state = this.store.getState();
    const clips = Object.values(state.clips).filter(
      clip => clip.sceneId === sceneId
    );
    if (clips.length === 0) return;
    clips.forEach(clip => {
      this.schedule({ kind: 'clip', targetStep: 0, clipId: clip.id }, quantize);
    });
    this.status.generative(`Escena ${sceneId} programada.`);
  }

  stopTrack(trackId: string, quantize = this.store.getState().clipQuantize): void {
    this.schedule({ kind: 'stop-track', targetStep: 0, trackId }, quantize);
    this.status.generative(`${trackId} detenido.`);
  }

  stopAll(quantize = this.store.getState().clipQuantize): void {
    this.schedule({ kind: 'stop-all', targetStep: 0 }, quantize);
    this.status.generative('Clips detenidos.');
  }

  clearPending(): void {
    this.runtime.pendingClipActions = [];
  }

  cancelPending(trackId: string): void {
    const state = this.store.getState();
    this.runtime.pendingClipActions = this.runtime.pendingClipActions.filter(
      action => {
        if (action.kind === 'stop-all') return true;
        const id =
          action.kind === 'clip'
            ? state.clips[action.clipId]?.trackId
            : action.trackId;
        return id !== trackId;
      }
    );
    this.status.generative('Lanzamiento cancelado.');
  }

  applyPending(stepCount: number): void {
    const pending = this.runtime.pendingClipActions;
    if (pending.length === 0) {
      this.applyFollowActions(stepCount);
      return;
    }

    const due = pending.filter(action => action.targetStep <= stepCount);
    this.runtime.pendingClipActions = pending.filter(
      action => action.targetStep > stepCount
    );
    due.forEach(action => this.applyAction(action, stepCount));
    this.applyFollowActions(stepCount);
  }

  private schedule(action: PendingClipAction, quantize: ClipQuantize): void {
    const state = this.store.getState();
    if (!state.transport.playing) {
      this.applyAction(action, this.runtime.absoluteStep);
      return;
    }

    const targetStep = nextQuantizedStep(this.runtime.absoluteStep, quantize);
    const trackId =
      action.kind === 'clip'
        ? state.clips[action.clipId]?.trackId
        : action.kind === 'stop-track'
          ? action.trackId
          : null;

    let pending = this.runtime.pendingClipActions;
    if (action.kind === 'stop-all') {
      pending = [];
    } else if (trackId) {
      pending = pending.filter(existing => {
        if (existing.kind === 'stop-all') return true;
        const existingTrack =
          existing.kind === 'clip'
            ? state.clips[existing.clipId]?.trackId
            : existing.trackId;
        return existingTrack !== trackId;
      });
    }

    this.runtime.pendingClipActions = [
      ...pending,
      { ...action, targetStep } as PendingClipAction
    ];
  }

  private applyAction(action: PendingClipAction, stepCount: number): void {
    if (action.kind === 'stop-all') {
      this.stopTracksNow(
        Object.entries(this.store.getState().activeClips)
          .filter(([, clipId]) => clipId !== null)
          .map(([trackId]) => trackId)
      );
      return;
    }
    if (action.kind === 'stop-track') {
      this.stopTracksNow([action.trackId]);
      return;
    }
    this.launchNow(action.clipId, stepCount);
  }

  private launchNow(clipId: string, stepCount: number): void {
    const state = this.store.getState();
    const clip = state.clips[clipId];
    if (!clip) return;

    const outgoingId = state.activeClips[clip.trackId];
    const outgoing = outgoingId ? state.clips[outgoingId] : undefined;
    let clips = state.clips;

    if (outgoing) {
      const current = trackPatternData(state.pattern, clip.trackId);
      if (current) {
        clips = {
          ...clips,
          [outgoing.id]: { ...outgoing, pattern: current }
        };
      }
    }

    const data =
      clip.pattern ??
      (state.scenes[clip.sceneId]
        ? trackPatternData(state.scenes[clip.sceneId].pattern, clip.trackId)
        : null);
    if (!data) {
      this.status.generative(`El clip ${clip.name} no tiene patrón.`);
      return;
    }

    const next: InstrumentState = {
      ...state,
      clips,
      pattern: applyTrackPatternData(state.pattern, clip.trackId, data),
      activeClips: { ...state.activeClips, [clip.trackId]: clip.id },
      history: []
    };

    this.store.update(() => next);
    this.runtime.clipStartedAt[clip.trackId] = stepCount;
  }

  private stopTracksNow(trackIds: readonly string[]): void {
    const state = this.store.getState();
    let clips = state.clips;
    const activeClips = { ...state.activeClips };

    trackIds.forEach(trackId => {
      const activeId = activeClips[trackId];
      if (!activeId) return;
      const clip = clips[activeId];
      if (clip) {
        const current = trackPatternData(state.pattern, trackId);
        if (current) {
          clips = {
            ...clips,
            [clip.id]: { ...clip, pattern: current }
          };
        }
      }
      activeClips[trackId] = null;
      delete this.runtime.clipStartedAt[trackId];
    });

    this.store.update(current => ({
      ...current,
      clips,
      activeClips
    }));
  }

  private applyFollowActions(stepCount: number): void {
    const state = this.store.getState();
    const entries = Object.entries(state.activeClips);

    entries.forEach(([trackId, activeId]) => {
      if (!activeId) return;
      const clip = state.clips[activeId];
      if (!clip || clip.followAction === 'none' || clip.followAfter <= 0) {
        return;
      }
      const started = this.runtime.clipStartedAt[trackId] ?? stepCount;
      if (stepCount - started < clip.followAfter * FOLLOW_BAR_STEPS) return;

      if (clip.followAction === 'stop') {
        this.stopTracksNow([trackId]);
        return;
      }

      const choices = clipsForTrack(state.clips, trackId);
      if (choices.length === 0) return;
      const target = followTarget(clip, choices);
      if (!target) {
        this.runtime.clipStartedAt[trackId] = stepCount;
        return;
      }
      this.launchNow(target.id, stepCount);
      this.status.generative(`Follow ${clip.followAction} → ${target.name}.`);
    });
  }

  private updateClip(
    clipId: string,
    updater: (clip: ClipState) => ClipState
  ): void {
    const state = this.store.getState();
    const clip = state.clips[clipId];
    if (!clip) return;
    this.store.update(current => ({
      ...current,
      clips: { ...current.clips, [clipId]: updater(clip) }
    }));
  }
}

function followTarget(
  clip: ClipState,
  choices: readonly ClipState[]
): ClipState | undefined {
  const index = choices.findIndex(entry => entry.id === clip.id);
  if (clip.followAction === 'next') {
    return choices[(index + 1) % choices.length];
  }
  if (clip.followAction === 'previous') {
    return choices[(index - 1 + choices.length) % choices.length];
  }
  if (clip.followAction === 'random') {
    const others = choices.filter(entry => entry.id !== clip.id);
    if (others.length === 0) return undefined;
    return others[Math.floor(Math.random() * others.length)];
  }
  return undefined;
}
