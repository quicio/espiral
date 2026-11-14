import type {
  InsertConfig,
  MachineConfig,
  SendConfig
} from '../../../domain/graph';
import type { SidechainConfig } from '../../../domain/sidechain';
import { AudioCore } from './audio-core';
import { SpectrumAnalyzer } from './dsp/fft';
import type {
  CoreAudioModulationConfig,
  CoreQualityMode,
  CoreBusConfig,
  CoreEvent,
  CoreGraph,
  CoreMasterConfig,
  CoreSample,
  CoreTrackConfig
} from './types';

declare const sampleRate: number;
declare const currentTime: number;
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][]
  ): boolean;
}
declare function registerProcessor(
  name: string,
  processor: new () => AudioWorkletProcessor
): void;

type MixPatch = {
  readonly gainDb?: number;
  readonly pan?: number;
  readonly mute?: boolean;
  readonly solo?: boolean;
  readonly inserts?: readonly InsertConfig[];
  readonly sends?: readonly SendConfig[];
  readonly outputBusId?: string | null;
};

type Message =
  | { readonly type: 'load'; readonly graph: CoreGraph; readonly seed?: number }
  | { readonly type: 'event'; readonly event: CoreEvent }
  | { readonly type: 'add-track'; readonly track: CoreTrackConfig }
  | { readonly type: 'remove-track'; readonly trackId: string }
  | {
      readonly type: 'machine';
      readonly trackId: string;
      readonly machine: MachineConfig;
      readonly samples?: readonly CoreSample[];
    }
  | {
      readonly type: 'mix';
      readonly trackId: string;
      readonly patch: MixPatch;
    }
  | { readonly type: 'master'; readonly master: CoreMasterConfig }
  | { readonly type: 'sidechain'; readonly sidechain?: SidechainConfig }
  | { readonly type: 'add-bus'; readonly bus: CoreBusConfig }
  | { readonly type: 'remove-bus'; readonly busId: string }
  | { readonly type: 'bus-return'; readonly busId: string; readonly db: number }
  | {
      readonly type: 'bus-inserts';
      readonly busId: string;
      readonly inserts: readonly InsertConfig[];
    }
  | {
      readonly type: 'bus-sends';
      readonly busId: string;
      readonly sends: readonly SendConfig[];
    }
  | {
      readonly type: 'insert-param';
      readonly trackId: string;
      readonly insertId: string;
      readonly param: string;
      readonly value: number;
    }
  | {
      readonly type: 'bus-insert-param';
      readonly busId: string;
      readonly insertId: string;
      readonly param: string;
      readonly value: number;
    }
  | {
      readonly type: 'audio-modulation';
      readonly route: CoreAudioModulationConfig;
    }
  | { readonly type: 'remove-audio-modulation'; readonly routeId: string }
  | { readonly type: 'clear-audio-modulations' }
  | { readonly type: 'spectrum-target'; readonly trackId: string | null }
  | { readonly type: 'transition'; readonly fadeOut: boolean }
  | {
      readonly type: 'transport';
      readonly running: boolean;
      readonly bpm?: number;
      readonly lookAhead?: number;
    }
  | { readonly type: 'transport-bpm'; readonly bpm: number }
  | { readonly type: 'transport-lookahead'; readonly lookAhead: number }
  | { readonly type: 'quality'; readonly mode: CoreQualityMode }
  | { readonly type: 'stop' }
  | { readonly type: 'reset' };

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

