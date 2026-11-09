import {
  modulationSource,
  modulationSourceValue,
  modulationTargetKey,
  type ModulationRoute,
  type ModulationTarget
} from '../domain/modulation';
import type { InstrumentState } from '../domain/models';
import type { AudioEnginePort, TickerPort } from '../domain/ports';
import type { Store } from './store';

const CONTROL_RATE_MS = 1000 / 60;

interface AppliedTarget {
  readonly target: ModulationTarget;
  readonly value: number;
}

export class ModulationService {
  private cancel: (() => void) | null = null;
  private readonly applied = new Map<string, AppliedTarget>();
  private readonly audioRouteIds = new Set<string>();
  private routeCounter = 0;

  constructor(
    private readonly store: Store,
    private readonly engine: AudioEnginePort,
    private readonly ticker: TickerPort,
    private readonly now: () => number = () =>
      (globalThis.performance?.now?.() ?? Date.now()) / 1000
  ) {}

  start(): void {
    if (this.cancel) return;
    this.cancel = this.ticker.start(() => this.tick(), CONTROL_RATE_MS);
  }

  stop(): void {
    this.cancel?.();
    this.cancel = null;
    this.restore(this.store.getState());
    this.clearAudioRoutes();
  }

  setEnabled(enabled: boolean): void {
    this.store.update(state => ({
      ...state,
      modulation: { ...state.modulation, enabled }
    }));
    if (!enabled) {
      this.restore(this.store.getState());
      this.clearAudioRoutes();
    }
  }

  setMacro(sourceId: string, value: number): void {
    this.store.update(state => ({
      ...state,
      modulation: {
        ...state.modulation,
        sources: state.modulation.sources.map(source =>
          source.id === sourceId && source.kind === 'macro'
            ? { ...source, value: clamp(value, 0, 1) }
            : source
        )
      }
    }));
  }

  setLfoRate(sourceId: string, rate: number): void {
    this.store.update(state => ({
      ...state,
      modulation: {
        ...state.modulation,
        sources: state.modulation.sources.map(source =>
          source.id === sourceId && source.kind === 'lfo'
            ? { ...source, rate: clamp(rate, 0.01, 20) }
            : source
        )
      }
    }));
  }

  addRoute(
    sourceId: string,
    target: ModulationTarget,
    amount = 0.5,
    bipolar = false
  ): void {
    const state = this.store.getState();
    if (!modulationSource(state.modulation, sourceId)) {
      const macro = parseTrackMacroSource(sourceId);
      if (!macro || !state.kit.tracks[macro.trackId]) return;
    }
    if (!target.trackId || !target.insertId || !target.paramId) return;

    const key = modulationTargetKey(target);
    const duplicate = state.modulation.routes.some(
      route =>
        route.sourceId === sourceId &&
        modulationTargetKey(route.target) === key
    );
    if (duplicate) return;

    const route: ModulationRoute = {
      id: nextRouteId(state.modulation.routes, this.routeCounter),
      sourceId,
      target: { ...target },
      amount: clamp(amount, -1, 1),
      bipolar
    };
    this.routeCounter = Math.max(
      this.routeCounter,
      Number(route.id.replace('route-', '')) || this.routeCounter
    );

    this.store.update(current => ({
      ...current,
      modulation: {
        ...current.modulation,
        routes: [...current.modulation.routes, route]
      }
    }));
  }

  removeRoute(routeId: string): void {
    this.store.update(state => ({
      ...state,
      modulation: {
        ...state.modulation,
        routes: state.modulation.routes.filter(route => route.id !== routeId)
      }
    }));
  }

  setRouteAmount(routeId: string, amount: number): void {
    this.store.update(state => ({
      ...state,
      modulation: {
        ...state.modulation,
        routes: state.modulation.routes.map(route =>
          route.id === routeId
            ? { ...route, amount: clamp(amount, -1, 1) }
            : route
        )
      }
    }));
  }

  setRouteBipolar(routeId: string, bipolar: boolean): void {
    this.store.update(state => ({
      ...state,
      modulation: {
        ...state.modulation,
        routes: state.modulation.routes.map(route =>
          route.id === routeId ? { ...route, bipolar } : route
        )
      }
    }));
  }

  tick(time = this.now()): void {
    const state = this.store.getState();
    if (!state.modulation.enabled) {
      this.restore(state);
      this.clearAudioRoutes();
      return;
    }

    const audioRouteIds = this.syncAudioRoutes(state);
    const grouped = this.groupRoutes(state, audioRouteIds);
    const appliedKeys = new Set<string>();
    grouped.forEach(({ target, routes }) => {
      const value = this.modulatedValue(state, target, routes, time);
      if (value === null) return;
      const key = modulationTargetKey(target);
      this.engine.setInsertParam(
        target.trackId,
        target.insertId,
        target.paramId,
        value
      );
      this.applied.set(key, { target, value });
      appliedKeys.add(key);
    });

    Array.from(this.applied.entries()).forEach(([key, applied]) => {
      if (appliedKeys.has(key)) return;
      this.applyBase(state, applied.target);
      this.applied.delete(key);
    });
  }

