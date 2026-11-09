import type { ChannelKey, SampleChannel, SynthChannel } from './channels';

export type EffectKind = 'delay' | 'reverb';

export type NoteDuration = '16n' | '8n' | '4n' | '2n' | '1m' | '2m';

export type SoundEvent =
  | { readonly type: 'kick'; readonly time: number }
  | {
      readonly type: 'synth';
      readonly channel: SynthChannel;
      readonly trackId?: string;
      readonly time: number;
      readonly notes: string | readonly string[];
      readonly duration: NoteDuration;
    }
  | {
      readonly type: 'sample';
      readonly channel: SampleChannel;
      readonly trackId?: string;
      readonly time: number;
      readonly sampleIndex?: number;
      readonly playbackRate?: number;
      readonly duration?: NoteDuration;
      readonly gainDb?: number;
    };

export interface AutomationTarget {
  readonly channel: ChannelKey;
  readonly effect: EffectKind;
}
