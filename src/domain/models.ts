import type { AutomationTargetId } from './automation';
import type { KitState } from './kit';
import type { ModulationState } from './modulation';
import type { Pattern, PatternState, PatternSteps } from './pattern';
import type { SceneCollection } from './scene';

export type SceneId = 'umbral' | 'deriva' | 'pulso' | 'caos';
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
  readonly transport: TransportState;
  readonly kit: KitState;
  readonly modulation: ModulationState;
  readonly masterVolume: number;
  readonly history: readonly PatternSteps[];
  readonly clipboard: Pattern | null;
  readonly mutationCount: number;
  readonly evolveCount: number;
  readonly evolve: boolean;
}
