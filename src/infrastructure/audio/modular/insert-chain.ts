import * as Tone from 'tone';
import type { InsertConfig } from '../../../domain/graph';
import type { PluginHost } from '../plugins/plugin-host';
import { InsertSlot } from './insert-slot';

export class InsertChain {
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  readonly configs: readonly InsertConfig[];
  private readonly slots: InsertSlot[] = [];

  constructor(configs: readonly InsertConfig[], host: PluginHost) {
    this.configs = [...configs];

    let current: Tone.ToneAudioNode = this.input;
    this.configs.forEach(config => {
      const slot = new InsertSlot(config, host);
      current.connect(slot.input);
      current = slot.output;
      this.slots.push(slot);
    });
    current.connect(this.output);
  }

  setInsertBypass(insertId: string, bypass: boolean): void {
    this.findInsert(insertId)?.setBypass(bypass);
  }

  setInsertParam(insertId: string, param: string, value: number): void {
    this.findInsert(insertId)?.setParam(param, value);
  }

  getInsertParam(insertId: string, param: string): number | undefined {
    return this.findInsert(insertId)?.getParam(param);
  }

  findInsertByPlugin(pluginId: string): InsertSlot | undefined {
    return this.slots.find(insert => insert.pluginId === pluginId);
  }

  prepare(): Promise<void> {
    return Promise.all(this.slots.map(insert => insert.prepare())).then(() => undefined);
  }

  dispose(): void {
    this.slots.forEach(slot => slot.dispose());
    this.input.dispose();
    this.output.dispose();
  }

  private findInsert(insertId: string): InsertSlot | undefined {
    return this.slots.find(insert => insert.id === insertId);
  }
}
