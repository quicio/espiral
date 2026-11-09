import { findInsertByPlugin, isChannelKey, type ChannelKey } from '../domain/channels';
import type { EffectKind } from '../domain/audio';
import type { InsertConfig } from '../domain/graph';
import { kitEffectiveMute, type TrackState } from '../domain/kit';
import type { InstrumentState } from '../domain/models';
import {
  clampPluginParam,
  defaultPluginState,
  type PluginDefinition
} from '../domain/plugin';
import type { AudioEnginePort } from '../domain/ports';
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

  listPlugins(): readonly PluginDefinition[] {
    return this.engine.listPlugins();
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

  setEffectWet(trackId: string, effect: EffectKind, wet: number): void {
    this.engine.setEffectWet(trackId, effect, wet);
  }

  getMasterLevel(): number {
    return this.engine.getMasterLevel();
  }

  setMasterVolume(db: number): void {
    const masterVolume = clamp(db, -60, 0);
    this.store.update(state => ({ ...state, masterVolume }));
    this.engine.setMasterVolume(masterVolume);
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
    Object.values(state.kit.tracks).forEach(track => {
      if (this.engine.supportsInserts) {
        this.engine.setChannelVolume(track.id, track.gainDb);
        this.engine.setChannelPan(track.id, track.pan);
        this.engine.setChannelMute(track.id, kitEffectiveMute(state.kit, track.id));
        if (syncChains) void this.engine.setTrackInserts(track.id, track.inserts);
      } else if (isChannelKey(track.role)) {
        this.engine.setChannelVolume(track.role, track.gainDb);
        this.engine.setChannelPan(track.role, track.pan);
        this.engine.setChannelMute(track.role, kitEffectiveMute(state.kit, track.id));
        this.syncLegacyEffects(track.role, track);
      }
    });

    if (this.engine.supportsRouting) {
      state.kit.buses.forEach(bus => {
        this.engine.setBusReturn(bus.id, bus.returnDb);
        if (syncChains) void this.engine.setBusInserts(bus.id, bus.inserts);
      });
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
    }

    this.engine.setMasterVolume(state.masterVolume);
  }

  private syncLegacyEffects(channel: ChannelKey, track: TrackState): void {
    const delay = findInsertByPlugin(track.inserts, 'delay');
    if (delay) {
      this.engine.setDelaySettings(channel, {
        wet: delay.params.wet ?? 0.3,
        feedback: delay.params.feedback ?? 0.35,
        time: delay.params.time ?? 0.25
      });
    }

    const reverb = findInsertByPlugin(track.inserts, 'reverb');
    if (reverb) {
      this.engine.setReverbSettings(channel, {
        wet: reverb.params.wet ?? 0.5,
        decay: reverb.params.decay ?? 4
      });
    }
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
      if (this.engine.supportsInserts) {
        this.engine.setChannelMute(track.id, kitEffectiveMute(state.kit, track.id));
      } else if (isChannelKey(track.role)) {
        this.engine.setChannelMute(track.role, kitEffectiveMute(state.kit, track.id));
      }
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
