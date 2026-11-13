export type ChannelKey = 'kick' | 'bass' | 'hihat' | 'perc' | 'drone' | 'pad' | 'lead';
export type PatternChannel = 'kick' | 'bass' | 'hihat' | 'perc';
export type SynthChannel = 'pad' | 'lead';
export type SampleChannel = 'bass' | 'hihat' | 'drone' | 'perc';

export interface ChannelDescriptor {
  readonly name: string;
  readonly pattern: boolean;
}

export const CHANNEL_KEYS = [
  'kick',
  'bass',
  'hihat',
  'perc',
  'drone',
  'pad',
  'lead'
] as const satisfies readonly ChannelKey[];

export const PATTERN_CHANNELS = [
  'kick',
  'bass',
  'hihat',
  'perc'
] as const satisfies readonly PatternChannel[];

export const CHANNELS: Record<ChannelKey, ChannelDescriptor> = {
  kick: { name: 'Kick 4/4', pattern: true },
  bass: { name: 'Bass', pattern: true },
  hihat: { name: 'Hi-Hat', pattern: true },
  perc: { name: 'Perc', pattern: true },
  drone: { name: 'Drone', pattern: false },
  pad: { name: 'Pad', pattern: false },
  lead: { name: 'Lead', pattern: false }
};

export const PATTERN_LENGTH = 16;

import type { InsertConfig } from './graph';

export interface DelaySettings {
  readonly wet: number;
  readonly feedback: number;
  readonly time: number;
}

export interface ReverbSettings {
  readonly wet: number;
  readonly decay: number;
}

export interface ChannelMixState {
  readonly volumeDb: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly inserts: readonly InsertConfig[];
}

export type MixState = Record<ChannelKey, ChannelMixState>;

export const DEFAULT_MASTER_VOLUME = -4;

export function delayInsert(wet: number, feedback: number, time: number): InsertConfig {
  return {
    id: 'delay',
    pluginId: 'delay',
    bypass: false,
    params: { wet, feedback, time }
  };
}

export function reverbInsert(wet: number, decay: number): InsertConfig {
  return {
    id: 'reverb',
    pluginId: 'reverb',
    bypass: false,
    params: { wet, decay }
  };
}

export function compressorInsert(
  threshold: number,
  ratio: number,
  attack: number,
  release: number
): InsertConfig {
  return {
    id: 'compressor',
    pluginId: 'compressor',
    bypass: false,
    params: { threshold, ratio, attack, release }
  };
}

export function driveInsert(drive: number, mix: number): InsertConfig {
  return {
    id: 'drive',
    pluginId: 'drive',
    bypass: false,
    params: { drive, mix }
  };
}

export const DEFAULT_MIX: MixState = {
  kick: { volumeDb: -4, muted: false, solo: false, inserts: [] },
  bass: { volumeDb: -8, muted: false, solo: false, inserts: [] },
  hihat: {
    volumeDb: -10,
    muted: false,
    solo: false,
    inserts: [delayInsert(0.3, 0.35, 0.25), reverbInsert(0.4, 1.8)]
  },
  perc: { volumeDb: -8, muted: false, solo: false, inserts: [] },
  drone: {
    volumeDb: -10,
    muted: false,
    solo: false,
    inserts: [delayInsert(0.3, 0.4, 0.25), reverbInsert(0.5, 4)]
  },
  pad: {
    volumeDb: -14,
    muted: false,
    solo: false,
    inserts: [delayInsert(0.3, 0.4, 0.25), reverbInsert(0.5, 4)]
  },
  lead: {
    volumeDb: -16,
    muted: false,
    solo: false,
    inserts: [delayInsert(0.2, 0.3, 0.25), reverbInsert(0.4, 2.5)]
  }
};

export function cloneMix(mix: MixState): MixState {
  const entries = CHANNEL_KEYS.map(key => {
    const channel = mix[key];
    return [
      key,
      {
        ...channel,
        inserts: channel.inserts.map(insert => ({
          ...insert,
          params: { ...insert.params }
        }))
      }
    ] as const;
  });
  return Object.fromEntries(entries) as unknown as MixState;
}

export function findInsertByPlugin(
  inserts: readonly InsertConfig[],
  pluginId: string
): InsertConfig | undefined {
  return inserts.find(insert => insert.pluginId === pluginId);
}

export function updateInsertParams(
  inserts: readonly InsertConfig[],
  insertId: string,
  params: Readonly<Record<string, number>>
): readonly InsertConfig[] {
  return inserts.map(insert =>
    insert.id === insertId ? { ...insert, params: { ...insert.params, ...params } } : insert
  );
}

export function isChannelKey(value: string): value is ChannelKey {
  return (CHANNEL_KEYS as readonly string[]).includes(value);
}

export function isPatternChannel(value: string): value is PatternChannel {
  return (PATTERN_CHANNELS as readonly string[]).includes(value);
}

export function channelName(key: ChannelKey): string {
  return CHANNELS[key].name;
}

export function hasSolo(mix: MixState): boolean {
  return CHANNEL_KEYS.some(key => mix[key].solo);
}

export function effectiveMute(mix: MixState, key: ChannelKey): boolean {
  const channel = mix[key];
  const anySolo = hasSolo(mix);
  return channel.muted || (anySolo && !channel.solo);
}
