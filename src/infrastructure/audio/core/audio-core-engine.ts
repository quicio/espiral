import type { EffectKind, NoteDuration, SoundEvent } from '../../../domain/audio';
import type {
  BusConfig,
  EqSettings,
  GraphConfig,
  InsertConfig,
  MachineConfig,
  SendConfig,
  TrackConfig
} from '../../../domain/graph';
import type { BusState } from '../../../domain/kit';
import type { LfoShape, ModulationTarget } from '../../../domain/modulation';
import type { PluginDefinition } from '../../../domain/plugin';
import type { AudioEnginePort, ClockPort, StepListener } from '../../../domain/ports';
import type { SidechainConfig } from '../../../domain/sidechain';
import { builtinPlugins } from '../plugins/builtins';
import { builtinInstruments } from '../plugins/instruments';
import { CoreSampleLoader } from './sample-loader';
import { noteToMidi, noteSeconds, toCoreEvent } from './convert';
import type { CoreQualityMode } from './types';
import type {
  CoreBusConfig,
  CoreGraph,
  CoreMasterConfig,
  CoreSample,
  CoreTrackConfig
} from './types';
import workletUrl from './audio-core.worklet.ts?worker&url';

type Message =
  | { readonly type: 'ready'; readonly startTime: number }
  | {
      readonly type: 'level';
      readonly master: number;
      readonly tracks?: Readonly<Record<string, number>>;
      readonly buses?: Readonly<Record<string, number>>;
      readonly spectrumMaster?: readonly number[];
      readonly spectrumTrack?: readonly number[];
      readonly spectrumTrackId?: string | null;
      readonly renderMs?: number;
      readonly renderMaxMs?: number;
      readonly overBudget?: number;
      readonly overrunMs?: number;
      readonly totalMs?: number;
    }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'step'; readonly step: number; readonly time: number };

type MixPatch = {
  readonly gainDb?: number;
  readonly pan?: number;
  readonly mute?: boolean;
  readonly solo?: boolean;
};

type RoutingPatch = {
  readonly inserts?: readonly InsertConfig[];
  readonly sends?: readonly SendConfig[];
  readonly outputBusId?: string | null;
};

const READY_TIMEOUT_MS = 10_000;

export class AudioCoreEngine implements AudioEnginePort, ClockPort {
  readonly supportsInserts = true;
  readonly supportsTrackManagement = true;
  readonly supportsRouting = true;
  readonly supportsMachineChange = true;

  private readonly pluginDefinitions: readonly PluginDefinition[] = builtinPlugins
    .filter(plugin => plugin.definition.id !== 'worklet-drive')
    .map(plugin => plugin.definition);
  private sampleLoader: CoreSampleLoader | null = null;
  private readonly samples = new Map<string, Promise<CoreSample>>();
  private trackConfigs: Map<string, TrackConfig>;
  private readonly busConfigs = new Map<string, BusConfig>();
  private readonly coreTracks = new Map<string, CoreTrackConfig>();
  private readonly machineOverrides = new Map<string, MachineConfig>();
  private readonly mixOverrides = new Map<string, MixPatch>();
  private readonly insertOverrides = new Map<string, readonly InsertConfig[]>();
  private readonly sendOverrides = new Map<string, readonly SendConfig[]>();
  private readonly outputOverrides = new Map<string, string | undefined>();
  private readonly stepListeners = new Set<StepListener>();
  private bpm: number;
  private lookAhead: number;
  private readonly trackLevels = new Map<string, number>();
  private readonly busLevels = new Map<string, number>();
  private masterSpectrum: readonly number[] = [];
  private trackSpectrum: readonly number[] = [];
  private requestedSpectrumTrack: string | null = null;
  private audioStats = {
    underruns: 0,
    underrunDuration: 0,
    totalDuration: 0
  };
  private masterConfig: CoreMasterConfig;
  private configSidechain: SidechainConfig | undefined;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private quality: CoreQualityMode;
  private node: AudioWorkletNode | null = null;
  private context: AudioContext | null = null;
  private origin = 0;
  private masterLevel = 0;
  private prepared = false;
  private preparing: Promise<void> | null = null;
  private syncChain: Promise<void> = Promise.resolve();

