import * as Tone from 'tone';
import type { EffectKind, SoundEvent } from '../../../domain/audio';
import type { ChannelKey, DelaySettings, ReverbSettings } from '../../../domain/channels';
import {
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
import { createBuiltinPluginHost } from '../plugins/builtins';
import { createBuiltinInstrumentHost } from '../plugins/instruments';
import { InstrumentPluginHost } from '../plugins/instrument-host';
import type { InstrumentPluginInstance } from '../plugins/types';
import type { PluginHost } from '../plugins/plugin-host';
import { isOfflineContext } from '../context';
import { SampleVoicePool } from '../sample-voice-pool';
import { Bus } from './bus';
import { MasterBus } from './master-bus';
import { Track } from './track';

type TrackSource =
  | { readonly kind: 'membrane'; readonly synth: Tone.MembraneSynth }
  | { readonly kind: 'poly'; readonly synth: Tone.PolySynth }
  | { readonly kind: 'mono'; readonly synth: Tone.MonoSynth }
  | { readonly kind: 'pluck'; readonly synth: Tone.PluckSynth }
  | { readonly kind: 'instrument'; readonly instance: InstrumentPluginInstance }
  | { readonly kind: 'sampler'; readonly pools: readonly SampleVoicePool[] };

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
  private readonly sources = new Map<string, TrackSource>();
  private readonly audioModulations = new Map<
    string,
    {
      lfo: Tone.LFO;
      signature: string;
      param: Tone.Param<any> | Tone.Signal<any>;
    }
  >();
  private readonly latencyPlan: LatencyPlan;
  private prepared = false;

  constructor(
    config: GraphConfig,
    pluginHost: PluginHost = createBuiltinPluginHost(),
    instrumentHost: InstrumentPluginHost = createBuiltinInstrumentHost()
  ) {
    const errors = validateGraph(config);
    if (errors.length > 0) throw new Error(`Grafo inválido: ${errors.join('; ')}`);

    this.pluginHost = pluginHost;
    this.instrumentHost = instrumentHost;
    this.latencyPlan = planLatency(config);
    this.master = new MasterBus(config.master);
    config.buses.forEach(bus => this.addBus(bus));
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
    this.sources.set(config.id, this.createSource(config.machine, track.input));
  }

  removeTrack(id: string): void {
    const track = this.tracks.get(id);
    const source = this.sources.get(id);
    if (!track) return;
    stopSource(source);
    disposeSource(source);
    track.dispose();
    this.tracks.delete(id);
    this.sources.delete(id);
  }

  setTrackMachine(trackId: string, machine: MachineConfig): void {
    const track = this.tracks.get(trackId);
    if (!track) return;
    const previous = this.sources.get(trackId);
    stopSource(previous);
    disposeSource(previous);
    this.sources.set(trackId, this.createSource(machine, track.input));
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;
    if (!isOfflineContext()) await Tone.start();
    await Promise.all([
      ...Array.from(this.tracks.values(), track => track.prepare()),
      ...Array.from(this.buses.values(), bus => bus.prepare()),
      ...Array.from(this.sources.values()).flatMap(source =>
        source.kind === 'instrument' && source.instance.prepare
          ? [source.instance.prepare()]
          : []
      )
    ]);
    await Tone.loaded();
    this.prepared = true;
  }

  stop(): void {
    this.sources.forEach(stopSource);
  }

  trigger(event: SoundEvent): void {
    switch (event.type) {
      case 'kick': {
        const source = this.sources.get('kick');
        if (source?.kind === 'membrane') {
          source.synth.triggerAttackRelease(
            'C1',
            '8n',
            event.time,
            event.velocity ?? 1
          );
        }
        return;
      }
      case 'synth': {
        const source = this.sources.get(event.trackId ?? event.channel);
        if (!source) return;
        const notes = typeof event.notes === 'string' ? [event.notes] : [...event.notes];
        const velocity = event.velocity ?? 1;
        if (source.kind === 'poly') {
          source.synth.triggerAttackRelease(
            notes,
            event.duration,
            event.time,
            velocity
          );
        } else if (source.kind === 'mono') {
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
        const source = this.sources.get(event.trackId ?? event.channel);
        if (source?.kind !== 'sampler' || source.pools.length === 0) return;
        const index = clamp(event.sampleIndex ?? 0, 0, source.pools.length - 1);
        source.pools[index]?.play(
          event.time,
          event.playbackRate ?? 1,
          event.duration,
          event.gainDb
        );
      }
    }
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

  setDelaySettings(channel: ChannelKey, settings: DelaySettings): void {
    const insert = this.tracks.get(channel)?.findInsertByPlugin('delay');
    if (!insert) return;
    insert.setParam('wet', settings.wet);
    insert.setParam('feedback', settings.feedback);
    insert.setParam('time', settings.time);
  }

  setReverbSettings(channel: ChannelKey, settings: ReverbSettings): void {
    const insert = this.tracks.get(channel)?.findInsertByPlugin('reverb');
    if (!insert) return;
    insert.setParam('wet', settings.wet);
    insert.setParam('decay', settings.decay);
  }

  setMasterVolume(db: number): void {
    this.master.setVolume(db);
  }

  getMasterLevel(): number {
    return this.master.getLevel();
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

  setTrackPan(trackId: string, pan: number): void {
    this.tracks.get(trackId)?.setPan(pan);
  }

  async setTrackInserts(trackId: string, inserts: readonly InsertConfig[]): Promise<void> {
    await this.loadInsertPlugins(inserts);
    await this.tracks.get(trackId)?.setInserts(inserts);
  }

  async setBusInserts(busId: string, inserts: readonly InsertConfig[]): Promise<void> {
    await this.loadInsertPlugins(inserts);
    await this.buses.get(busId)?.setInserts(inserts);
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

  getTrackLevel(trackId: string): number {
    return this.tracks.get(trackId)?.getLevel() ?? -Infinity;
  }

  getBusLevel(busId: string): number {
    return this.buses.get(busId)?.getLevel() ?? -Infinity;
  }

  dispose(): void {
    this.stop();
    this.clearAudioModulations();
    this.sources.forEach(disposeSource);
    this.sources.clear();
    this.tracks.forEach(track => track.dispose());
    this.tracks.clear();
    this.buses.forEach(bus => bus.dispose());
    this.buses.clear();
    this.master.dispose();
    this.prepared = false;
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
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: machine.oscillator ?? 'sine' },
        envelope: machine.envelope ?? {
          attack: 0.05,
          decay: 0.25,
          sustain: 0.35,
          release: 1.4
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
      synth.connect(input);
      return { kind: 'mono', synth };
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
        return { kind: 'sampler', pools: [] };
      }
      const instance = this.instrumentHost.create(
        machine.pluginId,
        machine.params ?? {}
      );
      instance.output.connect(input);
      return { kind: 'instrument', instance };
    }

    const pools = (machine.samples ?? []).map(
      url =>
        new SampleVoicePool(
          url,
          machine.voices ?? 1,
          machine.fadeIn ?? 0.004,
          machine.fadeOut ?? 0.03,
          input
        )
    );
    return { kind: 'sampler', pools };
  }
}

function stopSource(source: TrackSource | undefined): void {
  if (!source) return;
  if (source.kind === 'membrane') source.synth.triggerRelease();
  else if (source.kind === 'poly') source.synth.releaseAll();
  else if (source.kind === 'mono') source.synth.triggerRelease();
  else if (source.kind === 'pluck') source.synth.triggerRelease();
  else if (source.kind === 'instrument') source.instance.release();
  else source.pools.forEach(pool => pool.stop());
}

function disposeSource(source: TrackSource | undefined): void {
  if (!source) return;
  if (source.kind === 'sampler') source.pools.forEach(pool => pool.dispose());
  else if (source.kind === 'instrument') source.instance.dispose();
  else source.synth.dispose();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
