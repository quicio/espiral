import { clampPluginParam } from '../domain/plugin';
import { withLock, withoutLock } from '../domain/pattern';
import type { AudioEnginePort } from '../domain/ports';
import type { Store } from './store';

export class LocksService {
  constructor(
    private readonly store: Store,
    private readonly engine: AudioEnginePort
  ) {}

  setLock(
    trackId: string,
    step: number,
    insertId: string,
    paramId: string,
    value: number
  ): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    const insert = track?.inserts.find(entry => entry.id === insertId);
    if (!insert) return;

    const definition = this.engine
      .listPlugins()
      .find(plugin => plugin.id === insert.pluginId);
    const param = definition?.params.find(entry => entry.id === paramId);
    if (!param) return;

    const lock = {
      insertId,
      paramId,
      value: clampPluginParam(param, value)
    };

    this.store.update(current => ({
      ...current,
      pattern: withLock(current.pattern, trackId, step, lock)
    }));
  }

  removeLock(
    trackId: string,
    step: number,
    insertId: string,
    paramId: string
  ): void {
    this.store.update(current => ({
      ...current,
      pattern: withoutLock(current.pattern, trackId, step, insertId, paramId)
    }));
  }
}