  constructor(
    config: GraphConfig,
    bpm = 120,
    lookAhead = 0.15,
    quality: CoreQualityMode = 'full'
  ) {
    this.bpm = bpm;
    this.lookAhead = lookAhead;
    this.quality = quality;
    this.trackConfigs = new Map(config.tracks.map(track => [track.id, track]));
    config.buses.forEach(bus => this.busConfigs.set(bus.id, bus));
    this.masterConfig = {
      volumeDb: config.master.volumeDb,
      limiterDb: config.master.limiterDb,
      trimDb: config.master.trimDb,
      lookaheadMs: 5,
      eq: config.master.eq,
      glue: config.master.glue
    };
    this.configSidechain = config.sidechain;
  }

  async start(): Promise<void> {
    this.node?.port.postMessage({
      type: 'transport',
      running: true,
      bpm: this.bpm,
      lookAhead: this.lookAhead
    });
  }

  setQuality(mode: CoreQualityMode): void {
    this.quality = mode;
    this.node?.port.postMessage({ type: 'quality', mode });
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
    this.node?.port.postMessage({ type: 'transport-bpm', bpm });
  }

  getBpm(): number {
    return this.bpm;
  }

  setLookAhead(seconds: number): void {
    this.lookAhead = Math.max(0, Math.min(0.5, seconds));
    this.node?.port.postMessage({
      type: 'transport-lookahead',
      lookAhead: this.lookAhead
    });
  }

  getLookAhead(): number {
    return this.lookAhead;
  }

  now(): number {
    return this.context?.currentTime ?? 0;
  }

  onStep(listener: StepListener): () => void {
    this.stepListeners.add(listener);
    return () => this.stepListeners.delete(listener);
  }

  prepare(): Promise<void> {
    if (this.prepared) return Promise.resolve();
    if (this.preparing) return this.preparing;
    this.preparing = this.prepareInternal()
      .catch(error => {
        this.node?.disconnect();
        this.node?.port.close();
        this.node = null;
        this.prepared = false;
        void this.context?.close();
        this.context = null;
        throw error;
      })
      .finally(() => {
        this.preparing = null;
      });
    return this.preparing;
  }

  stop(): void {
    this.node?.port.postMessage({ type: 'transport', running: false });
    this.node?.port.postMessage({ type: 'stop' });
    this.masterLevel = 0;
    this.trackLevels.clear();
    this.busLevels.clear();
  }

