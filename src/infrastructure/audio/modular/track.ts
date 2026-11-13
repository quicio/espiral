import * as Tone from 'tone';
import type { InsertConfig, SendConfig, TrackConfig } from '../../../domain/graph';
import type { PluginHost } from '../plugins/plugin-host';
import { InsertChain } from './insert-chain';
import { InsertSlot } from './insert-slot';

interface SendNode {
  readonly gain: Tone.Gain;
  readonly delay: Tone.Delay | null;
  readonly preFader: boolean;
}

export class Track {
  readonly id: string;
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  private readonly volume: Tone.Volume;
  private readonly panner: Tone.Panner;
  private readonly muteGain: Tone.Gain;
  private meter: Tone.Meter | null = null;
  private readonly compensation: Tone.Delay | null;
  private readonly host: PluginHost;
  private readonly chainMix = new Tone.Gain(1);
  private readonly sends = new Map<string, SendNode>();
  private readonly sampleRate: number;
  private chain: InsertChain;
  private chainFade: Tone.Gain;

  constructor(
    config: TrackConfig,
    host: PluginHost,
    masterInput: Tone.ToneAudioNode,
    resolveBus: (busId: string) => Tone.ToneAudioNode | undefined,
    compensationSamples: number,
    sendCompensation: (send: SendConfig) => number
  ) {
    this.id = config.id;
    this.host = host;
    this.sampleRate = Tone.getContext().sampleRate;
    this.volume = new Tone.Volume(config.gainDb);
    this.panner = new Tone.Panner(config.pan);
    this.muteGain = new Tone.Gain(config.mute ? 0 : 1);

    this.chain = new InsertChain(config.inserts, host);
    this.chainFade = new Tone.Gain(1);
    this.input.connect(this.chain.input);
    this.chain.output.connect(this.chainFade);
    this.chainFade.connect(this.chainMix);
    this.chainMix.connect(this.volume);

    this.volume.connect(this.panner);
    this.panner.connect(this.muteGain);
    this.muteGain.connect(this.output);
    this.compensation = createCompensation(compensationSamples, this.sampleRate);
    if (this.compensation) {
      this.output.connect(this.compensation);
      this.compensation.connect(masterInput);
    } else {
      this.output.connect(masterInput);
    }

    config.sends.forEach(send => {
      const busInput = resolveBus(send.busId);
      if (!busInput) return;
      this.addSend(
        send.busId,
        busInput,
        send.amount,
        send.preFader,
        sendCompensation(send)
      );
    });
  }

  setVolume(db: number, time = Tone.now()): void {
    this.volume.volume.rampTo(db, 0.05, time);
  }

  setPan(pan: number, time = Tone.now()): void {
    this.panner.pan.rampTo(pan, 0.05, time);
  }

  setMute(muted: boolean): void {
    this.muteGain.gain.rampTo(muted ? 0 : 1, 0.02, Tone.now());
  }

  addSend(
    busId: string,
    busInput: Tone.ToneAudioNode,
    amount: number,
    preFader = false,
    compensationSamples = 0
  ): void {
    const existing = this.sends.get(busId);
    if (existing) {
      existing.gain.gain.rampTo(amount, 0.05, Tone.now());
      return;
    }

    const gain = new Tone.Gain(0);
    const delay = createCompensation(compensationSamples, this.sampleRate);
    let source: Tone.ToneAudioNode = preFader ? this.input : this.output;
    if (delay) {
      source.connect(delay);
      source = delay;
    }
    source.connect(gain);
    gain.connect(busInput);
    this.sends.set(busId, { gain, delay, preFader });
    gain.gain.rampTo(amount, 0.05, Tone.now());
  }

  setSend(busId: string, amount: number): void {
    this.sends.get(busId)?.gain.gain.rampTo(amount, 0.05, Tone.now());
  }

  hasSend(busId: string): boolean {
    return this.sends.has(busId);
  }

  sendIsPre(busId: string): boolean {
    return this.sends.get(busId)?.preFader ?? false;
  }

  removeSend(busId: string): void {
    const send = this.sends.get(busId);
    if (!send) return;
    this.sends.delete(busId);
    send.gain.gain.rampTo(0, 0.02, Tone.now());
    globalThis.setTimeout(() => {
      send.gain.dispose();
      send.delay?.dispose();
    }, 60);
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

  getInsertAudioParam(
    insertId: string,
    paramId: string
  ): Tone.Param<any> | Tone.Signal<any> | null {
    return this.chain.getInsertAudioParam(insertId, paramId);
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
      this.muteGain.connect(this.meter);
    }
    return readMeter(this.meter);
  }

  prepare(): Promise<void> {
    return this.chain.prepare();
  }

  dispose(): void {
    this.sends.forEach(send => {
      send.gain.dispose();
      send.delay?.dispose();
    });
    this.sends.clear();
    this.chain.dispose();
    this.chainFade.dispose();
    this.chainMix.dispose();
    this.volume.dispose();
    this.panner.dispose();
    this.muteGain.dispose();
    this.meter?.dispose();
    this.compensation?.dispose();
    this.output.dispose();
    this.input.dispose();
  }

  findInsertByPlugin(pluginId: string): InsertSlot | undefined {
    return this.chain.findInsertByPlugin(pluginId);
  }
}

export function readMeter(meter: Tone.Meter): number {
  const value = meter.getValue();
  return Array.isArray(value) ? Math.max(...value) : value;
}

export function createCompensation(
  samples: number,
  sampleRate: number
): Tone.Delay | null {
  if (samples <= 0) return null;
  const seconds = samples / sampleRate;
  return new Tone.Delay(seconds, Math.max(0.1, seconds + 0.05));
}
