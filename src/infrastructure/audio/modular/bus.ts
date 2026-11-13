import * as Tone from 'tone';
import type { BusConfig, InsertConfig } from '../../../domain/graph';
import type { PluginHost } from '../plugins/plugin-host';
import { InsertChain } from './insert-chain';
import { InsertSlot } from './insert-slot';
import { readMeter } from './track';

export class Bus {
  readonly id: string;
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  private readonly volume: Tone.Volume;
  private meter: Tone.Meter | null = null;
  private readonly host: PluginHost;
  private readonly chainMix = new Tone.Gain(1);
  private readonly sends = new Map<string, Tone.Gain>();
  private chain: InsertChain;
  private chainFade: Tone.Gain;

  constructor(config: BusConfig, host: PluginHost, masterInput: Tone.ToneAudioNode) {
    this.id = config.id;
    this.host = host;
    this.volume = new Tone.Volume(config.returnDb);

    this.chain = new InsertChain(config.inserts, host);
    this.chainFade = new Tone.Gain(1);
    this.input.connect(this.chain.input);
    this.chain.output.connect(this.chainFade);
    this.chainFade.connect(this.chainMix);
    this.chainMix.connect(this.volume);
    this.volume.connect(this.output);
    this.output.connect(masterInput);
  }

  setReturn(db: number): void {
    this.volume.volume.rampTo(db, 0.05, Tone.now());
  }

  setSend(busId: string, target: Tone.ToneAudioNode, amount: number): void {
    const existing = this.sends.get(busId);
    if (amount <= 0) {
      this.removeSend(busId);
      return;
    }
    if (existing) {
      existing.gain.rampTo(amount, 0.05, Tone.now());
      return;
    }

    const gain = new Tone.Gain(0);
    this.output.connect(gain);
    gain.connect(target);
    this.sends.set(busId, gain);
    gain.gain.rampTo(amount, 0.05, Tone.now());
  }

  removeSend(busId: string): void {
    const gain = this.sends.get(busId);
    if (!gain) return;
    this.sends.delete(busId);
    gain.gain.rampTo(0, 0.03, Tone.now());
    globalThis.setTimeout(() => gain.dispose(), 60);
  }

  clearSends(): void {
    Array.from(this.sends.keys()).forEach(busId => this.removeSend(busId));
  }

  syncSends(
    entries: readonly { readonly busId: string; readonly amount: number }[],
    resolve: (busId: string) => Tone.ToneAudioNode | undefined
  ): void {
    const desired = new Set(entries.map(entry => entry.busId));
    Array.from(this.sends.keys()).forEach(busId => {
      if (!desired.has(busId)) this.removeSend(busId);
    });
    entries.forEach(entry => {
      const target = resolve(entry.busId);
      if (target) this.setSend(entry.busId, target, entry.amount);
    });
  }

  setInsertBypass(insertId: string, bypass: boolean): void {
    this.chain.setInsertBypass(insertId, bypass);
  }

  setInsertParam(insertId: string, param: string, value: number): void {
    this.chain.setInsertParam(insertId, param, value);
  }

  getInsertParam(insertId: string, param: string): number | undefined {
    return this.chain.getInsertParam(insertId, param);
  }

  getInsertConfigs(): readonly InsertConfig[] {
    return this.chain.configs;
  }

  async setInserts(configs: readonly InsertConfig[]): Promise<void> {
    const next = new InsertChain(configs, this.host);
    const nextFade = new Tone.Gain(0);
    this.input.connect(next.input);
    next.output.connect(nextFade);
    nextFade.connect(this.chainMix);

    try {
      await next.prepare();
    } catch (error) {
      this.input.disconnect(next.input);
      nextFade.dispose();
      next.dispose();
      throw error;
    }

    const previous = this.chain;
    const previousFade = this.chainFade;
    this.chain = next;
    this.chainFade = nextFade;
    nextFade.gain.rampTo(1, 0.03, Tone.now());
    previousFade.gain.rampTo(0, 0.03, Tone.now());
    globalThis.setTimeout(() => {
      try {
        this.input.disconnect(previous.input);
      } catch {
        // La conexión puede haber sido limpiada por un swap posterior.
      }
      previous.dispose();
      previousFade.dispose();
    }, 80);
  }

  getLevel(): number {
    if (!this.meter) {
      this.meter = new Tone.Meter({ normalRange: false, smoothing: 0.8 });
      this.volume.connect(this.meter);
    }
    return readMeter(this.meter);
  }

  prepare(): Promise<void> {
    return this.chain.prepare();
  }

  dispose(): void {
    this.sends.forEach(gain => gain.dispose());
    this.sends.clear();
    this.chain.dispose();
    this.chainFade.dispose();
    this.chainMix.dispose();
    this.volume.dispose();
    this.meter?.dispose();
    this.output.dispose();
    this.input.dispose();
  }

  findInsertByPlugin(pluginId: string): InsertSlot | undefined {
    return this.chain.findInsertByPlugin(pluginId);
  }
}