  dispose(): void {
    this.stepListeners.clear();
    if (this.previewTimer !== null) {
      globalThis.clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    this.node?.disconnect();
    this.node?.port.close();
    this.node = null;
    this.prepared = false;
    void this.context?.close();
    this.context = null;
    this.sampleLoader?.dispose();
    this.sampleLoader = null;
  }

  addTrack(track: TrackConfig): void {
    this.trackConfigs.set(track.id, track);
    this.enqueue(async () => {
      if (!this.node || this.coreTracks.has(track.id)) return;
      const coreTrack = await this.toCoreTrack(track);
      this.node.port.postMessage({ type: 'add-track', track: coreTrack });
      this.coreTracks.set(track.id, coreTrack);
    });
  }

  removeTrack(trackId: string): void {
    this.trackConfigs.delete(trackId);
    this.enqueue(() => {
      this.node?.port.postMessage({ type: 'remove-track', trackId });
      this.coreTracks.delete(trackId);
      this.mixOverrides.delete(trackId);
      this.insertOverrides.delete(trackId);
      this.sendOverrides.delete(trackId);
      this.outputOverrides.delete(trackId);
      this.machineOverrides.delete(trackId);
    });
  }

  syncTracks(tracks: readonly TrackConfig[]): void {
    this.trackConfigs = new Map(tracks.map(track => [track.id, track]));
    this.enqueue(async () => {
      if (!this.node) return;
      const desired = new Set(tracks.map(track => track.id));
      for (const trackId of [...this.coreTracks.keys()]) {
        if (desired.has(trackId)) continue;
        this.node.port.postMessage({ type: 'remove-track', trackId });
        this.coreTracks.delete(trackId);
      }
      for (const track of tracks) {
        this.machineOverrides.delete(track.id);
        this.insertOverrides.delete(track.id);
        this.sendOverrides.delete(track.id);
        this.outputOverrides.delete(track.id);
        const current = this.coreTracks.get(track.id);
        if (!current) {
          const coreTrack = await this.toCoreTrack(track);
          this.node.port.postMessage({ type: 'add-track', track: coreTrack });
          this.coreTracks.set(track.id, coreTrack);
          continue;
        }
        if (JSON.stringify(current.machine) !== JSON.stringify(track.machine)) {
          const coreTrack = await this.toCoreTrack(track);
          this.node.port.postMessage({
            type: 'machine',
            trackId: track.id,
            machine: coreTrack.machine,
            samples: coreTrack.samples ?? []
          });
          this.coreTracks.set(track.id, coreTrack);
          continue;
        }
        const routingChanged =
          JSON.stringify(current.inserts ?? []) !==
            JSON.stringify(track.inserts ?? []) ||
          JSON.stringify(current.sends ?? []) !==
            JSON.stringify(track.sends ?? []) ||
          current.outputBusId !== track.outputBusId;
        if (routingChanged) {
          const patch: RoutingPatch = {
            inserts: track.inserts,
            sends: track.sends,
            outputBusId: track.outputBusId ?? null
          };
          this.node.port.postMessage({ type: 'mix', trackId: track.id, patch });
          this.coreTracks.set(track.id, {
            ...current,
            inserts: track.inserts,
            sends: track.sends,
            outputBusId: track.outputBusId
          });
        }
        this.applyMix(track.id, track);
      }
    });
  }

  setTrackMachine(trackId: string, machine: MachineConfig): void {
    this.machineOverrides.set(trackId, machine);
    const current = this.coreTracks.get(trackId);
    if (!current) return;
    this.enqueue(async () => {
      if (!this.node) return;
      const samples =
        machine.kind === 'sampler'
          ? await this.loadSamples(machine.samples ?? [])
          : [];
      const coreTrack: CoreTrackConfig = {
        ...current,
        machine,
        samples
      };
      this.node.port.postMessage({
        type: 'machine',
        trackId,
        machine,
        samples
      });
      this.coreTracks.set(trackId, coreTrack);
    });
  }

  setTrackOutput(trackId: string, outputBusId?: string): void {
    this.outputOverrides.set(trackId, outputBusId);
    const current = this.coreTracks.get(trackId);
    if (!current) return;
    this.coreTracks.set(trackId, { ...current, outputBusId });
    this.enqueue(() => {
      this.node?.port.postMessage({
        type: 'mix',
        trackId,
        patch: { outputBusId: outputBusId ?? null }
      });
    });
  }

  setSidechain(config?: SidechainConfig): void {
    this.configSidechain = config;
    this.node?.port.postMessage({ type: 'sidechain', sidechain: config });
  }

  addBus(bus: BusConfig): void {
    this.busConfigs.set(bus.id, bus);
    this.enqueue(() => {
      this.node?.port.postMessage({
        type: 'add-bus',
        bus: toCoreBus(bus)
      });
    });
  }

  removeBus(busId: string): void {
    this.busConfigs.delete(busId);
    this.enqueue(() => {
      this.node?.port.postMessage({ type: 'remove-bus', busId });
    });
  }

  syncBuses(buses: readonly BusConfig[]): void {
    const previous = new Set(this.busConfigs.keys());
    const next = new Map(buses.map(bus => [bus.id, bus]));
    this.busConfigs.clear();
    next.forEach((bus, id) => this.busConfigs.set(id, bus));
    this.enqueue(() => {
      if (!this.node) return;
      for (const busId of previous) {
        if (!next.has(busId)) {
          this.node.port.postMessage({ type: 'remove-bus', busId });
        }
      }
      for (const bus of buses) {
        if (!previous.has(bus.id)) {
          this.node.port.postMessage({ type: 'add-bus', bus: toCoreBus(bus) });
        }
        this.node.port.postMessage({
          type: 'bus-return',
          busId: bus.id,
          db: bus.returnDb
        });
        this.node.port.postMessage({
          type: 'bus-inserts',
          busId: bus.id,
          inserts: bus.inserts
        });
      }
    });
  }

  trigger(event: SoundEvent): void {
    if (!this.node || !this.prepared) return;
    const coreEvent = toCoreEvent(event, this.bpm, this.origin);
    if (!coreEvent) return;
    this.node.port.postMessage({ type: 'event', event: coreEvent });
  }

  previewMachine(
    machine: MachineConfig,
    notes: readonly string[],
    duration?: NoteDuration
  ): void {
    if (!this.prepared) {
      void this.prepare()
        .then(() => {
          if (this.prepared) this.previewMachine(machine, notes, duration);
        })
        .catch(error => {
          console.error('AudioCore: no se pudo preparar el preview:', error);
        });
      return;
    }
    if (!this.node) return;
    const midi = notes
      .map(note => noteToMidi(note))
      .filter((note): note is number => note !== null);
    const seconds = noteSeconds(duration ?? '8n', this.bpm);

    this.enqueue(async () => {
      if (!this.node) return;
      const trackId = '__preview__';
      const samples =
        machine.kind === 'sampler'
          ? await this.loadSamples(machine.samples ?? [])
          : [];
      this.node.port.postMessage({ type: 'remove-track', trackId });
      this.node.port.postMessage({
        type: 'add-track',
        track: {
          id: trackId,
          machine,
          samples,
          gainDb: -6,
          pan: 0,
          mute: false,
          solo: false
        }
      });
      if (machine.kind === 'membrane') {
        this.node.port.postMessage({
          type: 'event',
          event: { type: 'kick', trackId, time: 0, velocity: 1 }
        });
      } else if (machine.kind === 'sampler') {
        this.node.port.postMessage({
          type: 'event',
          event: {
            type: 'sample',
            trackId,
            time: 0,
            sampleIndex: 0,
            playbackRate: 1,
            duration: seconds,
            gainDb: 0
          }
        });
      } else if (midi.length > 0) {
        this.node.port.postMessage({
          type: 'event',
          event: {
            type: 'synth',
            trackId,
            time: 0,
            notes: midi,
            duration: seconds,
            velocity: 1
          }
        });
      }
      if (this.previewTimer !== null) globalThis.clearTimeout(this.previewTimer);
      this.previewTimer = globalThis.setTimeout(() => {
        this.previewTimer = null;
        this.node?.port.postMessage({ type: 'remove-track', trackId });
      }, Math.max(2_500, Math.round(seconds * 1_000) + 1_500));
    });
  }

  setChannelVolume(trackId: string, db: number, _time?: number): void {
    this.setMix(trackId, { gainDb: db });
  }

  setChannelPan(trackId: string, pan: number, _time?: number): void {
    this.setMix(trackId, { pan });
  }

  setChannelMute(trackId: string, muted: boolean): void {
    this.setMix(trackId, { mute: muted });
  }

  setTrackSend(
    trackId: string,
    busId: string,
    amount: number,
    preFader: boolean
  ): void {
    const current = this.coreTracks.get(trackId);
    const base =
      this.sendOverrides.get(trackId) ??
      current?.sends ??
      this.trackConfigs.get(trackId)?.sends ??
      [];
    const sends = [...base];
    const index = sends.findIndex(send => send.busId === busId);
    if (amount <= 0) {
      if (index >= 0) sends.splice(index, 1);
    } else if (index >= 0) {
      sends[index] = { busId, amount, preFader };
    } else {
      sends.push({ busId, amount, preFader });
    }
    this.sendOverrides.set(trackId, sends);
    if (current) {
      this.coreTracks.set(trackId, { ...current, sends });
    }
    this.enqueue(() => {
      this.node?.port.postMessage({
        type: 'mix',
        trackId,
        patch: { sends }
      });
    });
  }

  setBusReturn(busId: string, db: number): void {
    const bus = this.busConfigs.get(busId);
    if (bus) this.busConfigs.set(busId, { ...bus, returnDb: db });
    this.enqueue(() => {
      this.node?.port.postMessage({ type: 'bus-return', busId, db });
    });
  }

  setBusSend(fromBusId: string, toBusId: string, amount: number): void {
    const bus = this.busConfigs.get(fromBusId);
    if (!bus) return;
    const sends = [...(bus.sends ?? [])];
    const index = sends.findIndex(send => send.busId === toBusId);
    if (amount <= 0) {
      if (index >= 0) sends.splice(index, 1);
    } else if (index >= 0) {
      sends[index] = { busId: toBusId, amount, preFader: false };
    } else {
      sends.push({ busId: toBusId, amount, preFader: false });
    }
    this.busConfigs.set(fromBusId, { ...bus, sends });
    this.enqueue(() => {
      this.node?.port.postMessage({ type: 'bus-sends', busId: fromBusId, sends });
    });
  }

  syncBusSends(buses: readonly BusState[]): void {
    buses.forEach(bus => {
      const current = this.busConfigs.get(bus.id);
      if (current) this.busConfigs.set(bus.id, { ...current, sends: bus.sends });
      this.enqueue(() => {
        this.node?.port.postMessage({
          type: 'bus-sends',
          busId: bus.id,
          sends: bus.sends
        });
      });
    });
  }

  setBusInserts(
    busId: string,
    inserts: readonly InsertConfig[]
  ): Promise<void> {
    const bus = this.busConfigs.get(busId);
    if (bus) this.busConfigs.set(busId, { ...bus, inserts });
    this.enqueue(() => {
      this.node?.port.postMessage({ type: 'bus-inserts', busId, inserts });
    });
    return Promise.resolve();
  }

  setEffectWet(
    trackId: string,
    effect: EffectKind,
    wet: number,
    _time?: number
  ): void {
    const insert = this.coreTracks
      .get(trackId)
      ?.inserts?.find(entry => entry.pluginId === effect);
    if (insert) this.setInsertParam(trackId, insert.id, 'wet', wet);
  }

  setMasterVolume(db: number, _time?: number): void {
    this.masterConfig = { ...this.masterConfig, volumeDb: db };
    this.node?.port.postMessage({
      type: 'master',
      master: this.masterConfig
    });
  }

  setMasterEq(eq: EqSettings): void {
    this.masterConfig = { ...this.masterConfig, eq };
    this.node?.port.postMessage({
      type: 'master',
      master: this.masterConfig
    });
  }

  beginTransition(_fadeOutMs?: number): void {
    this.node?.port.postMessage({ type: 'transition', fadeOut: true });
  }

  endTransition(_fadeInMs?: number): void {
    this.node?.port.postMessage({ type: 'transition', fadeOut: false });
  }

  getMasterLevel(): number {
    return linearToDb(this.masterLevel);
  }

  getMasterSpectrum(bins: number): readonly number[] {
    return resampleSpectrum(this.masterSpectrum, bins);
  }

  getTrackSpectrum(trackId: string, bins: number): readonly number[] {
    if (trackId !== this.requestedSpectrumTrack) {
      this.requestedSpectrumTrack = trackId;
      this.trackSpectrum = [];
      this.enqueue(() => {
        this.node?.port.postMessage({ type: 'spectrum-target', trackId });
      });
    }
    return resampleSpectrum(this.trackSpectrum, bins);
  }

  getTrackLevel(trackId: string): number {
    return linearToDb(this.trackLevels.get(trackId) ?? 0);
  }

  getBusLevel(busId: string): number {
    return linearToDb(this.busLevels.get(busId) ?? 0);
  }

  getAudioStats(): {
    readonly underruns: number;
    readonly underrunDuration: number;
    readonly totalDuration: number;
  } | null {
    return this.audioStats;
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
    this.insertOverrides.set(trackId, inserts);
    const current = this.coreTracks.get(trackId);
    if (current) {
      this.coreTracks.set(trackId, { ...current, inserts });
    }
    this.enqueue(() => {
      this.node?.port.postMessage({
        type: 'mix',
        trackId,
        patch: { inserts }
      });
    });
    return Promise.resolve();
  }

  setInsertParam(
    trackId: string,
    insertId: string,
    param: string,
    value: number,
    _time?: number
  ): void {
    this.enqueue(() => {
      this.node?.port.postMessage({
        type: 'insert-param',
        trackId,
        insertId,
        param,
        value
      });
    });
  }

  setInsertBypass(
    trackId: string,
    insertId: string,
    bypass: boolean
  ): void {
    const current = this.coreTracks.get(trackId);
    if (!current) return;
    const inserts = (current.inserts ?? []).map(insert =>
      insert.id === insertId ? { ...insert, bypass } : insert
    );
    this.insertOverrides.set(trackId, inserts);
    this.coreTracks.set(trackId, { ...current, inserts });
    this.enqueue(() => {
      this.node?.port.postMessage({
        type: 'mix',
        trackId,
        patch: { inserts }
      });
    });
  }

  supportsAudioModulation(target: ModulationTarget): boolean {
    return this.resolveAudioTarget(target) !== null;
  }

  setAudioModulation(
    routeId: string,
    source: { readonly rate: number; readonly shape: LfoShape },
    target: ModulationTarget,
    amount: number,
    bipolar: boolean
  ): void {
    const resolved = this.resolveAudioTarget(target);
    if (!resolved) return;
    this.enqueue(() => {
      this.node?.port.postMessage({
        type: 'audio-modulation',
        route: {
          id: routeId,
          trackId: target.trackId,
          insertId: target.insertId,
          param: target.paramId,
          rate: source.rate,
          shape: source.shape,
          amount,
          bipolar,
          min: resolved.descriptor.min,
          max: resolved.descriptor.max,
          base: resolved.base
        }
      });
    });
  }

  removeAudioModulation(routeId: string): void {
    this.enqueue(() => {
      this.node?.port.postMessage({ type: 'remove-audio-modulation', routeId });
    });
  }

  clearAudioModulations(): void {
    this.enqueue(() => {
      this.node?.port.postMessage({ type: 'clear-audio-modulations' });
    });
  }

  private resolveAudioTarget(
    target: ModulationTarget
  ): {
    descriptor: PluginDefinition['params'][number];
    base: number;
  } | null {
    const insert = this.coreTracks
      .get(target.trackId)
      ?.inserts?.find(entry => entry.id === target.insertId);
    if (!insert) return null;
    const definition = this.pluginDefinitions.find(
      entry => entry.id === insert.pluginId
    );
    const descriptor = definition?.params.find(
      entry => entry.id === target.paramId
    );
    if (!descriptor) return null;
    return {
      descriptor,
      base: insert.params[target.paramId] ?? descriptor.defaultValue
    };
  }

  private async prepareInternal(): Promise<void> {
    const context = new AudioContext({
      sampleRate: 48_000,
      latencyHint: 'interactive'
    });
    this.context = context;
    if (context.state !== 'running') await context.resume();
    if (!context.audioWorklet) {
      throw new Error('AudioCore necesita AudioWorklet.');
    }
    await context.audioWorklet.addModule(workletUrl);

    const tracks = await Promise.all(
      [...this.trackConfigs.values()].map(track => this.toCoreTrack(track))
    );
    const graph: CoreGraph = {
      tracks,
      buses: [...this.busConfigs.values()].map(toCoreBus),
      sidechain: this.configSidechain,
      master: this.masterConfig
    };

    const node = new AudioWorkletNode(context, 'espiral-core', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });
    this.node = node;
    node.onprocessorerror = event => {
      const detail =
        event.error instanceof Error
          ? event.error.stack ?? event.error.message
          : event.message;
      console.error('AudioCore processor error:', detail);
    };
    node.connect(context.destination);
    this.coreTracks.clear();
    tracks.forEach(track => this.coreTracks.set(track.id, track));

    const ready = new Promise<number>((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => {
        reject(new Error('AudioCore no respondió a tiempo.'));
      }, READY_TIMEOUT_MS);
      node.port.onmessage = (event: MessageEvent<Message>) => {
        const data = event.data;
        if (data.type === 'ready') {
          globalThis.clearTimeout(timeout);
          resolve(data.startTime);
          return;
        }
        if (data.type === 'error') {
          globalThis.clearTimeout(timeout);
          reject(new Error(data.message));
          return;
        }
        if (data.type === 'step') {
          for (const listener of this.stepListeners) {
            listener(data.time, data.step);
          }
          return;
        }
        if (data.type === 'level') {
          this.masterLevel = data.master;
          if (data.tracks) {
            this.trackLevels.clear();
            Object.entries(data.tracks).forEach(([id, level]) =>
              this.trackLevels.set(id, level)
            );
          }
          if (data.buses) {
            this.busLevels.clear();
            Object.entries(data.buses).forEach(([id, level]) =>
              this.busLevels.set(id, level)
            );
          }
          if (data.spectrumMaster) {
            this.masterSpectrum = data.spectrumMaster;
          }
          if (data.overBudget !== undefined) {
            this.audioStats = {
              underruns: data.overBudget,
              underrunDuration: (data.overrunMs ?? 0) / 1000,
              totalDuration: (data.totalMs ?? 0) / 1000
            };
          }
          if (data.renderMs !== undefined) {
            (globalThis as { __espiralCoreLoad?: unknown }).__espiralCoreLoad = {
              renderMs: data.renderMs,
              renderMaxMs: data.renderMaxMs,
              overBudget: data.overBudget,
              totalMs: data.totalMs
            };
          }
          if (
            data.spectrumTrack &&
            data.spectrumTrackId === this.requestedSpectrumTrack
          ) {
            this.trackSpectrum = data.spectrumTrack;
          }
        }
      };
    });

