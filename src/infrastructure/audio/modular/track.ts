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
  /** Ganancia dedicada al ducking de sidechain. No es el fader del usuario. */
  readonly duckGain = new Tone.Gain(1);
  private readonly volume: Tone.Volume;
  private readonly panner: Tone.Panner;
  private readonly muteGain: Tone.Gain;
  private meter: Tone.Meter | null = null;
  private spectrum: Tone.Analyser | null = null;
  private readonly compensation: Tone.Delay | null;
  private readonly host: PluginHost;
  private readonly chainMix = new Tone.Gain(1);
  private readonly sends = new Map<string, SendNode>();
  private readonly sampleRate: number;
  private chain: InsertChain;
  private chainFade: Tone.Gain;
  private outputTarget: Tone.ToneAudioNode;
  private outputBusId: string | undefined;

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
    this.muteGain.connect(this.duckGain);
    this.duckGain.connect(this.output);
    this.compensation = createCompensation(compensationSamples, this.sampleRate);
    this.outputBusId = config.outputBusId;
    this.outputTarget =
      (config.outputBusId ? resolveBus(config.outputBusId) : undefined) ??
      masterInput;
    if (this.compensation) {
      this.output.connect(this.compensation);
      this.compensation.connect(this.outputTarget);
    } else {
      this.output.connect(this.outputTarget);
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

  setOutput(target: Tone.ToneAudioNode, outputBusId?: string): void {
    if (target === this.outputTarget && outputBusId === this.outputBusId) {
      return;
    }
    this.output.disconnect();
    this.compensation?.disconnect();
    if (this.compensation) {
      this.output.connect(this.compensation);
      this.compensation.connect(target);
    } else {
      this.output.connect(target);
    }
    this.outputTarget = target;
    this.outputBusId = outputBusId;
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

  prepareMeter(): void {
    if (this.meter) return;
    this.meter = new Tone.Meter({ normalRange: false, smoothing: 0.8 });
    this.muteGain.connect(this.meter);
  }

  getLevel(): number {
    this.prepareMeter();
    return readMeter(this.meter!);
  }

  getSpectrum(bins: number): readonly number[] {
    if (!this.spectrum) {
      this.spectrum = new Tone.Analyser({
        type: 'fft',
        size: 256,
        smoothing: 0.8,
        channels: 1
      });
      // `muteGain` no se desconecta cuando cambia el routing de salida.
      this.muteGain.connect(this.spectrum);
    }
    const value = this.spectrum.getValue();
    const data = (Array.isArray(value) ? value[0] : value) ?? new Float32Array(0);
    return sampleSpectrum(data, bins);
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
    this.duckGain.dispose();
    this.meter?.dispose();
    this.spectrum?.dispose();
    this.compensation?.dispose();
    this.output.dispose();
    this.input.dispose();
  }

  findInsertByPlugin(pluginId: string): InsertSlot | undefined {
    return this.chain.findInsertByPlugin(pluginId);
  }
}

function sampleSpectrum(
  data: Float32Array,
  bins: number
): readonly number[] {
  const count = Math.max(1, Math.round(bins));
  const step = Math.max(1, Math.floor(data.length / count));
  return Array.from({ length: count }, (_, index) => {
    const db = data[index * step] ?? -100;
    return Math.max(0, Math.min(1, (db + 100) / 100));
  });
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
