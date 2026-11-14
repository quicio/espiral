import type { MachineConfig } from '../../../domain/graph';
import type { LfoShape } from '../../../domain/modulation';
import type { SidechainConfig } from '../../../domain/sidechain';
import { InsertChain } from './effects/insert-chain';
import type { StereoFrame } from './effects/effect';
import { createInstrument } from './instruments/create-instrument';
import type { CoreInstrument } from './instruments/instrument';
import { MasterBus } from './master';
import type {
  CoreBusConfig,
  CoreEvent,
  CoreGraph,
  CoreKickEvent,
  CoreAudioModulationConfig,
  CoreSample,
  CoreSampleEvent,
  CoreSynthEvent,
  CoreQualityMode,
  CoreTrackConfig
} from './types';

interface ScheduledKick extends CoreKickEvent {
  readonly frame: number;
  readonly seed: number;
  readonly velocity: number;
}

interface ScheduledSynth extends CoreSynthEvent {
  readonly frame: number;
  readonly seed: number;
  readonly velocity: number;
  readonly accent: boolean;
  readonly slide: boolean;
}

interface ScheduledSample extends CoreSampleEvent {
  readonly frame: number;
  readonly seed: number;
  readonly sampleIndex: number;
  readonly playbackRate: number;
  readonly gainDb: number;
}

type ScheduledEvent = ScheduledKick | ScheduledSynth | ScheduledSample;

interface TrackNode {
  readonly id: string;
  instrument: CoreInstrument;
  machine: MachineConfig;
  samples: readonly CoreSample[];
  inserts: InsertChain;
  sends: CoreTrackConfig['sends'];
  outputBusId: string | undefined;
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  panLeft: number;
  panRight: number;
  levelPeak: number;
}

interface BusNode {
  readonly id: string;
  inserts: InsertChain;
  sends: CoreBusConfig['sends'];
  returnGain: number;
  inputLeft: number;
  inputRight: number;
  levelPeak: number;
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function panGains(pan: number): { left: number; right: number } {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return { left: Math.cos(angle), right: Math.sin(angle) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function modulationWave(shape: LfoShape, phase: number): number {
  if (shape === 'square') return phase < 0.5 ? 1 : -1;
  if (shape === 'saw') return phase * 2 - 1;
  if (shape === 'triangle') {
    const x = phase * 4;
    if (x < 1) return x;
    if (x < 3) return 2 - x;
    return x - 4;
  }
  return Math.sin(phase * Math.PI * 2);
}

export class AudioCore {
  private readonly sampleRate: number;
  private readonly seed: number;
  private readonly tracks = new Map<string, TrackNode>();
  private readonly trackList: TrackNode[] = [];
  private readonly buses = new Map<string, BusNode>();
  private readonly busList: BusNode[] = [];
  private busOrder: BusNode[] = [];
  private readonly events: ScheduledEvent[] = [];
  private readonly frameBuffer: StereoFrame = { left: 0, right: 0 };
  private readonly spectrumBuffer = new Float32Array(128);
  private spectrumTrackId: string | null = null;
  private spectrumWrite = 0;
  private transitionFrom = 1;
  private transitionTo = 1;
  private transitionStart = 0;
  private transitionFrames = 0;
  private master: MasterBus;
  private sidechain: SidechainConfig | undefined;
  private quality: CoreQualityMode = 'full';
  private duckStartFrame = -1;
  private readonly audioModulations = new Map<
    string,
    Omit<CoreAudioModulationConfig, 'base'> & { base: number; phase: number }
  >();
  private frame = 0;

  constructor(graph: CoreGraph, sampleRate: number, seed = 0xc0ffee) {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error('AudioCore necesita un sample rate válido.');
    }
    this.sampleRate = sampleRate;
    this.seed = seed >>> 0;
    this.master = new MasterBus(graph.master, sampleRate);
    this.sidechain = graph.sidechain;

    const busIds = new Set<string>();
    (graph.buses ?? []).forEach(config => {
      if (busIds.has(config.id)) {
        throw new Error(`Bus duplicado: ${config.id}`);
      }
      busIds.add(config.id);
      this.createBus(config);
    });

    const trackIds = new Set<string>();
    graph.tracks.forEach(config => {
      if (trackIds.has(config.id)) {
        throw new Error(`Track duplicado: ${config.id}`);
      }
      trackIds.add(config.id);
      this.createTrack(config);
    });
  }

  get currentFrame(): number {
    return this.frame;
  }

  get currentTime(): number {
    return this.frame / this.sampleRate;
  }

  schedule(event: CoreEvent): void {
    if (!this.tracks.has(event.trackId)) return;
    const scheduled = this.toScheduled(event);
    if (!scheduled) return;

    let low = 0;
    let high = this.events.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if ((this.events[middle]?.frame ?? 0) <= scheduled.frame) low = middle + 1;
      else high = middle;
    }
    this.events.splice(low, 0, scheduled);
  }

  addTrack(config: CoreTrackConfig): void {
    if (this.tracks.has(config.id)) {
      throw new Error(`Track duplicado: ${config.id}`);
    }
    this.createTrack(config);
  }

  removeTrack(trackId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    track.instrument.stop();
    track.inserts.reset();
    this.tracks.delete(trackId);
    const index = this.trackList.indexOf(track);
    if (index >= 0) this.trackList.splice(index, 1);
  }

  setTrackMachine(
    trackId: string,
    machine: MachineConfig,
    samples: readonly CoreSample[] = []
  ): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    track.instrument.stop();
    track.instrument = createInstrument(
      {
        id: trackId,
        machine,
        samples,
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false
      },
      this.sampleRate
    );
    track.machine = machine;
    track.samples = samples;
    this.applyQuality(track);
  }

