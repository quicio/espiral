import type { ChannelKey } from './channels';
import type {
  BusConfig,
  InsertConfig,
  MachineConfig,
  SendConfig,
  TrackConfig
} from './graph';
import type { NoteSource } from './machines';
import type { SidechainConfig } from './sidechain';

export type TrackRole = ChannelKey | 'user';

export const GENERATIVE_ROLES = ['drone', 'pad', 'lead'] as const;
export type GenerativeRole = (typeof GENERATIVE_ROLES)[number];

export const DRUM_ROLES = ['kick', 'bass', 'hihat', 'perc'] as const;

export function isGenerativeRole(role: TrackRole): role is GenerativeRole {
  return (GENERATIVE_ROLES as readonly string[]).includes(role);
}

export function isDrumRole(role: TrackRole): boolean {
  return (DRUM_ROLES as readonly string[]).includes(role);
}

export function canEditTrackSound(track: TrackState): boolean {
  return track.role === 'user' || isGenerativeRole(track.role);
}

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
  /** Si existe, el track va a ese bus en vez del master. */
  readonly outputBusId?: string;
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
  readonly sidechain?: SidechainConfig;
}

export type { SidechainConfig } from './sidechain';

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
    sends: track.sends,
    ...(track.outputBusId ? { outputBusId: track.outputBusId } : {})
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
