import type { ChannelKey } from './channels';
import { wouldCreateCycle } from './patch';
import type { SidechainConfig } from './sidechain';

export type MachineKind = 'membrane' | 'poly' | 'mono' | 'pluck' | 'sampler' | 'plugin';
export type MachinePluginState = Readonly<Record<string, number>>;

export interface EnvelopeConfig {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
}

export interface MachineConfig {
  readonly kind: MachineKind;
  readonly oscillator?: 'sine' | 'triangle' | 'square' | 'sawtooth';
  readonly envelope?: EnvelopeConfig;
  readonly samples?: readonly string[];
  readonly voices?: number;
  readonly maxPolyphony?: number;
  readonly fadeIn?: number;
  readonly fadeOut?: number;
  readonly filter?: {
    readonly frequency: number;
    readonly q: number;
  };
  /** Barrido de filtro por nota. Sin esto, un poly es un oscilador pelado. */
  readonly filterEnvelope?: {
    readonly octaves: number;
    readonly attack: number;
    readonly decay: number;
    readonly sustain: number;
    readonly release: number;
  };
  readonly pluck?: {
    readonly attackNoise: number;
    readonly dampening: number;
    readonly resonance: number;
    readonly release: number;
  };
  readonly pluginId?: string;
  readonly params?: MachinePluginState;
}

export interface InsertConfig {
  readonly id: string;
  readonly pluginId: string;
  readonly bypass: boolean;
  readonly params: Readonly<Record<string, number>>;
  readonly latencySamples?: number;
}

export interface SendConfig {
  readonly busId: string;
  readonly amount: number;
  readonly preFader: boolean;
}

export interface TrackConfig {
  readonly id: string;
  readonly name: string;
  readonly role?: ChannelKey | 'user';
  readonly machine: MachineConfig;
  readonly gainDb: number;
  readonly pan: number;
  readonly mute: boolean;
  readonly solo: boolean;
  readonly inserts: readonly InsertConfig[];
  readonly sends: readonly SendConfig[];
  /** Si existe, el track va a ese bus en vez del master. */
  readonly outputBusId?: string;
}

export function insertConfigsEqual(
  current: readonly InsertConfig[],
  next: readonly InsertConfig[]
): boolean {
  if (current.length !== next.length) return false;
  return current.every((insert, index) => {
    const other = next[index];
    if (
      !other ||
      insert.id !== other.id ||
      insert.pluginId !== other.pluginId ||
      insert.bypass !== other.bypass ||
      insert.latencySamples !== other.latencySamples
    ) {
      return false;
    }
    const keys = Object.keys(insert.params);
    if (keys.length !== Object.keys(other.params).length) return false;
    return keys.every(key => insert.params[key] === other.params[key]);
  });
}

export interface BusConfig {
  readonly id: string;
  readonly name: string;
  readonly returnDb: number;
  readonly inserts: readonly InsertConfig[];
  readonly sends?: readonly SendConfig[];
}

export interface GlueConfig {
  readonly threshold: number;
  readonly ratio: number;
  readonly attack: number;
  readonly release: number;
  readonly knee: number;
}

export interface MasterConfig {
  readonly volumeDb: number;
  readonly limiterDb: number;
  /** Trim posterior al glue y anterior al limiter. No cambia la compresión. */
  readonly trimDb?: number;
  readonly glue: GlueConfig;
}

export interface GraphConfig {
  readonly tracks: readonly TrackConfig[];
  readonly buses: readonly BusConfig[];
  readonly master: MasterConfig;
  readonly sidechain?: SidechainConfig;
}

export interface MeterReading {
  readonly peakDb: number;
  readonly rmsDb: number;
}

export interface LatencyPlan {
  readonly maxLatencySamples: number;
  readonly trackCompensation: Readonly<Record<string, number>>;
  readonly sendCompensation: Readonly<Record<string, number>>;
}

export function planLatency(config: GraphConfig): LatencyPlan {
  const busLatency = new Map<string, number>();
  config.buses.forEach(bus => {
    busLatency.set(bus.id, insertsLatency(bus.inserts));
  });

  const trackLatency = new Map<string, number>();
  config.tracks.forEach(track => {
    trackLatency.set(track.id, insertsLatency(track.inserts));
  });

  const sendPaths: { key: string; latency: number }[] = [];
  config.tracks.forEach(track => {
    const ownLatency = trackLatency.get(track.id) ?? 0;
    track.sends.forEach(send => {
      const destinationLatency = busLatency.get(send.busId) ?? 0;
      const sourceLatency = send.preFader ? 0 : ownLatency;
      sendPaths.push({
        key: `${track.id}:${send.busId}`,
        latency: sourceLatency + destinationLatency
      });
    });
  });

  const maxLatencySamples = Math.max(
    0,
    ...Array.from(trackLatency.values()),
    ...sendPaths.map(send => send.latency)
  );

  const trackCompensation: Record<string, number> = {};
  config.tracks.forEach(track => {
    trackCompensation[track.id] = Math.max(
      0,
      maxLatencySamples - (trackLatency.get(track.id) ?? 0)
    );
  });

  const sendCompensation: Record<string, number> = {};
  sendPaths.forEach(send => {
    sendCompensation[send.key] = Math.max(0, maxLatencySamples - send.latency);
  });

  return { maxLatencySamples, trackCompensation, sendCompensation };
}

function insertsLatency(inserts: readonly InsertConfig[]): number {
  return inserts.reduce(
    (total, insert) => total + Math.max(0, insert.latencySamples ?? 0),
    0
  );
}

export function validateGraph(config: GraphConfig): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const busIds = new Set<string>();

  config.tracks.forEach(track => {
    if (ids.has(track.id)) errors.push(`ID duplicado: ${track.id}`);
    ids.add(track.id);
  });

  config.buses.forEach(bus => {
    if (ids.has(bus.id)) errors.push(`ID duplicado: ${bus.id}`);
    ids.add(bus.id);
    busIds.add(bus.id);
  });

  config.tracks.forEach(track => {
    const insertIds = new Set<string>();
    track.inserts.forEach(insert => {
      if (insertIds.has(insert.id)) {
        errors.push(`Insert duplicado en ${track.id}: ${insert.id}`);
      }
      insertIds.add(insert.id);
    });
    track.sends.forEach(send => {
      if (!busIds.has(send.busId)) {
        errors.push(`Send de ${track.id} a bus inexistente: ${send.busId}`);
      }
      if (send.amount < 0 || send.amount > 1) {
        errors.push(`Send fuera de rango en ${track.id} → ${send.busId}`);
      }
    });
  });

  config.buses.forEach(bus => {
    const insertIds = new Set<string>();
    bus.inserts.forEach(insert => {
      if (insertIds.has(insert.id)) {
        errors.push(`Insert duplicado en ${bus.id}: ${insert.id}`);
      }
      insertIds.add(insert.id);
    });
  });

  const busEdges = Object.fromEntries(
    config.buses.map(bus => [
      bus.id,
      (bus.sends ?? []).map(send => send.busId)
    ])
  );
  config.buses.forEach(bus => {
    (bus.sends ?? []).forEach(send => {
      if (!busIds.has(send.busId)) {
        errors.push(`Send de bus ${bus.id} a bus inexistente: ${send.busId}`);
      }
      if (send.amount < 0 || send.amount > 1) {
        errors.push(`Send de bus fuera de rango en ${bus.id} → ${send.busId}`);
      }
      if (busIds.has(send.busId) && wouldCreateCycle(busEdges, bus.id, send.busId)) {
        errors.push(`Ciclo de buses en ${bus.id} → ${send.busId}`);
      }
    });
  });

  return errors;
}
