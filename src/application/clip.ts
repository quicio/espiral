import {
  applyTrackPatternData,
  clipsForTrack,
  nextQuantizedStep,
  trackPatternData,
  withSceneTrackPattern,
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
          .map(([trackId]) => trackId),
        stepCount
      );
      return;
    }
    if (action.kind === 'stop-track') {
      this.stopTracksNow([action.trackId], stepCount);
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
    let scenes = state.scenes;

    if (outgoing) {
      const current = trackPatternData(state.pattern, clip.trackId);
      if (current) {
        scenes = withSceneTrackPattern(
          scenes,
          outgoing.sceneId,
          clip.trackId,
          current
        );
      }
    }

    const target = scenes[clip.sceneId];
    const data = target ? trackPatternData(target.pattern, clip.trackId) : null;
    if (!data) {
      this.status.generative(`El clip ${clip.name} no tiene patrón.`);
      return;
    }

    const next: InstrumentState = {
      ...state,
      scenes,
      pattern: applyTrackPatternData(state.pattern, clip.trackId, data),
      activeClips: { ...state.activeClips, [clip.trackId]: clip.id },
      history: []
    };

    this.store.update(() => next);
    this.runtime.clipStartedAt[clip.trackId] = stepCount;
  }

  private stopTracksNow(trackIds: readonly string[], stepCount: number): void {
    const state = this.store.getState();
    let scenes = state.scenes;
    const activeClips = { ...state.activeClips };

    trackIds.forEach(trackId => {
      const activeId = activeClips[trackId];
      if (!activeId) return;
      const clip = state.clips[activeId];
      if (clip) {
        const current = trackPatternData(state.pattern, trackId);
        if (current) {
          scenes = withSceneTrackPattern(
            scenes,
            clip.sceneId,
            trackId,
            current
          );
        }
      }
      activeClips[trackId] = null;
      delete this.runtime.clipStartedAt[trackId];
    });

    this.store.update(current => ({
      ...current,
      scenes,
      activeClips
    }));
    void stepCount;
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
        this.stopTracksNow([trackId], stepCount);
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
