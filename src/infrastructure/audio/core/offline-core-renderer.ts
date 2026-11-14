import { AutomationService } from '../../../application/automation';
import { ClipService } from '../../../application/clip';
import { PlaybackService } from '../../../application/playback';
import { PlaybackRuntime } from '../../../application/runtime';
import { Store } from '../../../application/store';
import type { EffectKind, NoteDuration, SoundEvent } from '../../../domain/audio';
import type {
  BusConfig,
  EqSettings,
  GraphConfig,
  InsertConfig,
  MachineConfig,
  TrackConfig
} from '../../../domain/graph';
import type { BusState } from '../../../domain/kit';
import type { LfoShape, ModulationTarget } from '../../../domain/modulation';
import type { PluginDefinition } from '../../../domain/plugin';
import type {
  AudioEnginePort,
  AudioExportPort,
  ClockPort,
  StepListener
} from '../../../domain/ports';
import type { SidechainConfig } from '../../../domain/sidechain';
import type { InstrumentState } from '../../../domain/models';
import { UmbralGenerative } from '../../generative/umbral-generative';
import { createEspiralGraph } from '../modular/espiral-graph';
import { CoreSampleLoader } from './sample-loader';
import { encodeWav } from '../wav';
import { toCoreEvent } from './convert';
import { AudioCore } from './audio-core';
import type {
  CoreBusConfig,
  CoreGraph,
  CoreMasterConfig,
  CoreQualityMode,
  CoreSample,
  CoreTrackConfig
} from './types';
import { builtinPlugins } from '../plugins/builtins';
import { builtinInstruments } from '../plugins/instruments';

const SAMPLE_RATE = 48_000;
const BLOCK_SIZE = 128;

class OfflineClock implements ClockPort {
  private readonly listeners = new Set<StepListener>();
  lookAhead = 0.1;

  constructor(private bpm: number) {}

  async start(): Promise<void> {}

  stop(): void {}

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  getBpm(): number {
    return this.bpm;
  }

  setLookAhead(seconds: number): void {
    this.lookAhead = seconds;
  }

  getLookAhead(): number {
    return this.lookAhead;
  }

  now(): number {
    return 0;
  }

  onStep(listener: StepListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
  }

  fire(time: number, step: number): void {
    for (const listener of this.listeners) listener(time, step);
  }
}

class NullStatus {
  generative(): void {}
  session(): void {}
  instrument(): void {}
  error(): void {}
}

interface ParameterEvent {
  readonly time: number;
  readonly apply: (core: AudioCore) => void;
}

class RecordingEngine implements AudioEnginePort {
  readonly supportsInserts = true;
  readonly supportsTrackManagement = true;
  readonly supportsRouting = true;
  readonly supportsMachineChange = true;
  readonly soundEvents: SoundEvent[] = [];
  private readonly parameterEvents: ParameterEvent[] = [];
  private readonly pluginDefinitions: readonly PluginDefinition[] = builtinPlugins
    .filter(plugin => plugin.definition.id !== 'worklet-drive')
    .map(plugin => plugin.definition);
  private master: CoreMasterConfig;

  constructor(private readonly graph: GraphConfig) {
    this.master = {
      volumeDb: graph.master.volumeDb,
      limiterDb: graph.master.limiterDb,
      trimDb: graph.master.trimDb,
      lookaheadMs: 5,
      eq: graph.master.eq,
      glue: graph.master.glue
    };
  }

  getParameterEvents(): readonly ParameterEvent[] {
    return this.parameterEvents;
  }

  prepare(): Promise<void> {
    return Promise.resolve();
  }

  stop(): void {}

  dispose(): void {}

  addTrack(_track: TrackConfig): void {}

  removeTrack(_trackId: string): void {}

  syncTracks(_tracks: readonly TrackConfig[]): void {}

  setTrackMachine(_trackId: string, _machine: MachineConfig): void {}

  setTrackOutput(trackId: string, outputBusId?: string): void {
    this.parameterEvents.push({
      time: 0,
      apply: core => core.updateTrack(trackId, { outputBusId: outputBusId ?? null })
    });
  }

  setSidechain(config?: SidechainConfig): void {
    this.parameterEvents.push({
      time: 0,
      apply: core => core.setSidechain(config)
    });
  }

  addBus(_bus: BusConfig): void {}

  removeBus(_busId: string): void {}

  syncBuses(_buses: readonly BusConfig[]): void {}

  trigger(event: SoundEvent): void {
    this.soundEvents.push(event);
  }

  previewMachine(
    _machine: MachineConfig,
    _notes: readonly string[],
    _duration?: NoteDuration
  ): void {}