  addBus(config: CoreBusConfig): void {
    if (this.buses.has(config.id)) {
      throw new Error(`Bus duplicado: ${config.id}`);
    }
    this.createBus(config);
  }

  removeBus(busId: string): void {
    const bus = this.buses.get(busId);
    if (!bus) return;
    bus.inserts.reset();
    this.buses.delete(busId);
    const index = this.busList.indexOf(bus);
    if (index >= 0) this.busList.splice(index, 1);
    this.rebuildBusOrder();
  }

  syncBuses(buses: readonly CoreBusConfig[]): void {
    const desired = new Set(buses.map(bus => bus.id));
    for (const busId of [...this.buses.keys()]) {
      if (!desired.has(busId)) this.removeBus(busId);
    }
    for (const bus of buses) {
      if (!this.buses.has(bus.id)) this.createBus(bus);
    }
  }

  setBusInserts(busId: string, inserts: CoreBusConfig['inserts']): void {
    const bus = this.buses.get(busId);
    if (!bus) return;
    bus.inserts = new InsertChain(inserts, this.sampleRate);
    bus.inserts.setQuality(this.quality);
  }

  setBusSends(busId: string, sends: CoreBusConfig['sends']): void {
    const bus = this.buses.get(busId);
    if (!bus) return;
    bus.sends = sends;
    this.rebuildBusOrder();
  }

  setBusReturn(busId: string, db: number): void {
    const bus = this.buses.get(busId);
    if (bus) bus.returnGain = dbToGain(db);
  }

  setMaster(config: CoreGraph['master']): void {
    this.master = new MasterBus(config, this.sampleRate);
  }

  setInsertParam(
    trackId: string,
    insertId: string,
    param: string,
    value: number
  ): void {
    this.audioModulations.forEach(route => {
      if (
        route.trackId === trackId &&
        route.insertId === insertId &&
        route.param === param
      ) {
        route.base = value;
      }
    });
    this.tracks.get(trackId)?.inserts.setParam(insertId, param, value);
  }

  addAudioModulation(config: CoreAudioModulationConfig): void {
    this.audioModulations.set(config.id, { ...config, phase: 0 });
    this.applyAudioModulations();
  }

  removeAudioModulation(routeId: string): void {
    const route = this.audioModulations.get(routeId);
    if (!route) return;
    this.tracks
      .get(route.trackId)
      ?.inserts.setParam(route.insertId, route.param, route.base);
    this.audioModulations.delete(routeId);
  }

  clearAudioModulations(): void {
    [...this.audioModulations.keys()].forEach(routeId =>
      this.removeAudioModulation(routeId)
    );
  }

  setBusInsertParam(
    busId: string,
    insertId: string,
    param: string,
    value: number
  ): void {
    this.buses.get(busId)?.inserts.setParam(insertId, param, value);
  }

  setSidechain(config?: SidechainConfig): void {
    this.sidechain = config;
  }

