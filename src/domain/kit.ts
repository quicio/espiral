import type { ChannelKey } from './channels';
import type {
  BusConfig,
  InsertConfig,
  MachineConfig,
  SendConfig,
  TrackConfig
} from './graph';
import type { NoteSource } from './machines';

export type TrackRole = ChannelKey | 'user';

export interface TrackState {
  readonly id: string;
  readonly name: string;
  readonly role: TrackRole;
  readonly hasPattern: boolean;
  readonly machineId: string;
  readonly machine: MachineConfig;
  readonly noteSource: NoteSource;
  readonly macros: readonly number[];
  readonly gainDb: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly inserts: readonly InsertConfig[];
  readonly sends: readonly SendConfig[];
}

export interface BusState {
  readonly id: string;
  readonly name: string;
  readonly returnDb: number;
  readonly inserts: readonly InsertConfig[];
  readonly sends: readonly SendConfig[];
}

export interface KitState {
  readonly id: string;
  readonly name: string;
  readonly tracks: Readonly<Record<string, TrackState>>;
  readonly buses: readonly BusState[];
}

export function kitTracks(kit: KitState): readonly TrackState[] {
  return Object.values(kit.tracks);
}

export function kitHasSolo(kit: KitState): boolean {
  return kitTracks(kit).some(track => track.solo);
}

export function kitEffectiveMute(kit: KitState, trackId: string): boolean {
  const track = kit.tracks[trackId];
  if (!track) return true;
  return track.muted || (kitHasSolo(kit) && !track.solo);
}

export function findTrackByRole(kit: KitState, role: ChannelKey): TrackState | undefined {
  return kitTracks(kit).find(track => track.role === role);
}

export function trackToConfig(track: TrackState): TrackConfig {
  return {
    id: track.id,
    name: track.name,
    role: track.role,
    machine: track.machine,
    gainDb: track.gainDb,
    pan: track.pan,
    mute: track.muted,
    solo: track.solo,
    inserts: track.inserts,
    sends: track.sends
  };
}

export function busToConfig(bus: BusState): BusConfig {
  return {
    id: bus.id,
    name: bus.name,
    returnDb: bus.returnDb,
    inserts: bus.inserts,
    sends: bus.sends
  };
}

export function cloneKit(kit: KitState): KitState {
  const tracks = Object.fromEntries(
    kitTracks(kit).map(track => [
      track.id,
      {
        ...track,
        machine: {
          ...track.machine,
          ...(track.machine.samples ? { samples: [...track.machine.samples] } : {})
        },
        inserts: track.inserts.map(insert => ({
          ...insert,
          params: { ...insert.params }
        })),
        sends: track.sends.map(send => ({ ...send }))
      }
    ])
  ) as Record<string, TrackState>;

  return {
    ...kit,
    tracks,
    buses: kit.buses.map(bus => ({
      ...bus,
      inserts: bus.inserts.map(insert => ({
        ...insert,
        params: { ...insert.params }
      })),
      sends: bus.sends.map(send => ({ ...send }))
    }))
  };
}
