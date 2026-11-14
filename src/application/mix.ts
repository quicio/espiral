import type { EffectKind } from '../domain/audio';
import type { EqSettings, InsertConfig } from '../domain/graph';
import {
  busToConfig,
  kitEffectiveMute,
  trackToConfig,
  type TrackState
} from '../domain/kit';
import type { ModulationTarget } from '../domain/modulation';
import type { InstrumentState } from '../domain/models';
import {
  clampPluginParam,
  defaultPluginState,
  type PluginDefinition
} from '../domain/plugin';
import type { AudioEnginePort } from '../domain/ports';
import {
  DEFAULT_SIDECHAIN,
  type SidechainConfig
} from '../domain/sidechain';
import type { Store } from './store';

export class MixService {
  constructor(
    private readonly store: Store,
    private readonly engine: AudioEnginePort
  ) {}

  get supportsInserts(): boolean {
    return this.engine.supportsInserts;
  }

  get supportsTrackManagement(): boolean {
    return this.engine.supportsTrackManagement;
  }

  get supportsRouting(): boolean {
    return this.engine.supportsRouting;
  }

  get supportsMachineChange(): boolean {
    return this.engine.supportsMachineChange;
  }

  supportsAudioModulation(target: ModulationTarget): boolean {
    return this.engine.supportsAudioModulation(target);
  }

  listPlugins(): readonly PluginDefinition[] {
    return this.engine.listPlugins();
  }

  listInstruments(): readonly PluginDefinition[] {
    return this.engine.listInstruments();
  }

  setChannelVolume(trackId: string, db: number): void {
    const volumeDb = clamp(db, -60, 6);
    this.updateTrack(trackId, track => ({ ...track, gainDb: volumeDb }));
    this.engine.setChannelVolume(trackId, volumeDb);
  }

  setChannelPan(trackId: string, pan: number): void {
    const value = clamp(pan, -1, 1);
    this.updateTrack(trackId, track => ({ ...track, pan: value }));
    this.engine.setChannelPan(trackId, value);
  }

  setInsertParam(trackId: string, insertId: string, param: string, value: number): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    const insert = track?.inserts.find(entry => entry.id === insertId);
    if (!track || !insert) return;

    const definition = this.engine.listPlugins().find(entry => entry.id === insert.pluginId);
    const descriptor = definition?.params.find(entry => entry.id === param);
    const next = descriptor ? clampPluginParam(descriptor, value) : value;
    const inserts = track.inserts.map(entry =>
      entry.id === insertId
        ? { ...entry, params: { ...entry.params, [param]: next } }
        : entry
    );