  setChannelVolume(trackId: string, db: number, time = 0): void {
    this.parameterEvents.push({
      time,
      apply: core => core.updateTrack(trackId, { gainDb: db })
    });
  }

  setChannelPan(trackId: string, pan: number, time = 0): void {
    this.parameterEvents.push({
      time,
      apply: core => core.updateTrack(trackId, { pan })
    });
  }

  setChannelMute(trackId: string, muted: boolean): void {
    this.parameterEvents.push({
      time: 0,
      apply: core => core.updateTrack(trackId, { mute: muted })
    });
  }

  setTrackSend(
    trackId: string,
    busId: string,
    amount: number,
    preFader: boolean
  ): void {
    this.parameterEvents.push({
      time: 0,
      apply: core => {
        const track = this.graph.tracks.find(entry => entry.id === trackId);
        const sends = [
          ...(track?.sends ?? []).filter(send => send.busId !== busId),
          ...(amount > 0 ? [{ busId, amount, preFader }] : [])
        ];
        core.updateTrack(trackId, { sends });
      }
    });
  }

  setBusReturn(busId: string, db: number): void {
    this.parameterEvents.push({
      time: 0,
      apply: core => core.setBusReturn(busId, db)
    });
  }

  setBusSend(_fromBusId: string, _toBusId: string, _amount: number): void {}

  syncBusSends(_buses: readonly BusState[]): void {}

  setBusInserts(
    _busId: string,
    _inserts: readonly InsertConfig[]
  ): Promise<void> {
    return Promise.resolve();
  }

  setEffectWet(
    trackId: string,
    effect: EffectKind,
    wet: number,
    time = 0
  ): void {
    const insert = this.graph.tracks
      .find(track => track.id === trackId)
      ?.inserts.find(entry => entry.pluginId === effect);
    if (!insert) return;
    this.parameterEvents.push({
      time,
      apply: core => core.setInsertParam(trackId, insert.id, 'wet', wet)
    });
  }

  setMasterVolume(db: number, time = 0): void {
    this.master = { ...this.master, volumeDb: db };
    const master = this.master;
    this.parameterEvents.push({
      time,
      apply: core => core.setMaster(master)
    });
  }

  setMasterEq(eq: EqSettings): void {
    this.master = { ...this.master, eq };
    const master = this.master;
    this.parameterEvents.push({
      time: 0,
      apply: core => core.setMaster(master)
    });
  }

  beginTransition(_fadeOutMs?: number): void {}

  endTransition(_fadeInMs?: number): void {}

  getMasterLevel(): number {
    return -120;
  }

  getMasterSpectrum(bins: number): readonly number[] {
    return Array.from({ length: Math.max(1, Math.round(bins)) }, () => 0);
  }

  getTrackSpectrum(_trackId: string, bins: number): readonly number[] {
    return Array.from({ length: Math.max(1, Math.round(bins)) }, () => 0);
  }

  getTrackLevel(_trackId: string): number {
    return -120;
  }

  getBusLevel(_busId: string): number {
    return -120;
  }

  getAudioStats(): {
    readonly underruns: number;
    readonly underrunDuration: number;
    readonly totalDuration: number;
  } | null {
    return null;
  }

  listPlugins(): readonly PluginDefinition[] {
    return this.pluginDefinitions;
  }

  listInstruments(): readonly PluginDefinition[] {
    return builtinInstruments.map(instrument => instrument.definition);
  }

  setTrackInserts(
    trackId: string,
    inserts: readonly InsertConfig[]
  ): Promise<void> {
    this.parameterEvents.push({
      time: 0,
      apply: core => core.updateTrack(trackId, { inserts })
    });
    return Promise.resolve();
  }

  setInsertParam(
    trackId: string,
    insertId: string,
    param: string,
    value: number,
    time = 0
  ): void {
    this.parameterEvents.push({
      time,
      apply: core => core.setInsertParam(trackId, insertId, param, value)
    });
  }

  setInsertBypass(
    trackId: string,
    insertId: string,
    bypass: boolean
  ): void {
    const insert = this.graph.tracks
      .find(track => track.id === trackId)
      ?.inserts.find(entry => entry.id === insertId);
    if (!insert) return;
    this.parameterEvents.push({
      time: 0,
      apply: core => {
        const track = this.graph.tracks.find(entry => entry.id === trackId);
        const inserts = (track?.inserts ?? []).map(entry =>
          entry.id === insertId ? { ...entry, bypass } : entry
        );
        core.updateTrack(trackId, { inserts });
      }
    });
  }

  supportsAudioModulation(_target: ModulationTarget): boolean {
    return false;
  }

