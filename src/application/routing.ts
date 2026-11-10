import { createBus } from '../domain/default-kit';
import type { SendConfig } from '../domain/graph';
import { busToConfig, type KitState, type TrackState } from '../domain/kit';
import { wouldCreateCycle } from '../domain/patch';
import type { AudioEnginePort, StatusPort } from '../domain/ports';
import type { SceneSnapshot } from '../domain/scene';
import type { Store } from './store';

export class RoutingService {
  constructor(
    private readonly store: Store,
    private readonly engine: AudioEnginePort,
    private readonly status?: StatusPort
  ) {}

  setSend(trackId: string, busId: string, amount: number): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    const bus = state.kit.buses.find(entry => entry.id === busId);
    if (!track || !bus) return;

    const nextAmount = clamp(amount, 0, 1);
    const existing = track.sends.find(send => send.busId === busId);
    const send: SendConfig = existing
      ? { ...existing, amount: nextAmount }
      : { busId, amount: nextAmount, preFader: false };

    this.updateTrack(trackId, current => ({
      ...current,
      sends: upsertSend(current.sends, send)
    }));
    this.engine.setTrackSend(trackId, busId, nextAmount, send.preFader);
  }

  setSendPre(trackId: string, busId: string, preFader: boolean): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    const bus = state.kit.buses.find(entry => entry.id === busId);
    if (!track || !bus) return;

    const existing = track.sends.find(send => send.busId === busId);
    const send: SendConfig = existing
      ? { ...existing, preFader }
      : { busId, amount: 0, preFader };

    this.updateTrack(trackId, current => ({
      ...current,
      sends: upsertSend(current.sends, send)
    }));
    this.engine.setTrackSend(trackId, busId, send.amount, preFader);
  }

  addBus(): void {
    const state = this.store.getState();
    const bus = createBus(nextBusIndex(state.kit.buses));
    const next = {
      ...state,
      kit: { ...state.kit, buses: [...state.kit.buses, bus] },
      scenes: mapScenes(state, scene => ({
        ...scene,
        kit: { ...scene.kit, buses: [...scene.kit.buses, bus] }
      }))
    };
    this.store.update(() => next);
    this.engine.addBus(busToConfig(bus));
    this.status?.generative(`${bus.name} creado.`);
  }

  removeBus(busId: string): void {
    const state = this.store.getState();
    const bus = state.kit.buses.find(entry => entry.id === busId);
    if (!bus) return;
    const next = {
      ...state,
      kit: removeBusFromKit(state.kit, busId),
      scenes: mapScenes(state, scene => ({
        ...scene,
        kit: removeBusFromKit(scene.kit, busId)
      }))
    };
    this.store.update(() => next);
    this.engine.removeBus(busId);
    this.status?.generative(`${bus.name} eliminado.`);
  }

  setBusReturn(busId: string, db: number): void {
    const state = this.store.getState();
    const bus = state.kit.buses.find(entry => entry.id === busId);
    if (!bus) return;

    const returnDb = clamp(db, -60, 6);
    this.store.update(current => ({
      ...current,
      kit: {
        ...current.kit,
        buses: current.kit.buses.map(entry =>
          entry.id === busId ? { ...entry, returnDb } : entry
        )
      }
    }));
    this.engine.setBusReturn(busId, returnDb);
  }

  setBusSend(fromBusId: string, toBusId: string, amount: number): void {
    const state = this.store.getState();
    const source = state.kit.buses.find(bus => bus.id === fromBusId);
    const target = state.kit.buses.find(bus => bus.id === toBusId);
    if (!source || !target || fromBusId === toBusId) return;

    const edges = Object.fromEntries(
      state.kit.buses.map(bus => [
        bus.id,
        bus.sends.filter(send => send.busId !== toBusId).map(send => send.busId)
      ])
    ) as Record<string, readonly string[]>;
    if (wouldCreateCycle(edges, fromBusId, toBusId)) {
      this.status?.generative('Ese envío crearía un ciclo de buses.');
      return;
    }

    const nextAmount = clamp(amount, 0, 1);
    const sends = [
      ...source.sends.filter(send => send.busId !== toBusId),
      ...(nextAmount > 0
        ? [{ busId: toBusId, amount: nextAmount, preFader: false }]
        : [])
    ];

    this.store.update(current => ({
      ...current,
      kit: {
        ...current.kit,
        buses: current.kit.buses.map(bus =>
          bus.id === fromBusId ? { ...bus, sends } : bus
        )
      }
    }));
    this.engine.setBusSend(fromBusId, toBusId, nextAmount);
  }

  clearBusSend(fromBusId: string, toBusId: string): void {
    this.setBusSend(fromBusId, toBusId, 0);
  }

  private updateTrack(
    trackId: string,
    updater: (track: TrackState) => TrackState
  ): void {
    this.store.update(current => {
      const track = current.kit.tracks[trackId];
      if (!track) return current;
      return {
        ...current,
        kit: {
          ...current.kit,
          tracks: {
            ...current.kit.tracks,
            [trackId]: updater(track)
          }
        }
      };
    });
  }
}

function upsertSend(
  sends: readonly SendConfig[],
  send: SendConfig
): readonly SendConfig[] {
  const index = sends.findIndex(entry => entry.busId === send.busId);
  if (index < 0) return [...sends, send];
  return sends.map(entry => (entry.busId === send.busId ? send : entry));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nextBusIndex(buses: readonly { id: string }[]): number {
  let max = 2;
  buses.forEach(bus => {
    const match = /^bus-(\d+)$/.exec(bus.id);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return max + 1;
}

function removeBusFromKit(kit: KitState, busId: string): KitState {
  const buses = kit.buses
    .filter(bus => bus.id !== busId)
    .map(bus => ({
      ...bus,
      sends: bus.sends.filter(send => send.busId !== busId)
    }));
  const tracks = Object.fromEntries(
    Object.entries(kit.tracks).map(([id, track]) => [
      id,
      {
        ...track,
        sends: track.sends.filter(send => send.busId !== busId)
      }
    ])
  );
  return { ...kit, buses, tracks };
}

function mapScenes(
  state: ReturnType<Store['getState']>,
  mapper: (scene: SceneSnapshot) => SceneSnapshot
): ReturnType<Store['getState']>['scenes'] {
  return Object.fromEntries(
    Object.entries(state.scenes).map(([id, scene]) => [id, mapper(scene)])
  ) as ReturnType<Store['getState']>['scenes'];
}