    this.updateTrack(trackId, current => ({ ...current, inserts }));
    this.engine.setInsertParam(trackId, insertId, param, next);
  }

  setInsertBypass(trackId: string, insertId: string, bypass: boolean): void {
    const track = this.store.getState().kit.tracks[trackId];
    if (!track) return;
    const inserts = track.inserts.map(entry =>
      entry.id === insertId ? { ...entry, bypass } : entry
    );
    this.updateTrack(trackId, current => ({ ...current, inserts }));
    this.engine.setInsertBypass(trackId, insertId, bypass);
  }

  addInsert(trackId: string, pluginId: string, index = -1): void {
    if (!this.engine.supportsInserts) return;
    const definition = this.engine.listPlugins().find(entry => entry.id === pluginId);
    const track = this.store.getState().kit.tracks[trackId];
    if (!definition || !track) return;

    const inserts = [...track.inserts];
    const insert: InsertConfig = {
      id: uniqueInsertId(inserts, pluginId),
      pluginId,
      bypass: false,
      params: defaultPluginState(definition)
    };

    if (index < 0 || index >= inserts.length) inserts.push(insert);
    else inserts.splice(index, 0, insert);

    this.commitInserts(trackId, inserts);
  }

  removeInsert(trackId: string, insertId: string): void {
    if (!this.engine.supportsInserts) return;
    const track = this.store.getState().kit.tracks[trackId];
    if (!track) return;
    this.commitInserts(
      trackId,
      track.inserts.filter(entry => entry.id !== insertId)
    );
    this.store.update(state => ({
      ...state,
      modulation: {
        ...state.modulation,
        routes: state.modulation.routes.filter(
          route =>
            !(route.target.trackId === trackId && route.target.insertId === insertId)
        )
      }
    }));
  }

  moveInsert(trackId: string, insertId: string, offset: number): void {
    if (!this.engine.supportsInserts) return;
    const track = this.store.getState().kit.tracks[trackId];
    if (!track) return;

    const inserts = [...track.inserts];
    const index = inserts.findIndex(entry => entry.id === insertId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= inserts.length) return;

    const [insert] = inserts.splice(index, 1);
    if (!insert) return;
    inserts.splice(target, 0, insert);
    this.commitInserts(trackId, inserts);
  }

  reorderInsert(trackId: string, insertId: string, targetIndex: number): void {
    if (!this.engine.supportsInserts) return;
    const track = this.store.getState().kit.tracks[trackId];
    if (!track) return;

    const inserts = [...track.inserts];
    const index = inserts.findIndex(entry => entry.id === insertId);
    if (index < 0) return;
    const target = Math.max(0, Math.min(inserts.length - 1, Math.round(targetIndex)));
    if (target === index) return;

    const [insert] = inserts.splice(index, 1);
    if (!insert) return;
    inserts.splice(target, 0, insert);
    this.commitInserts(trackId, inserts);
  }

  replaceInserts(
    trackId: string,
    inserts: readonly InsertConfig[]
  ): boolean {
    if (!this.engine.supportsInserts) return false;
    const track = this.store.getState().kit.tracks[trackId];
    if (!track) return false;

    const definitions = new Set(this.listPlugins().map(entry => entry.id));
    const next = inserts
      .filter(insert => definitions.has(insert.pluginId))
      .map(insert => ({ ...insert, params: { ...insert.params } }));
    this.commitInserts(trackId, next);

    const kept = new Set(next.map(insert => insert.id));
    this.store.update(state => ({
      ...state,
      modulation: {
        ...state.modulation,
        routes: state.modulation.routes.filter(
          route =>
            route.target.trackId !== trackId ||
            kept.has(route.target.insertId)
        )
      }
    }));
    return true;
  }

  setEffectWet(trackId: string, effect: EffectKind, wet: number): void {
    this.engine.setEffectWet(trackId, effect, wet);
  }

  getMasterLevel(): number {
    return this.engine.getMasterLevel();
  }

  getMasterSpectrum(bins: number): readonly number[] {
    return this.engine.getMasterSpectrum(bins);
  }

  getTrackSpectrum(trackId: string, bins: number): readonly number[] {
    return this.engine.getTrackSpectrum(trackId, bins);
  }

  getTrackLevel(trackId: string): number {
    return this.engine.getTrackLevel(trackId);
  }

  getBusLevel(busId: string): number {
    return this.engine.getBusLevel(busId);
  }

  getAudioStats(): {
    readonly underruns: number;
    readonly underrunDuration: number;
    readonly totalDuration: number;
  } | null {
    return this.engine.getAudioStats();
  }

  setSidechain(patch: Partial<SidechainConfig>): void {
    const state = this.store.getState();
    const current = state.kit.sidechain ?? DEFAULT_SIDECHAIN;
    const sidechain: SidechainConfig = { ...current, ...patch };
    const scenes = Object.fromEntries(
      Object.entries(state.scenes).map(([id, scene]) => [
        id,
        { ...scene, kit: { ...scene.kit, sidechain } }
      ])
    ) as typeof state.scenes;

    this.store.update(next => ({
      ...next,
      kit: { ...next.kit, sidechain },
      scenes
    }));
    this.engine.setSidechain(sidechain);
  }

  setMasterVolume(db: number): void {
    const masterVolume = clamp(db, -60, 0);
    this.store.update(state => ({ ...state, masterVolume }));
    this.engine.setMasterVolume(masterVolume);
  }

  setMasterEq(patch: Partial<EqSettings>): void {
    const state = this.store.getState();
    const current = state.masterEq ?? { low: 0, mid: 0, high: 0 };
    const masterEq: EqSettings = {
      low: clamp(patch.low ?? current.low, -18, 18),
      mid: clamp(patch.mid ?? current.mid, -18, 18),
      high: clamp(patch.high ?? current.high, -18, 18)
    };
    this.store.update(next => ({ ...next, masterEq }));
    this.engine.setMasterEq(masterEq);
  }

  beginTransition(): void {
    this.engine.beginTransition();
  }

  endTransition(): void {
    this.engine.endTransition();
  }

  toggleMute(trackId: string): void {
    const track = this.store.getState().kit.tracks[trackId];
    if (!track) return;
    const next = this.updateTrackAndReturn(trackId, current => ({
      ...current,
      muted: !current.muted
    }));
    this.syncMutes(next);
  }

  setTrackMuted(trackId: string, muted: boolean): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track || track.muted === muted) return;

    const scenes = { ...state.scenes };
    Object.entries(scenes).forEach(([sceneId, scene]) => {
      const sceneTrack = scene.kit.tracks[trackId];
      if (!sceneTrack) return;
      scenes[sceneId as keyof typeof scenes] = {
        ...scene,
        kit: {
          ...scene.kit,
          tracks: {
            ...scene.kit.tracks,
            [trackId]: { ...sceneTrack, muted }
          }
        }
      };
    });

    const next: InstrumentState = {
      ...state,
      kit: {
        ...state.kit,
        tracks: {
          ...state.kit.tracks,
          [trackId]: { ...track, muted }
        }
      },
      scenes
    };

    this.store.update(() => next);
    this.syncMutes(next);
  }

  toggleSolo(trackId: string): void {
    const track = this.store.getState().kit.tracks[trackId];
    if (!track) return;
    const next = this.updateTrackAndReturn(trackId, current => ({
      ...current,
      solo: !current.solo
    }));
    this.syncMutes(next);
  }

  syncAll(state: InstrumentState = this.store.getState(), syncChains = false): void {
    this.engine.syncTracks(
      Object.values(state.kit.tracks).map(track => trackToConfig(track))
    );
    Object.values(state.kit.tracks).forEach(track => {
      this.engine.setChannelVolume(track.id, track.gainDb);
      this.engine.setChannelPan(track.id, track.pan);
      this.engine.setChannelMute(track.id, kitEffectiveMute(state.kit, track.id));
      if (syncChains) void this.engine.setTrackInserts(track.id, track.inserts);
    });

    this.engine.syncBuses(state.kit.buses.map(bus => busToConfig(bus)));
    state.kit.buses.forEach(bus => {
      this.engine.setBusReturn(bus.id, bus.returnDb);
      if (syncChains) void this.engine.setBusInserts(bus.id, bus.inserts);
    });
    this.engine.syncBusSends(state.kit.buses);
    Object.values(state.kit.tracks).forEach(track => {
      track.sends.forEach(send => {
        this.engine.setTrackSend(
          track.id,
          send.busId,
          send.amount,
          send.preFader
        );
      });
    });

    this.engine.setSidechain(state.kit.sidechain);
    this.engine.setMasterEq(state.masterEq ?? { low: 0, mid: 0, high: 0 });
    this.engine.setMasterVolume(state.masterVolume);
  }

  private commitInserts(trackId: string, inserts: readonly InsertConfig[]): void {
    this.updateTrack(trackId, track => ({ ...track, inserts }));
    void this.engine.setTrackInserts(trackId, inserts).catch(error => {
      console.error('No se pudo actualizar el rack de inserts:', error);
    });
  }

  private updateTrack(trackId: string, updater: (track: TrackState) => TrackState): void {
    this.updateTrackAndReturn(trackId, updater);
  }

  private updateTrackAndReturn(
    trackId: string,
    updater: (track: TrackState) => TrackState
  ): InstrumentState {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track) return state;

    const next: InstrumentState = {
      ...state,
      kit: {
        ...state.kit,
        tracks: {
          ...state.kit.tracks,
          [trackId]: updater(track)
        }
      }
    };
    this.store.update(() => next);
    return next;
  }

  private syncMutes(state: InstrumentState): void {
    Object.values(state.kit.tracks).forEach(track => {
      this.engine.setChannelMute(track.id, kitEffectiveMute(state.kit, track.id));
    });
  }
}

function uniqueInsertId(inserts: readonly InsertConfig[], pluginId: string): string {
  const ids = new Set(inserts.map(insert => insert.id));
  if (!ids.has(pluginId)) return pluginId;
  let index = 2;
  while (ids.has(`${pluginId}-${index}`)) index += 1;
  return `${pluginId}-${index}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
