import * as Tone from 'tone';
import type { EffectKind, NoteDuration, SoundEvent } from '../../../domain/audio';
import {
  insertConfigsEqual,
  planLatency,
  validateGraph,
  type BusConfig,
  type GraphConfig,
  type InsertConfig,
  type LatencyPlan,
  type MachineConfig,
  type TrackConfig
} from '../../../domain/graph';
import type { LfoShape, ModulationTarget } from '../../../domain/modulation';
import type { PluginDefinition } from '../../../domain/plugin';
import type { AudioEnginePort } from '../../../domain/ports';
import {
  sidechainPoints,
  type SidechainConfig
} from '../../../domain/sidechain';
import type { BusState } from '../../../domain/kit';
import { createBuiltinPluginHost } from '../plugins/builtins';
import { createBuiltinInstrumentHost } from '../plugins/instruments';
import { InstrumentPluginHost } from '../plugins/instrument-host';
import type { InstrumentPluginInstance } from '../plugins/types';
import type { PluginHost } from '../plugins/plugin-host';
import { isOfflineContext } from '../context';
import {
  createSamplerSource,
  type SamplerVoiceSource
} from '../sampler-source';
import { SampleLibrary } from '../sample-library';
import { Bus } from './bus';
import { MasterBus } from './master-bus';
import { Track } from './track';

type TrackSource =
  | { readonly kind: 'membrane'; readonly synth: Tone.MembraneSynth }
  | { readonly kind: 'poly'; readonly synth: Tone.PolySynth }
  | {
      readonly kind: 'mono';
      readonly synth: Tone.MonoSynth;
      readonly glide: number;
      /** Énfasis de filtro por nota para el acento 303. */
      readonly accentFilter: Tone.Filter;
    }
  | { readonly kind: 'pluck'; readonly synth: Tone.PluckSynth }
  | { readonly kind: 'instrument'; readonly instance: InstrumentPluginInstance }
  | { readonly kind: 'sampler'; readonly source: SamplerVoiceSource };

interface SourceNode {
  readonly source: TrackSource;
  readonly gain: Tone.Gain;
  readonly machineKey: string;
}

export class ModularAudioEngine implements AudioEnginePort {
  readonly supportsInserts = true;
  readonly supportsTrackManagement = true;
  readonly supportsRouting = true;
  readonly supportsMachineChange = true;
  private readonly pluginHost: PluginHost;
  private readonly instrumentHost: InstrumentPluginHost;
  private readonly master: MasterBus;
  private readonly tracks = new Map<string, Track>();
  private readonly buses = new Map<string, Bus>();
  private readonly sources = new Map<string, SourceNode>();
  private readonly audioModulations = new Map<
    string,
    {
      lfo: Tone.LFO;
      signature: string;
      param: Tone.Param<any> | Tone.Signal<any>;
    }
  >();
  private readonly latencyPlan: LatencyPlan;
  private readonly samples = new SampleLibrary();
  private preview: { readonly track: Track; node: SourceNode } | null = null;
  private sidechain: SidechainConfig | undefined;
  private prepared = false;
  private preparing: Promise<void> | null = null;

  constructor(
    config: GraphConfig,
    pluginHost: PluginHost = createBuiltinPluginHost(),
    instrumentHost: InstrumentPluginHost = createBuiltinInstrumentHost()
  ) {
    const errors = validateGraph(config);
    if (errors.length > 0) throw new Error(`Grafo inválido: ${errors.join('; ')}`);

    this.pluginHost = pluginHost;
    this.instrumentHost = instrumentHost;
    this.sidechain = config.sidechain;
    this.latencyPlan = planLatency(config);
    this.master = new MasterBus(config.master);
    config.buses.forEach(bus => this.addBus(bus));
    config.buses.forEach(bus => {
      (bus.sends ?? []).forEach(send => {
        this.setBusSend(bus.id, send.busId, send.amount);
      });
    });
    config.tracks.forEach(track => this.addTrack(track));
  }

