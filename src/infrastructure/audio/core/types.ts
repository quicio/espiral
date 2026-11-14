import type {
  EqSettings,
  GraphConfig,
  InsertConfig,
  MachineConfig,
  SendConfig
} from '../../../domain/graph';
import type { LfoShape } from '../../../domain/modulation';
import type { SidechainConfig } from '../../../domain/sidechain';

export interface CoreSample {
  readonly sampleRate: number;
  readonly channels: readonly Float32Array[];
}

export type CoreMachine = MachineConfig;

export type CoreQualityMode = 'full' | 'lite' | 'eco';

export interface CoreTrackConfig {
  readonly id: string;
  readonly machine: CoreMachine;
  readonly samples?: readonly CoreSample[];
  readonly inserts?: readonly InsertConfig[];
  readonly sends?: readonly SendConfig[];
  readonly outputBusId?: string;
  readonly gainDb: number;
  readonly pan: number;
  readonly mute: boolean;
  readonly solo: boolean;
}

export interface CoreBusConfig {
  readonly id: string;
  readonly returnDb: number;
  readonly inserts: readonly InsertConfig[];
  readonly sends?: readonly SendConfig[];
}

export interface CoreMasterConfig {
  readonly volumeDb: number;
  readonly limiterDb: number;
  readonly trimDb?: number;
  readonly lookaheadMs?: number;
  readonly eq?: EqSettings;
  readonly glue?: GraphConfig['master']['glue'];
}

export interface CoreGraph {
  readonly tracks: readonly CoreTrackConfig[];
  readonly buses?: readonly CoreBusConfig[];
  readonly sidechain?: SidechainConfig;
  readonly master: CoreMasterConfig;
}

export interface CoreAudioModulationConfig {
  readonly id: string;
  readonly trackId: string;
  readonly insertId: string;
  readonly param: string;
  readonly rate: number;
  readonly shape: LfoShape;
  readonly amount: number;
  readonly bipolar: boolean;
  readonly min: number;
  readonly max: number;
  readonly base: number;
}

export interface CoreKickEvent {
  readonly type: 'kick';
  readonly trackId: string;
  readonly time: number;
  readonly velocity?: number;
}

export interface CoreSynthEvent {
  readonly type: 'synth';
  readonly trackId: string;
  readonly time: number;
  readonly notes: readonly number[];
  readonly duration: number;
  readonly velocity?: number;
  readonly accent?: boolean;
  readonly slide?: boolean;
}

export interface CoreSampleEvent {
  readonly type: 'sample';
  readonly trackId: string;
  readonly time: number;
  readonly sampleIndex?: number;
  readonly playbackRate?: number;
  readonly duration?: number;
  readonly gainDb?: number;
}

export type CoreEvent = CoreKickEvent | CoreSynthEvent | CoreSampleEvent;
