import type { AutomationTargetId } from './automation';
import type { ActiveClips, ClipCollection, ClipQuantize } from './clip';
import type { KitState } from './kit';
import type { ModulationState } from './modulation';
import type { Pattern, PatternState, PatternSteps } from './pattern';
import type { SceneCollection } from './scene';

export type BuiltinSceneId = 'umbral' | 'deriva' | 'pulso' | 'caos';
/**
 * Las escenas base siguen teniendo autocompletado, pero el modelo admite
 * escenas creadas en runtime. El orden vigente vive en `state.scenes`.
 */
export type SceneId = BuiltinSceneId | (string & {});

export const BUILTIN_SCENE_IDS: readonly BuiltinSceneId[] = [
  'umbral',
  'deriva',
  'pulso',
  'caos'
];
export type ScaleId =
  | 'minor'
  | 'harmonic'
  | 'dorian'
  | 'phrygian'
  | 'major'
  | 'minorPent'
  | 'majorPent';
export type ProgressionId = 'menor' | 'cadencia' | 'epica' | 'pedal';

export interface GenerativeParams {
  readonly density: number;
  readonly complexity: number;
  readonly variation: number;
  readonly stability: number;
  readonly randomness: number;
}

export interface HarmonyState {
  readonly root: number;
  readonly scale: ScaleId;
  readonly progression: ProgressionId;
  readonly sustain: number;
}

export interface SceneDefinition {
  readonly label: string;
  readonly params: GenerativeParams;
  readonly harmony: HarmonyState;
}

export interface RootDefinition {
  readonly label: string;
  readonly pc: number;
}

export interface ScaleDefinition {
  readonly label: string;
  readonly intervals: readonly number[];
}

export interface ProgressionDefinition {
  readonly label: string;
  readonly degrees: readonly number[];
}

export interface ChannelSeed {
  readonly pulses: number;
  readonly offset: number;
}

export interface AutomationState {
  readonly enabled: boolean;
  readonly target: AutomationTargetId;
  readonly values: readonly number[];
}

export interface ArrangementBlock {
  readonly id: string;
  readonly sceneId: SceneId;
  readonly bars: number;
}

export interface ArrangementState {
  readonly enabled: boolean;
  readonly recording: boolean;
  readonly blocks: readonly ArrangementBlock[];
  readonly blockIndex: number;
  readonly bar: number;
  readonly loop: boolean;
  readonly loopStart: number;
  readonly loopEnd: number;
}

export interface TransportState {
  readonly bpm: number;
  readonly swing: number;
  readonly humanize: number;
  readonly lookAhead: number;
  readonly playing: boolean;
  readonly preparing: boolean;
  readonly currentStep: number;
}

export interface InstrumentState {
  readonly selected: string;
  readonly scene: SceneId;
  readonly scenes: SceneCollection;
  readonly seed: number;
  readonly params: GenerativeParams;
  readonly harmony: HarmonyState;
  readonly pattern: PatternState;
  readonly automation: AutomationState;
  readonly arrangement: ArrangementState;
  readonly transport: TransportState;
  readonly kit: KitState;
  readonly modulation: ModulationState;
  readonly masterVolume: number;
  readonly clips: ClipCollection;
  readonly activeClips: ActiveClips;
  readonly clipQuantize: ClipQuantize;
  readonly favorites: readonly string[];
  readonly recentSounds: readonly string[];
  readonly history: readonly PatternSteps[];
  readonly clipboard: Pattern | null;
  readonly mutationCount: number;
  readonly evolveCount: number;
  readonly evolve: boolean;
}