    node.port.postMessage({ type: 'load', graph });
    node.port.postMessage({ type: 'quality', mode: this.quality });
    this.origin = await ready;
    this.prepared = true;
    if (this.requestedSpectrumTrack) {
      node.port.postMessage({
        type: 'spectrum-target',
        trackId: this.requestedSpectrumTrack
      });
    }
  }

  private setMix(trackId: string, patch: MixPatch): void {
    const merged = { ...(this.mixOverrides.get(trackId) ?? {}), ...patch };
    this.mixOverrides.set(trackId, merged);
    const current = this.coreTracks.get(trackId);
    if (current) {
      this.coreTracks.set(trackId, { ...current, ...patch });
    }
    this.enqueue(() => {
      this.node?.port.postMessage({ type: 'mix', trackId, patch });
    });
  }

  private applyMix(trackId: string, track: TrackConfig): void {
    const patch: MixPatch = {
      gainDb: track.gainDb,
      pan: track.pan,
      mute: track.mute,
      solo: track.solo
    };
    const current = this.coreTracks.get(trackId);
    if (!current) return;
    this.coreTracks.set(trackId, { ...current, ...patch });
    this.enqueue(() => {
      this.node?.port.postMessage({ type: 'mix', trackId, patch });
    });
  }

  private async toCoreTrack(track: TrackConfig): Promise<CoreTrackConfig> {
    const machine = this.machineOverrides.get(track.id) ?? track.machine;
    const samples =
      machine.kind === 'sampler'
        ? await this.loadSamples(machine.samples ?? [])
        : [];
    const override = this.mixOverrides.get(track.id);
    const inserts = this.insertOverrides.get(track.id) ?? track.inserts;
    const sends = this.sendOverrides.get(track.id) ?? track.sends;
    const outputBusId = this.outputOverrides.has(track.id)
      ? this.outputOverrides.get(track.id)
      : track.outputBusId;
    return {
      id: track.id,
      machine,
      samples,
      inserts,
      sends,
      outputBusId,
      gainDb: override?.gainDb ?? track.gainDb,
      pan: override?.pan ?? track.pan,
      mute: override?.mute ?? track.mute,
      solo: override?.solo ?? track.solo
    };
  }

  private loadSamples(urls: readonly string[]): Promise<CoreSample[]> {
    return Promise.all(
      urls.map(async url => {
        const existing = this.samples.get(url);
        if (existing) return existing;
        const promise = (async (): Promise<CoreSample> => {
          if (!this.context) throw new Error('AudioCore sin contexto.');
          const loader =
            this.sampleLoader ??
            (this.sampleLoader = new CoreSampleLoader(this.context));
          return loader.load(url);
        })();
        this.samples.set(url, promise);
        return promise;
      })
    );
  }

  private enqueue(task: () => void | Promise<void>): void {
    this.syncChain = this.syncChain
      .then(task)
      .catch(error => {
        console.error('AudioCore: no se pudo aplicar el cambio:', error);
      });
  }
}

function toCoreBus(bus: BusConfig): CoreBusConfig {
  return {
    id: bus.id,
    returnDb: bus.returnDb,
    inserts: bus.inserts,
    sends: bus.sends
  };
}

function linearToDb(value: number): number {
  return value > 0 ? 20 * Math.log10(value) : -120;
}

function resampleSpectrum(
  source: readonly number[],
  bins: number
): readonly number[] {
  const count = Math.max(1, Math.round(bins));
  if (source.length === 0) {
    return Array.from({ length: count }, () => 0);
  }
  return Array.from({ length: count }, (_, index) => {
    const position = Math.round((index / Math.max(1, count - 1)) * (source.length - 1));
    return source[position] ?? 0;
  });
}

