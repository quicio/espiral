import { cloneKit, type KitState } from './kit';
import type { GenerativeParams, HarmonyState, SceneId } from './models';
import { clonePatternState, type PatternState } from './pattern';

export interface SceneSnapshot {
  readonly id: SceneId;
  readonly name: string;
  readonly kit: KitState;
  readonly pattern: PatternState;
  readonly harmony: HarmonyState;
  readonly seed: number;
  readonly params: GenerativeParams;
  readonly masterVolume: number;
}

export type SceneCollection = Record<SceneId, SceneSnapshot>;

export function cloneScene(snapshot: SceneSnapshot): SceneSnapshot {
  return {
    ...snapshot,
    kit: cloneKit(snapshot.kit),
    pattern: clonePatternState(snapshot.pattern),
    harmony: { ...snapshot.harmony },
    params: { ...snapshot.params }
  };
}