class EspiralCoreProcessor extends AudioWorkletProcessor {
  private core: AudioCore | null = null;
  private readySent = false;
  private levelPeak = 0;
  private levelFrames = 0;
  private spectrumTrackId: string | null = null;
  private readonly masterAnalyzer = new SpectrumAnalyzer();
  private readonly trackAnalyzer = new SpectrumAnalyzer();
  private maxRenderMs = 0;
  private maxRenderMsEver = 0;
  private overBudget = 0;
  private overrunMs = 0;
  private totalMs = 0;
  private originTime = 0;
  private transportRunning = false;
  private bpm = 120;
  private lookAhead = 0.15;
  private nextStepTime = 0;
  private stepIndex = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<Message>) => {
      this.handle(event.data);
    };
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][]
  ): boolean {
    const output = outputs[0];
    const left = output?.[0];
    if (!output || !left) return true;
    const right = output[1] ?? left;

    if (!this.core) {
      left.fill(0);
      if (right !== left) right.fill(0);
      return true;
    }

    const blockStart = this.core.currentTime;
    const renderStarted = nowMs();
    try {
      this.core.render(left, right);
    } catch (error) {
      this.port.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
      return true;
    }
    const renderMs = nowMs() - renderStarted;
    const blockMs = (left.length / sampleRate) * 1000;
    this.maxRenderMs = Math.max(this.maxRenderMs, renderMs);
    this.maxRenderMsEver = Math.max(this.maxRenderMsEver, renderMs);
    this.totalMs += blockMs;
    if (renderMs > blockMs) {
      this.overBudget += 1;
      this.overrunMs += renderMs - blockMs;
    }
    if (!this.readySent) {
      this.originTime = currentTime;
      this.readySent = true;
      this.port.postMessage({ type: 'ready', startTime: this.originTime });
    }

    if (this.transportRunning) {
      let posted = 0;
      while (
        this.nextStepTime <= blockStart + this.lookAhead &&
        posted < 64
      ) {
        this.port.postMessage({
          type: 'step',
          step: this.stepIndex,
          time: this.originTime + this.nextStepTime
        });
        this.nextStepTime += 60 / Math.max(1, this.bpm) / 4;
        this.stepIndex += 1;
        posted += 1;
      }
    }

    for (let index = 0; index < left.length; index += 1) {
      this.levelPeak = Math.max(
        this.levelPeak,
        Math.abs(left[index] ?? 0),
        Math.abs(right[index] ?? 0)
      );
    }
    this.levelFrames += left.length;
    if (this.levelFrames >= Math.round(sampleRate / 20)) {
      this.port.postMessage({
        type: 'level',
        master: this.levelPeak,
        tracks: this.core.getTrackLevels(),
        buses: this.core.getBusLevels(),
        spectrumMaster: this.masterAnalyzer.analyze(left, 32),
        spectrumTrack: this.spectrumTrackId
          ? this.trackAnalyzer.analyze(
              this.core.getTrackSpectrumSamples(),
              32
            )
          : undefined,
        spectrumTrackId: this.spectrumTrackId,
        renderMs: this.maxRenderMs,
        renderMaxMs: this.maxRenderMsEver,
        overBudget: this.overBudget,
        overrunMs: this.overrunMs,
        totalMs: this.totalMs
      });
      this.maxRenderMs = 0;
      this.levelPeak = 0;
      this.levelFrames = 0;
    }

    return true;
  }

  private handle(message: Message): void {
    try {
      this.handleMessage(message);
    } catch (error) {
      this.port.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private handleMessage(message: Message): void {
    switch (message.type) {
      case 'load':
        this.core = new AudioCore(message.graph, sampleRate, message.seed);
        this.readySent = false;
        this.levelPeak = 0;
        this.levelFrames = 0;
        this.transportRunning = false;
        this.nextStepTime = 0;
        this.stepIndex = 0;
        this.originTime = 0;
        return;
      case 'event':
        this.core?.schedule(message.event);
        return;
      case 'add-track':
        this.core?.addTrack(message.track);
        return;
      case 'remove-track':
        this.core?.removeTrack(message.trackId);
        return;
      case 'machine':
        this.core?.setTrackMachine(
          message.trackId,
          message.machine,
          message.samples ?? []
        );
        return;
      case 'mix':
        this.core?.updateTrack(message.trackId, message.patch);
        return;
      case 'master':
        this.core?.setMaster(message.master);
        return;
      case 'sidechain':
        this.core?.setSidechain(message.sidechain);
        return;
      case 'add-bus':
        this.core?.addBus(message.bus);
        return;
      case 'remove-bus':
        this.core?.removeBus(message.busId);
        return;
      case 'bus-return':
        this.core?.setBusReturn(message.busId, message.db);
        return;
      case 'bus-inserts':
        this.core?.setBusInserts(message.busId, message.inserts);
        return;
      case 'bus-sends':
        this.core?.setBusSends(message.busId, message.sends);
        return;
      case 'insert-param':
        this.core?.setInsertParam(
          message.trackId,
          message.insertId,
          message.param,
          message.value
        );
        return;
      case 'bus-insert-param':
        this.core?.setBusInsertParam(
          message.busId,
          message.insertId,
          message.param,
          message.value
        );
        return;
      case 'audio-modulation':
        this.core?.addAudioModulation(message.route);
        return;
      case 'remove-audio-modulation':
        this.core?.removeAudioModulation(message.routeId);
        return;
      case 'clear-audio-modulations':
        this.core?.clearAudioModulations();
        return;
      case 'spectrum-target':
        this.spectrumTrackId = message.trackId;
        this.core?.setSpectrumTrack(message.trackId);
        return;
      case 'transition':
        if (message.fadeOut) this.core?.beginTransition();
        else this.core?.endTransition();
        return;
      case 'transport':
        if (message.running) {
          this.bpm = message.bpm ?? this.bpm;
          this.lookAhead = message.lookAhead ?? this.lookAhead;
          this.stepIndex = 0;
          this.nextStepTime = (this.core?.currentTime ?? 0) + 0.03;
          this.transportRunning = true;
        } else {
          this.transportRunning = false;
        }
        return;
      case 'transport-bpm':
        this.bpm = message.bpm;
        return;
      case 'transport-lookahead':
        this.lookAhead = Math.max(0, Math.min(0.5, message.lookAhead));
        return;
      case 'quality':
        this.core?.setQuality(message.mode);
        return;
      case 'stop':
        this.transportRunning = false;
        this.core?.stop();
        return;
      case 'reset':
        this.core?.reset();
        this.readySent = false;
        return;
      default:
        return;
    }
  }
}

registerProcessor('espiral-core', EspiralCoreProcessor);
