import * as Tone from 'tone';
import type { InsertConfig } from '../../../domain/graph';
import type { PluginHost } from '../plugins/plugin-host';
import type { PluginInstance } from '../plugins/types';

export class InsertSlot {
  readonly id: string;
  readonly pluginId: string;
  readonly latencySamples: number;
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  private readonly dry = new Tone.Gain(1);
  private readonly wet = new Tone.Gain(0);
  private readonly processor: PluginInstance;
  private bypassed: boolean;

  constructor(config: InsertConfig, host: PluginHost) {
    this.id = config.id;
    this.pluginId = config.pluginId;
    this.latencySamples = Math.max(
      0,
      config.latencySamples ?? host.getLatencySamples(config.pluginId)
    );
    this.processor = host.create(config);
    this.bypassed = config.bypass;

    this.dry.gain.value = config.bypass ? 1 : 0;
    this.wet.gain.value = config.bypass ? 0 : 1;

    this.input.connect(this.dry);
    this.dry.connect(this.output);
    this.input.connect(this.processor.input);
    this.processor.output.connect(this.wet);
    this.wet.connect(this.output);
  }

  setBypass(bypass: boolean, time = Tone.now()): void {
    if (bypass === this.bypassed) return;
    this.bypassed = bypass;
    this.dry.gain.rampTo(bypass ? 1 : 0, 0.02, time);
    this.wet.gain.rampTo(bypass ? 0 : 1, 0.02, time);
  }

  setParam(id: string, value: number, time?: number): void {
    this.processor.setParam(id, value, time);
  }

  getParam(id: string): number {
    return this.processor.getParam(id);
  }

  prepare(): Promise<void> {
    return this.processor.prepare?.() ?? Promise.resolve();
  }

  dispose(): void {
    this.input.dispose();
    this.output.dispose();
    this.dry.dispose();
    this.wet.dispose();
    this.processor.dispose();
  }
}
