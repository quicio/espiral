import type * as Tone from 'tone';
import type { InsertConfig } from '../../../domain/graph';
import type { PluginDefinition, PluginState } from '../../../domain/plugin';

export interface PluginInstance {
  readonly input: Tone.ToneAudioNode;
  readonly output: Tone.ToneAudioNode;
  setParam(id: string, value: number, time?: number): void;
  getParam(id: string): number;
  getAudioParam?(id: string): Tone.Param<any> | Tone.Signal<any> | null;
  prepare?(): Promise<void>;
  dispose(): void;
}

export interface PluginFactory {
  readonly definition: PluginDefinition;
  load?(): Promise<void>;
  create(config: InsertConfig): PluginInstance;
}

export interface InstrumentPluginInstance {
  readonly output: Tone.ToneAudioNode;
  trigger(
    notes: string | readonly string[],
    duration: Tone.Unit.Time,
    time: number,
    velocity: number
  ): void;
  release(time?: number): void;
  setParam(id: string, value: number, time?: number): void;
  getParam(id: string): number;
  prepare?(): Promise<void>;
  dispose(): void;
}

export interface InstrumentPluginFactory {
  readonly definition: PluginDefinition;
  load?(): Promise<void>;
  create(state: PluginState): InstrumentPluginInstance;
}
