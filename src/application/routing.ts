import type { SendConfig } from '../domain/graph';
import type { TrackState } from '../domain/kit';
import type { AudioEnginePort } from '../domain/ports';
import type { Store } from './store';

export class RoutingService {
  constructor(
    private readonly store: Store,
    private readonly engine: AudioEnginePort
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