  addBus(config: BusConfig): void {
    if (this.buses.has(config.id)) throw new Error(`Bus duplicado: ${config.id}`);
    this.buses.set(config.id, new Bus(config, this.pluginHost, this.master.input));
  }

  removeBus(id: string): void {
    const bus = this.buses.get(id);
    if (!bus) return;
    bus.dispose();
    this.buses.delete(id);
  }

  addTrack(config: TrackConfig): void {
    if (this.tracks.has(config.id)) throw new Error(`Track duplicado: ${config.id}`);
    const track = new Track(
      config,
      this.pluginHost,
      this.master.input,
      busId => this.buses.get(busId)?.input,
      this.latencyPlan.trackCompensation[config.id] ?? 0,
      send => this.latencyPlan.sendCompensation[`${config.id}:${send.busId}`] ?? 0
    );
    this.tracks.set(config.id, track);
    this.sources.set(config.id, this.createSourceNode(config.machine, track.input));
  }

  removeTrack(id: string): void {
    const track = this.tracks.get(id);
    const node = this.sources.get(id);
    if (!track) return;
    this.tracks.delete(id);
    this.sources.delete(id);
    if (node) {
      node.gain.gain.rampTo(0, 0.04, Tone.now());
      globalThis.setTimeout(() => {
        stopSource(node.source);
        disposeSource(node.source);
        node.gain.dispose();
      }, 80);
    }
    globalThis.setTimeout(() => track.dispose(), 80);
  }

  setSidechain(config?: SidechainConfig): void {
    this.sidechain = config;
  }

  setTrackOutput(trackId: string, outputBusId?: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const target = outputBusId
      ? this.buses.get(outputBusId)?.input
      : undefined;
    track.setOutput(target ?? this.master.input, target ? outputBusId : undefined);
  }

  setTrackMachine(trackId: string, machine: MachineConfig): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const key = machineKey(machine);
    const previous = this.sources.get(trackId);
    if (previous?.machineKey === key) return;

    const gain = new Tone.Gain(0);
    gain.connect(track.input);
    const source = this.createSource(machine, gain);
    this.sources.set(trackId, { source, gain, machineKey: key });
    gain.gain.rampTo(1, 0.04, Tone.now());