  setAudioModulation(
    _routeId: string,
    _source: { readonly rate: number; readonly shape: LfoShape },
    _target: ModulationTarget,
    _amount: number,
    _bipolar: boolean
  ): void {}

  removeAudioModulation(_routeId: string): void {}

  clearAudioModulations(): void {}


}

export class CoreOfflineRenderer implements AudioExportPort {
  constructor(private readonly quality: CoreQualityMode = 'full') {}

  async render(
    state: InstrumentState,
    options: { readonly bars: number; readonly tailSeconds: number }
  ): Promise<Blob> {
    const bpm = state.transport.bpm;
    const stepSeconds = 60 / bpm / 4;
    const duration =
      options.bars * 16 * stepSeconds + options.tailSeconds;
    const graphConfig = createEspiralGraph(
      state.kit,
      state.masterVolume,
      state.masterEq
    );
    const sampleLoader = new CoreSampleLoader(
      new OfflineAudioContext(1, 1, SAMPLE_RATE)
    );
    const samples = new Map<string, Promise<CoreSample>>();

    const loadSample = (url: string): Promise<CoreSample> => {
      const existing = samples.get(url);
      if (existing) return existing;
      const promise = (async () => {
        return sampleLoader.load(url);
      })();
      samples.set(url, promise);
      return promise;
    };

    const coreGraph = await buildCoreGraph(graphConfig, loadSample);
    const recording = new RecordingEngine(graphConfig);
    const store = new Store(state);
    const clock = new OfflineClock(bpm);
    const status = new NullStatus();
    const runtime = new PlaybackRuntime();
    const generative = new UmbralGenerative();
    const automation = new AutomationService(store, recording, status);
    const evolver = { evolve(): void {} };
    const clips = new ClipService(store, runtime, status);
    const playback = new PlaybackService(
      store,
      clock,
      recording,
      generative,
      status,
      automation,
      evolver,
      clips,
      runtime
    );

    await playback.start();
    for (let step = 0; step < options.bars * 16; step += 1) {
      clock.fire(step * stepSeconds, step);
    }

    const core = new AudioCore(coreGraph, SAMPLE_RATE, state.seed);
    core.setQuality(this.quality);
    recording.soundEvents.forEach(event => {
      const coreEvent = toCoreEvent(event, bpm, 0);
      if (coreEvent) core.schedule(coreEvent);
    });

    const parameterEvents = [...recording.getParameterEvents()].sort(
      (left, right) => left.time - right.time
    );
    let parameterCursor = 0;
    const frames = Math.round(duration * SAMPLE_RATE);
    const left = new Float32Array(frames);
    const right = new Float32Array(frames);

    for (let offset = 0; offset < frames; offset += BLOCK_SIZE) {
      const blockFrames = Math.min(BLOCK_SIZE, frames - offset);
      const blockTime = offset / SAMPLE_RATE;
      while (
        parameterCursor < parameterEvents.length &&
        (parameterEvents[parameterCursor]?.time ?? Infinity) <= blockTime
      ) {
        parameterEvents[parameterCursor]?.apply(core);
        parameterCursor += 1;
      }
      core.render(
        left.subarray(offset, offset + blockFrames),
        right.subarray(offset, offset + blockFrames)
      );
    }

    sampleLoader.dispose();
    const bytes = encodeWav([left, right], SAMPLE_RATE);
    const payload = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    return new Blob([payload], { type: 'audio/wav' });
  }
}

async function buildCoreGraph(
  config: GraphConfig,
  loadSample: (url: string) => Promise<CoreSample>
): Promise<CoreGraph> {
  const tracks = await Promise.all(
    config.tracks.map(async (track): Promise<CoreTrackConfig> => ({
      id: track.id,
      machine: track.machine,
      samples:
        track.machine.kind === 'sampler'
          ? await Promise.all((track.machine.samples ?? []).map(loadSample))
          : [],
      inserts: track.inserts,
      sends: track.sends,
      outputBusId: track.outputBusId,
      gainDb: track.gainDb,
      pan: track.pan,
      mute: track.mute,
      solo: track.solo
    }))
  );

  return {
    tracks,
    buses: config.buses.map(
      (bus): CoreBusConfig => ({
        id: bus.id,
        returnDb: bus.returnDb,
        inserts: bus.inserts,
        sends: bus.sends
      })
    ),
    sidechain: config.sidechain,
    master: {
      volumeDb: config.master.volumeDb,
      limiterDb: config.master.limiterDb,
      trimDb: config.master.trimDb,
      lookaheadMs: 5,
      eq: config.master.eq,
      glue: config.master.glue
    }
  };
}