  setQuality(mode: CoreQualityMode): void {
    this.quality = mode;
    this.trackList.forEach(track => {
      this.applyQuality(track);
      track.inserts.setQuality(mode);
    });
    this.busList.forEach(bus => bus.inserts.setQuality(mode));
  }

  beginTransition(fadeOutMs = 6): void {
    this.startTransition(0, fadeOutMs);
  }

  endTransition(fadeInMs = 30): void {
    this.startTransition(1, fadeInMs);
  }

  stop(): void {
    this.trackList.forEach(track => {
      track.instrument.stop();
      track.inserts.reset();
    });
    this.busList.forEach(bus => bus.inserts.reset());
  }

  updateTrack(
    trackId: string,
    patch: Partial<
      Pick<
        CoreTrackConfig,
        'gainDb' | 'pan' | 'mute' | 'solo' | 'inserts' | 'sends'
      >
    > & { readonly outputBusId?: string | null }
  ): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    if (patch.gainDb !== undefined) track.gain = dbToGain(patch.gainDb);
    if (patch.pan !== undefined) {
      track.pan = clamp(patch.pan, -1, 1);
      const gains = panGains(track.pan);
      track.panLeft = gains.left;
      track.panRight = gains.right;
    }
    if (patch.mute !== undefined) track.mute = patch.mute;
    if (patch.solo !== undefined) track.solo = patch.solo;
    if (patch.inserts !== undefined) {
      track.inserts = new InsertChain(patch.inserts, this.sampleRate);
      track.inserts.setQuality(this.quality);
    }
    if (patch.sends !== undefined) track.sends = patch.sends;
    if ('outputBusId' in patch) {
      track.outputBusId = patch.outputBusId ?? undefined;
    }
  }

  setSpectrumTrack(trackId: string | null): void {
    this.spectrumTrackId = trackId;
    this.spectrumWrite = 0;
    this.spectrumBuffer.fill(0);
  }

  getTrackSpectrumSamples(): Float32Array {
    return this.spectrumBuffer;
  }

  getTrackLevels(): Readonly<Record<string, number>> {
    return Object.fromEntries(
      this.trackList.map(track => [track.id, track.levelPeak])
    );
  }

  getBusLevels(): Readonly<Record<string, number>> {
    return Object.fromEntries(
      this.busList.map(bus => [bus.id, bus.levelPeak])
    );
  }

  render(left: Float32Array, right: Float32Array): void {
    const frames = Math.min(left.length, right.length);
    if (frames <= 0) return;

    const anySolo = this.trackList.some(track => track.solo);
    let consumed = 0;

    if (this.spectrumTrackId) {
      this.spectrumWrite = 0;
      this.spectrumBuffer.fill(0);
    }
    for (const track of this.trackList) track.levelPeak = 0;
    for (const bus of this.busList) {
      bus.levelPeak = 0;
      bus.inputLeft = 0;
      bus.inputRight = 0;
    }

    for (let index = 0; index < frames; index += 1) {
      if (this.frame % 128 === 0) this.applyAudioModulations();
      while (
        consumed < this.events.length &&
        (this.events[consumed]?.frame ?? Infinity) <= this.frame
      ) {
        const event = this.events[consumed];
        if (event) this.trigger(event);
        consumed += 1;
      }

      let masterLeft = 0;
      let masterRight = 0;
      const duckGain = this.duckGainAt(this.frame);
      const duckedTrack =
        this.sidechain?.enabled ? this.sidechain.targetTrackId : undefined;

      for (const track of this.trackList) {
        if (track.mute || (anySolo && !track.solo)) {
          track.instrument.stop();
          continue;
        }

        const sample = track.instrument.render();
        this.frameBuffer.left = sample;
        this.frameBuffer.right = sample;
        track.inserts.process(this.frameBuffer);

        const preLeft = this.frameBuffer.left;
        const preRight = this.frameBuffer.right;
        const duck = track.id === duckedTrack ? duckGain : 1;
        const postLeft = preLeft * track.gain * track.panLeft * duck;
        const postRight = preRight * track.gain * track.panRight * duck;

        for (const send of track.sends ?? []) {
          if (send.amount <= 0) continue;
          const bus = this.buses.get(send.busId);
          if (!bus) continue;
          const sourceLeft = send.preFader ? preLeft : postLeft;
          const sourceRight = send.preFader ? preRight : postRight;
          bus.inputLeft += sourceLeft * send.amount;
          bus.inputRight += sourceRight * send.amount;
        }

        const outputBus = track.outputBusId
          ? this.buses.get(track.outputBusId)
          : undefined;
        if (outputBus) {
          outputBus.inputLeft += postLeft;
          outputBus.inputRight += postRight;
        } else {
          masterLeft += postLeft;
          masterRight += postRight;
        }

        track.levelPeak = Math.max(
          track.levelPeak,
          Math.abs(postLeft),
          Math.abs(postRight)
        );
        if (
          track.id === this.spectrumTrackId &&
          this.spectrumWrite < this.spectrumBuffer.length
        ) {
          this.spectrumBuffer[this.spectrumWrite] = postLeft;
          this.spectrumWrite += 1;
        }
      }

      for (const bus of this.busOrder) {
        this.frameBuffer.left = bus.inputLeft;
        this.frameBuffer.right = bus.inputRight;
        bus.inserts.process(this.frameBuffer);
        for (const send of bus.sends ?? []) {
          if (send.amount <= 0) continue;
          const target = this.buses.get(send.busId);
          if (!target || target === bus) continue;
          target.inputLeft += this.frameBuffer.left * send.amount;
          target.inputRight += this.frameBuffer.right * send.amount;
        }
        const busLeft = this.frameBuffer.left * bus.returnGain;
        const busRight = this.frameBuffer.right * bus.returnGain;
        masterLeft += busLeft;
        masterRight += busRight;
        bus.levelPeak = Math.max(bus.levelPeak, Math.abs(busLeft), Math.abs(busRight));
        bus.inputLeft = 0;
        bus.inputRight = 0;
      }

      const transition = this.transitionGainAt(this.frame);
      this.master.process(
        masterLeft * transition,
        masterRight * transition,
        left,
        right,
        index
      );
      this.frame += 1;
    }

    if (consumed > 0) {
      this.events.copyWithin(0, consumed);
      this.events.length -= consumed;
    }
  }

  reset(): void {
    this.frame = 0;
    this.events.length = 0;
    this.trackList.forEach(track => {
      track.instrument.reset();
      track.inserts.reset();
      track.levelPeak = 0;
    });
    this.busList.forEach(bus => {
      bus.inserts.reset();
      bus.inputLeft = 0;
      bus.inputRight = 0;
      bus.levelPeak = 0;
    });
    this.master.reset();
    this.duckStartFrame = -1;
  }

  private createBus(config: CoreBusConfig): void {
    const inserts = new InsertChain(config.inserts, this.sampleRate);
    inserts.setQuality(this.quality);
    const bus: BusNode = {
      id: config.id,
      inserts,
      sends: config.sends ?? [],
      returnGain: dbToGain(config.returnDb),
      inputLeft: 0,
      inputRight: 0,
      levelPeak: 0
    };
    this.buses.set(bus.id, bus);
    this.busList.push(bus);
    this.rebuildBusOrder();
  }

  private applyQuality(track: TrackNode): void {
    if (this.quality === 'full') return;
    const limit =
      this.quality === 'eco'
        ? track.machine.kind === 'poly'
          ? 2
          : 1
        : track.machine.kind === 'poly'
          ? 4
          : 2;
    track.instrument.setVoiceLimit?.(limit);
  }

  private rebuildBusOrder(): void {
    const order: BusNode[] = [];
    const state = new Map<string, 1 | 2>();

    const visit = (bus: BusNode): void => {
      if (state.get(bus.id) === 2) return;
      if (state.get(bus.id) === 1) return;
      state.set(bus.id, 1);
      for (const send of bus.sends ?? []) {
        if (send.amount <= 0 || send.busId === bus.id) continue;
        const target = this.buses.get(send.busId);
        if (target) visit(target);
      }
      state.set(bus.id, 2);
      order.push(bus);
    };

    this.busList.forEach(visit);
    this.busOrder = order;
  }

  private createTrack(config: CoreTrackConfig): void {
    const gains = panGains(config.pan);
    const inserts = new InsertChain(config.inserts ?? [], this.sampleRate);
    inserts.setQuality(this.quality);
    const track: TrackNode = {
      id: config.id,
      instrument: createInstrument(config, this.sampleRate),
      machine: config.machine,
      samples: config.samples ?? [],
      inserts,
      sends: config.sends ?? [],
      outputBusId: config.outputBusId,
      gain: dbToGain(config.gainDb),
      pan: clamp(config.pan, -1, 1),
      mute: config.mute,
      solo: config.solo,
      panLeft: gains.left,
      panRight: gains.right,
      levelPeak: 0
    };
    this.applyQuality(track);
    this.tracks.set(track.id, track);
    this.trackList.push(track);
  }

  private applyAudioModulations(): void {
    for (const route of this.audioModulations.values()) {
      const range = route.max - route.min;
      const magnitude = range * Math.abs(route.amount);
      const depth = route.bipolar ? magnitude / 2 : magnitude;
      let low = route.bipolar ? -depth : 0;
      let high = depth;
      if (route.amount < 0) {
        const swap = low;
        low = high;
        high = swap;
      }
      const wave = modulationWave(route.shape, route.phase);
      const offset = low + ((wave + 1) / 2) * (high - low);
      const value = Math.max(
        route.min,
        Math.min(route.max, route.base + offset)
      );
      this.tracks
        .get(route.trackId)
        ?.inserts.setParam(route.insertId, route.param, value);
      route.phase += (route.rate * 128) / this.sampleRate;
      if (route.phase >= 1) route.phase -= Math.floor(route.phase);
    }
  }

  private startTransition(target: number, milliseconds: number): void {
    this.transitionFrom = this.transitionGainAt(this.frame);
    this.transitionTo = target;
    this.transitionStart = this.frame;
    this.transitionFrames = Math.max(
      1,
      Math.round((milliseconds / 1000) * this.sampleRate)
    );
  }

  private transitionGainAt(frame: number): number {
    if (this.transitionFrames <= 0) return this.transitionTo;
    const progress = Math.min(
      1,
      (frame - this.transitionStart) / this.transitionFrames
    );
    return this.transitionFrom + (this.transitionTo - this.transitionFrom) * progress;
  }

  private startDuck(frame: number): void {
    if (!this.sidechain?.enabled || this.sidechain.sourceTrackId !== 'kick') {
      return;
    }
    this.duckStartFrame = frame;
  }

  private duckGainAt(frame: number): number {
    const config = this.sidechain;
    if (!config?.enabled || this.duckStartFrame < 0) return 1;
    const elapsed = (frame - this.duckStartFrame) / this.sampleRate;
    if (elapsed < 0) return 1;
    const depth = dbToGain(-Math.max(0, config.depthDb));
    const attack = Math.max(0, config.attack);
    const release = Math.max(0, config.release);
    if (elapsed < attack) {
      return attack > 0 ? 1 - (1 - depth) * (elapsed / attack) : depth;
    }
    const released = elapsed - attack;
    if (released < release) {
      return release > 0
        ? depth + (1 - depth) * (released / release)
        : 1;
    }
    return 1;
  }

  private toScheduled(event: CoreEvent): ScheduledEvent | null {
    if (!Number.isFinite(event.time)) return null;
    const frame = Math.max(
      this.frame,
      Math.round(event.time * this.sampleRate)
    );
    const seed = this.seed ^ Math.imul(frame + 1, 0x9e3779b1);

    switch (event.type) {
      case 'kick':
        return {
          ...event,
          frame,
          seed,
          velocity: clamp(event.velocity ?? 1, 0, 1)
        };
      case 'synth':
        return {
          ...event,
          frame,
          seed,
          velocity: clamp(event.velocity ?? 1, 0, 1),
          accent: event.accent ?? false,
          slide: event.slide ?? false,
          duration: Math.max(0.001, event.duration)
        };
      case 'sample':
        return {
          ...event,
          frame,
          seed,
          sampleIndex: Math.max(0, Math.round(event.sampleIndex ?? 0)),
          playbackRate: Math.max(0.0001, event.playbackRate ?? 1),
          gainDb: event.gainDb ?? 0
        };
      default:
        return null;
    }
  }

  private trigger(event: ScheduledEvent): void {
    const track = this.tracks.get(event.trackId);
    if (!track) return;
    switch (event.type) {
      case 'kick':
        track.instrument.triggerKick?.(event.velocity, event.seed);
        this.startDuck(event.frame);
        return;
      case 'synth':
        track.instrument.triggerSynth?.(
          event.notes,
          event.duration,
          event.velocity,
          event.accent,
          event.slide,
          event.seed
        );
        return;
      case 'sample':
        track.instrument.triggerSample?.(
          event.sampleIndex,
          event.playbackRate,
          event.duration,
          event.gainDb,
          event.seed
        );
        return;
      default:
        return;
    }
  }
}