  private groupRoutes(
    state: InstrumentState,
    excluded: ReadonlySet<string>
  ): Map<string, { target: ModulationTarget; routes: ModulationRoute[] }> {
    const grouped = new Map<
      string,
      { target: ModulationTarget; routes: ModulationRoute[] }
    >();
    state.modulation.routes.forEach(route => {
      if (excluded.has(route.id)) return;
      const key = modulationTargetKey(route.target);
      const entry = grouped.get(key);
      if (entry) entry.routes.push(route);
      else grouped.set(key, { target: route.target, routes: [route] });
    });
    return grouped;
  }

  private syncAudioRoutes(state: InstrumentState): Set<string> {
    const desired = new Map<string, ModulationRoute>();
    state.modulation.routes.forEach(route => {
      const source = modulationSource(state.modulation, route.sourceId);
      if (source?.kind !== 'lfo') return;
      if (!this.engine.supportsAudioModulation(route.target)) return;
      desired.set(route.id, route);
    });

    desired.forEach((route, routeId) => {
      const source = modulationSource(state.modulation, route.sourceId);
      if (!source) return;
      this.engine.setAudioModulation(
        routeId,
        {
          rate: source.rate ?? 0.25,
          shape: source.shape ?? 'sine'
        },
        route.target,
        route.amount,
        route.bipolar
      );
      this.audioRouteIds.add(routeId);
    });

    this.audioRouteIds.forEach(routeId => {
      if (desired.has(routeId)) return;
      this.engine.removeAudioModulation(routeId);
      this.audioRouteIds.delete(routeId);
    });

    return new Set(desired.keys());
  }

  private clearAudioRoutes(): void {
    if (this.audioRouteIds.size === 0) return;
    this.engine.clearAudioModulations();
    this.audioRouteIds.clear();
  }

  private modulatedValue(
    state: InstrumentState,
    target: ModulationTarget,
    routes: readonly ModulationRoute[],
    time: number
  ): number | null {
    const descriptor = this.targetDescriptor(state, target);
    if (!descriptor) return null;

    const { base, min, max } = descriptor;
    const range = max - min;
    let offset = 0;
    routes.forEach(route => {
      const value = this.sourceValue(state, route.sourceId, time);
      const signed = route.bipolar ? value * 2 - 1 : value;
      offset += route.amount * range * signed;
    });

    return clamp(base + offset, min, max);
  }

  private sourceValue(
    state: InstrumentState,
    sourceId: string,
    time: number
  ): number {
    const macro = parseTrackMacroSource(sourceId);
    if (macro) {
      return clamp(state.kit.tracks[macro.trackId]?.macros[macro.index] ?? 0.5, 0, 1);
    }
    const source = modulationSource(state.modulation, sourceId);
    return modulationSourceValue(source, time, state.transport.currentStep);
  }

  private targetDescriptor(
    state: InstrumentState,
    target: ModulationTarget
  ): { base: number; min: number; max: number } | null {
    const track = state.kit.tracks[target.trackId];
    const insert = track?.inserts.find(entry => entry.id === target.insertId);
    if (!insert) return null;
    const definition = this.engine
      .listPlugins()
      .find(plugin => plugin.id === insert.pluginId);
    const param = definition?.params.find(entry => entry.id === target.paramId);
    if (!param) return null;

    return {
      base: insert.params[param.id] ?? param.defaultValue,
      min: param.min,
      max: param.max
    };
  }

  private restore(state: InstrumentState): void {
    Array.from(this.applied.values()).forEach(applied => {
      this.applyBase(state, applied.target);
    });
    this.applied.clear();
  }

  private applyBase(state: InstrumentState, target: ModulationTarget): void {
    const descriptor = this.targetDescriptor(state, target);
    if (!descriptor) return;
    this.engine.setInsertParam(
      target.trackId,
      target.insertId,
      target.paramId,
      descriptor.base
    );
  }
}

function parseTrackMacroSource(
  sourceId: string
): { trackId: string; index: number } | null {
  const [prefix, trackId, rawIndex] = sourceId.split(':');
  if (prefix !== 'track-macro' || !trackId) return null;
  const index = Number(rawIndex);
  if (index !== 0 && index !== 1) return null;
  return { trackId, index };
}

function nextRouteId(
  routes: readonly ModulationRoute[],
  current: number
): string {
  const ids = new Set(routes.map(route => route.id));
  let index = current + 1;
  while (ids.has(`route-${index}`)) index += 1;
  return `route-${index}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
