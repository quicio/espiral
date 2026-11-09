import type * as Tone from 'tone';
import type { InsertConfig } from '../../../domain/graph';
import type { PluginDefinition } from '../../../domain/plugin';

export interface PluginInstance {
  readonly input: Tone.ToneAudioNode;
  readonly output: Tone.ToneAudioNode;
  setParam(id: string, value: number, time?: number): void;
  getParam(id: string): number;
  prepare?(): Promise<void>;
  dispose(): void;
}

export interface PluginFactory {
  readonly definition: PluginDefinition;
  load?(): Promise<void>;
  create(config: InsertConfig): PluginInstance;
}