    if (previous) {
      previous.gain.gain.rampTo(0, 0.04, Tone.now());
      globalThis.setTimeout(() => {
        stopSource(previous.source);
        disposeSource(previous.source);
        previous.gain.dispose();
      }, 80);
    }
  }

  syncTracks(tracks: readonly TrackConfig[]): void {
    const desired = new Set(tracks.map(track => track.id));
    Array.from(this.tracks.keys()).forEach(id => {
      if (!desired.has(id)) this.removeTrack(id);
    });
    tracks.forEach(track => {
      if (!this.tracks.has(track.id)) {
        this.addTrack(track);
      } else {
        this.setTrackOutput(track.id, track.outputBusId);
        this.setTrackMachine(track.id, track.machine);
      }
    });
  }

  syncBuses(buses: readonly BusConfig[]): void {
    const desired = new Set(buses.map(bus => bus.id));
    Array.from(this.buses.keys()).forEach(id => {
      if (!desired.has(id)) this.removeBus(id);
    });
    buses.forEach(bus => {
      if (!this.buses.has(bus.id)) this.addBus(bus);
    });
  }

  prepare(): Promise<void> {
    if (this.prepared) return Promise.resolve();
    if (this.preparing) return this.preparing;
    this.preparing = this.prepareInternal().finally(() => {
      this.preparing = null;
    });
    return this.preparing;
  }

  private async prepareInternal(): Promise<void> {
    if (!isOfflineContext()) await Tone.start();
    if (!isOfflineContext()) {
      this.tracks.forEach(track => track.prepareMeter());
      this.buses.forEach(bus => bus.prepareMeter());
    }
    await Promise.all([
      ...Array.from(this.tracks.values(), track => track.prepare()),
      ...Array.from(this.buses.values(), bus => bus.prepare()),
      ...Array.from(this.sources.values()).flatMap(node =>
        node.source.kind === 'instrument' && node.source.instance.prepare
          ? [node.source.instance.prepare()]
          : node.source.kind === 'sampler'
            ? [node.source.source.prepare()]
            : []
      )
    ]);
    await Tone.loaded();
    this.prepared = true;
  }

  stop(): void {
    this.sources.forEach(node => stopSource(node.source));
    stopSource(this.preview?.node.source);
  }

  trigger(event: SoundEvent): void {
    switch (event.type) {
      case 'kick': {
        const source = this.sources.get('kick')?.source;
        if (source?.kind === 'membrane') {
          source.synth.triggerAttackRelease(
            'C1',
            '8n',
            event.time,
            event.velocity ?? 1
          );
        }
        this.duckAt(event.time);
        return;
      }
      case 'synth': {
        const source = this.sources.get(event.trackId ?? event.channel)?.source;
        if (!source) return;
        const notes = typeof event.notes === 'string' ? [event.notes] : [...event.notes];
        const velocity = event.accent
          ? Math.min(1, (event.velocity ?? 1) * 1.35)
          : event.velocity ?? 1;
        if (source.kind === 'poly') {
          source.synth.triggerAttackRelease(
            notes,
            event.duration,
            event.time,
            velocity
          );
        } else if (source.kind === 'mono') {
          // El glide y el acento son por nota: se fijan justo antes del
          // trigger, nunca con reloj real.
          source.synth.portamento = event.slide ? source.glide : 0;
          source.accentFilter.gain.setValueAtTime(
            event.accent ? 8 : 0,
            event.time
          );
          if (event.accent) {
            source.accentFilter.gain.linearRampToValueAtTime(
              0,
              event.time + 0.12
            );
          }
          source.synth.triggerAttackRelease(
            notes[0] ?? 'C3',
            event.duration,
            event.time,
            velocity
          );
        } else if (source.kind === 'pluck') {
          source.synth.triggerAttack(notes[0] ?? 'C4', event.time);
        } else if (source.kind === 'instrument') {
          source.instance.trigger(notes, event.duration, event.time, velocity);
        }
        return;
      }
      case 'sample': {
        const source = this.sources.get(event.trackId ?? event.channel)?.source;
        if (source?.kind !== 'sampler') return;
        source.source.play(
          event.time,
          event.sampleIndex ?? 0,
          event.playbackRate ?? 1,
          event.duration,
          event.gainDb
        );
        if (event.trackId === 'kick') this.duckAt(event.time);
      }
    }
  }

  private duckAt(time: number): void {
    const config = this.sidechain;
    if (!config?.enabled || config.sourceTrackId !== 'kick') return;
    const target = this.tracks.get(config.targetTrackId);
    if (!target) return;

    const points = sidechainPoints(
      time,
      config.depthDb,
      config.attack,
      config.release
    );
    const gain = target.duckGain.gain;
    gain.cancelScheduledValues(time);
    points.forEach(point => {
      if (point === points[0]) gain.setValueAtTime(point.gain, point.time);
      else gain.linearRampToValueAtTime(point.gain, point.time);
    });
  }

  previewMachine(
    machine: MachineConfig,
    notes: readonly string[],
    duration: NoteDuration = '8n'
  ): void {
    const node = this.ensurePreview(machine);
    void (async () => {
      try {
        if (!isOfflineContext()) await Tone.start();
        if (node.source.kind === 'sampler') {
          await node.source.source.prepare();
        }
        const time = Tone.now() + 0.03;
        switch (node.source.kind) {
          case 'membrane':
            node.source.synth.triggerAttackRelease(
              notes[0] ?? 'C1',
              duration,
              time,
              0.9
            );
            break;
          case 'poly':
            node.source.synth.triggerAttackRelease(
              [...notes],
              duration,
              time,
              0.9
            );
            break;
          case 'mono':
            node.source.synth.triggerAttackRelease(
              notes[0] ?? 'C3',
              duration,
              time,
              0.9
            );
            break;
          case 'pluck':
            node.source.synth.triggerAttack(notes[0] ?? 'C4', time);
            break;
          case 'instrument':
            node.source.instance.trigger(notes, duration, time, 0.9);
            break;
          case 'sampler':
            node.source.source.play(time, 0, 1);
            break;
        }
      } catch (error) {
        console.warn('No se pudo reproducir el preview:', error);
      }
    })();
  }

  listPlugins(): readonly PluginDefinition[] {
    return this.pluginHost.list();
  }

  listInstruments(): readonly PluginDefinition[] {
    return this.instrumentHost.list();
  }

  async preparePlugin(pluginId: string): Promise<void> {
    await this.pluginHost.load(pluginId);
  }

  setChannelVolume(trackId: string, db: number, time?: number): void {
    this.tracks.get(trackId)?.setVolume(db, time);
  }

  setChannelPan(trackId: string, pan: number, time?: number): void {
    this.tracks.get(trackId)?.setPan(pan, time);
  }

  setChannelMute(trackId: string, muted: boolean): void {
    this.tracks.get(trackId)?.setMute(muted);
  }

  setEffectWet(
    trackId: string,
    effect: EffectKind,
    wet: number,
    time?: number
  ): void {
    this.tracks.get(trackId)?.findInsertByPlugin(effect)?.setParam('wet', wet, time);
  }

  setMasterVolume(db: number): void {
    this.master.setVolume(db);
  }

  beginTransition(fadeOutMs = 6): void {
    this.master.beginTransition(fadeOutMs);
  }

  endTransition(fadeInMs = 30): void {
    this.master.endTransition(fadeInMs);
  }

  getMasterLevel(): number {
    return this.master.getLevel();
  }

  getTrackLevel(trackId: string): number {
    return this.tracks.get(trackId)?.getLevel() ?? -Infinity;
  }

  getBusLevel(busId: string): number {
    return this.buses.get(busId)?.getLevel() ?? -Infinity;
  }

  getAudioStats(): {
    readonly underruns: number;
    readonly underrunDuration: number;
    readonly totalDuration: number;
  } | null {
    const raw = Tone.getContext().rawContext as AudioContext & {
      playbackStats?: {
        underrunEvents?: number;
        underrunDuration?: number;
        totalDuration?: number;
      };
    };
    const stats = raw.playbackStats;
    if (!stats) return null;
    return {
      underruns: stats.underrunEvents ?? 0,
      underrunDuration: stats.underrunDuration ?? 0,
      totalDuration: stats.totalDuration ?? 0
    };
  }

  setTrackSend(
    trackId: string,
    busId: string,
    amount: number,
    preFader: boolean
  ): void {
    const track = this.tracks.get(trackId);
    const bus = this.buses.get(busId);
    if (!track || !bus) return;

    if (track.hasSend(busId) && track.sendIsPre(busId) === preFader) {
      track.setSend(busId, amount);
      return;
    }

    if (track.hasSend(busId)) track.removeSend(busId);
    track.addSend(
      busId,
      bus.input,
      amount,
      preFader,
      this.latencyPlan.sendCompensation[`${trackId}:${busId}`] ?? 0
    );
  }

  removeTrackSend(trackId: string, busId: string): void {
    this.tracks.get(trackId)?.removeSend(busId);
  }

  setBusReturn(busId: string, db: number): void {
    this.buses.get(busId)?.setReturn(db);
  }

  setBusSend(fromBusId: string, toBusId: string, amount: number): void {
    const source = this.buses.get(fromBusId);
    const target = this.buses.get(toBusId);
    if (!source || !target || fromBusId === toBusId) return;
    source.setSend(toBusId, target.input, amount);
  }

  syncBusSends(buses: readonly BusState[]): void {
    const byId = new Map(buses.map(bus => [bus.id, bus]));
    this.buses.forEach((bus, id) => {
      const config = byId.get(id);
      bus.syncSends(config?.sends ?? [], targetId => {
        if (targetId === id) return undefined;
        return this.buses.get(targetId)?.input;
      });
    });
  }

  setTrackPan(trackId: string, pan: number): void {
    this.tracks.get(trackId)?.setPan(pan);
  }

  async setTrackInserts(trackId: string, inserts: readonly InsertConfig[]): Promise<void> {
    const track = this.tracks.get(trackId);
    if (!track || insertConfigsEqual(track.getInsertConfigs(), inserts)) return;
    await this.loadInsertPlugins(inserts);
    await track.setInserts(inserts);
  }

  async setBusInserts(busId: string, inserts: readonly InsertConfig[]): Promise<void> {
    const bus = this.buses.get(busId);
    if (!bus || insertConfigsEqual(bus.getInsertConfigs(), inserts)) return;
    await this.loadInsertPlugins(inserts);
    await bus.setInserts(inserts);
  }

  async addInsert(
    ownerId: string,
    insert: InsertConfig,
    index = -1
  ): Promise<void> {
    const owner = this.tracks.get(ownerId) ?? this.buses.get(ownerId);
    if (!owner) return;
    const configs = [...owner.getInsertConfigs()];
    if (index < 0 || index >= configs.length) configs.push(insert);
    else configs.splice(index, 0, insert);
    await this.loadInsertPlugins(configs);
    await owner.setInserts(configs);
  }

  async removeInsert(ownerId: string, insertId: string): Promise<void> {
    const owner = this.tracks.get(ownerId) ?? this.buses.get(ownerId);
    if (!owner) return;
    const configs = owner.getInsertConfigs().filter(insert => insert.id !== insertId);
    await owner.setInserts(configs);
  }

  setInsertParam(ownerId: string, insertId: string, param: string, value: number): void {
    const owner = this.tracks.get(ownerId) ?? this.buses.get(ownerId);
    owner?.setInsertParam(insertId, param, value);
  }

  setInsertBypass(ownerId: string, insertId: string, bypass: boolean): void {
    const owner = this.tracks.get(ownerId) ?? this.buses.get(ownerId);
    owner?.setInsertBypass(insertId, bypass);
  }

  supportsAudioModulation(target: ModulationTarget): boolean {
    return this.resolveAudioParam(target) !== null;
  }

  setAudioModulation(
    routeId: string,
    source: { readonly rate: number; readonly shape: LfoShape },
    target: ModulationTarget,
    amount: number,
    bipolar: boolean
  ): void {
    const resolved = this.resolveAudioParam(target);
    if (!resolved) return;

    const range = resolved.max - resolved.min;
    const magnitude = range * Math.abs(amount);
    const depth = bipolar ? magnitude / 2 : magnitude;
    let min = bipolar ? -depth : 0;
    let max = depth;
    if (amount < 0) [min, max] = [max, min];

    const shape: Tone.ToneOscillatorType =
      source.shape === 'saw' ? 'sawtooth' : source.shape;
    const signature = JSON.stringify({
      rate: source.rate,
      shape,
      amount,
      bipolar,
      min,
      max,
      target
    });
    const existing = this.audioModulations.get(routeId);
    if (
      existing?.signature === signature &&
      existing.param === resolved.param
    ) {
      return;
    }
    if (existing) {
      existing.lfo.dispose();
      this.audioModulations.delete(routeId);
    }

    const lfo = new Tone.LFO({
      frequency: source.rate,
      type: shape,
      min,
      max
    }).start();
    lfo.connect(resolved.param);
    this.audioModulations.set(routeId, {
      lfo,
      signature,
      param: resolved.param
    });
  }

  removeAudioModulation(routeId: string): void {
    const existing = this.audioModulations.get(routeId);
    if (!existing) return;
    existing.lfo.dispose();
    this.audioModulations.delete(routeId);
  }

  clearAudioModulations(): void {
    this.audioModulations.forEach(entry => entry.lfo.dispose());
    this.audioModulations.clear();
  }

  private resolveAudioParam(target: ModulationTarget): {
    param: Tone.Param<any> | Tone.Signal<any>;
    min: number;
    max: number;
  } | null {
    const track = this.tracks.get(target.trackId);
    if (!track) return null;
    const param = track.getInsertAudioParam(target.insertId, target.paramId);
    if (!param) return null;

    const insert = track
      .getInsertConfigs()
      .find(entry => entry.id === target.insertId);
    if (!insert) return null;
    const definition = this.pluginHost.getDefinition(insert.pluginId);
    const descriptor = definition?.params.find(
      entry => entry.id === target.paramId
    );
    if (!descriptor) return null;

    return { param, min: descriptor.min, max: descriptor.max };
  }

  private async loadInsertPlugins(inserts: readonly InsertConfig[]): Promise<void> {
    await Promise.all(inserts.map(insert => this.pluginHost.load(insert.pluginId)));
  }

  dispose(): void {
    this.stop();
    this.clearAudioModulations();
    this.sources.forEach(node => {
      disposeSource(node.source);
      node.gain.dispose();
    });
    this.sources.clear();
    if (this.preview) {
      disposeSource(this.preview.node.source);
      this.preview.node.gain.dispose();
      this.preview.track.dispose();
      this.preview = null;
    }
    this.tracks.forEach(track => track.dispose());
    this.tracks.clear();
    this.buses.forEach(bus => bus.dispose());
    this.buses.clear();
    this.samples.dispose();
    this.master.dispose();
    this.prepared = false;
  }

  private ensurePreview(machine: MachineConfig): SourceNode {
    if (!this.preview) {
      const track = new Track(
        {
          id: 'preview',
          name: 'Preview',
          machine,
          gainDb: -6,
          pan: 0,
          mute: false,
          solo: false,
          inserts: [],
          sends: []
        },
        this.pluginHost,
        this.master.input,
        () => undefined,
        0,
        () => 0
      );
      this.preview = {
        track,
        node: this.createSourceNode(machine, track.input)
      };
      return this.preview.node;
    }

    if (this.preview.node.machineKey === machineKey(machine)) {
      return this.preview.node;
    }

    const previous = this.preview.node;
    const node = this.createSourceNode(machine, this.preview.track.input);
    this.preview.node = node;
    previous.gain.gain.rampTo(0, 0.02, Tone.now());
    globalThis.setTimeout(() => {
      stopSource(previous.source);
      disposeSource(previous.source);
      previous.gain.dispose();
    }, 60);
    return node;
  }

  private createSourceNode(
    machine: MachineConfig,
    input: Tone.ToneAudioNode
  ): SourceNode {
    const gain = new Tone.Gain(1);
    gain.connect(input);
    return {
      source: this.createSource(machine, gain),
      gain,
      machineKey: machineKey(machine)
    };
  }

  private createSource(machine: MachineConfig, input: Tone.ToneAudioNode): TrackSource {
    if (machine.kind === 'membrane') {
      const synth = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 10,
        oscillator: { type: machine.oscillator ?? 'sine' },
        envelope: machine.envelope ?? {
          attack: 0.001,
          decay: 0.4,
          sustain: 0.01,
          release: 1.4
        }
      });
      synth.connect(input);
      return { kind: 'membrane', synth };
    }

    if (machine.kind === 'poly') {
      // PolySynth sobre MonoSynth: cada voz lleva filtro propio y envolvente de
      // filtro. Con `Tone.Synth` el pad era un oscilador con ADSR, sin movimiento.
      const filterEnvelope = machine.filterEnvelope;
      const synth = new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: machine.oscillator ?? 'sine' },
        envelope: machine.envelope ?? {
          attack: 0.05,
          decay: 0.25,
          sustain: 0.35,
          release: 1.4
        },
        filter: {
          type: 'lowpass',
          Q: machine.filter?.q ?? 1,
          rolloff: -24
        },
        filterEnvelope: {
          attack: filterEnvelope?.attack ?? 0.6,
          decay: filterEnvelope?.decay ?? 1.6,
          sustain: filterEnvelope?.sustain ?? 0.5,
          release: filterEnvelope?.release ?? 2.4,
          baseFrequency: machine.filter?.frequency ?? 1400,
          octaves: filterEnvelope?.octaves ?? 2.5
        }
      });
      if (machine.maxPolyphony !== undefined) synth.maxPolyphony = machine.maxPolyphony;
      synth.connect(input);
      return { kind: 'poly', synth };
    }

    if (machine.kind === 'mono') {
      const synth = new Tone.MonoSynth({
        oscillator: { type: machine.oscillator ?? 'sawtooth' },
        envelope: machine.envelope ?? {
          attack: 0.01,
          decay: 0.2,
          sustain: 0.35,
          release: 0.35
        },
        filter: {
          type: 'lowpass',
          Q: machine.filter?.q ?? 2,
          rolloff: -24
        },
        filterEnvelope: {
          attack: 0.01,
          decay: 0.2,
          sustain: 0.2,
          release: 0.4,
          baseFrequency: machine.filter?.frequency ?? 800,
          octaves: 2.5
        }
      });
      const accentFilter = new Tone.Filter({
        type: 'peaking',
        frequency: 900,
        Q: 1,
        gain: 0
      });
      synth.connect(accentFilter);
      accentFilter.connect(input);
      return {
        kind: 'mono',
        synth,
        glide: machine.glide ?? 0,
        accentFilter
      };
    }

    if (machine.kind === 'pluck') {
      const synth = new Tone.PluckSynth({
        attackNoise: machine.pluck?.attackNoise ?? 1.2,
        dampening: machine.pluck?.dampening ?? 4000,
        resonance: machine.pluck?.resonance ?? 0.9,
        release: machine.pluck?.release ?? 1.1
      });
      synth.connect(input);
      return { kind: 'pluck', synth };
    }

    if (machine.kind === 'plugin') {
      if (!machine.pluginId) {
        return {
          kind: 'sampler',
          source: createSamplerSource(
            [],
            1,
            0,
            0,
            input,
            this.samples
          )
        };
      }
      const instance = this.instrumentHost.create(
        machine.pluginId,
        machine.params ?? {}
      );
      instance.output.connect(input);
      return { kind: 'instrument', instance };
    }

    const source = createSamplerSource(
      machine.samples ?? [],
      machine.voices ?? 1,
      machine.fadeIn ?? 0.004,
      machine.fadeOut ?? 0.03,
      input,
      this.samples
    );
    return { kind: 'sampler', source };
  }
}

function machineKey(machine: MachineConfig): string {
  return JSON.stringify(machine);
}

function stopSource(source: TrackSource | undefined): void {
  if (!source) return;
  if (source.kind === 'membrane') source.synth.triggerRelease();
  else if (source.kind === 'poly') source.synth.releaseAll();
  else if (source.kind === 'mono') source.synth.triggerRelease();
  else if (source.kind === 'pluck') source.synth.triggerRelease();
  else if (source.kind === 'instrument') source.instance.release();
  else source.source.stop();
}

function disposeSource(source: TrackSource | undefined): void {
  if (!source) return;
  if (source.kind === 'sampler') source.source.dispose();
  else if (source.kind === 'instrument') source.instance.dispose();
  else {
    if (source.kind === 'mono') source.accentFilter.dispose();
    source.synth.dispose();
  }
}
