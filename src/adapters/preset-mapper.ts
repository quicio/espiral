import { findInsertByPlugin, isChannelKey } from '../domain/channels';
import { cloneKit, type TrackState } from '../domain/kit';
import type { InstrumentState } from '../domain/models';
import type { PresetCodec, PresetConfig } from '../domain/ports';

export class PresetMapper implements PresetCodec {
  fromDto(raw: unknown, current: InstrumentState): PresetConfig {
    const data = asRecord(raw);
    if (!data) throw new Error('Preset inválido');

    const kit = cloneKit(current.kit);
    const tracks = { ...kit.tracks };
    const channels = asRecord(data.channels);

    if (channels) {
      Object.entries(channels).forEach(([key, value]) => {
        if (!isChannelKey(key)) return;
        const track =
          tracks[key] ?? Object.values(tracks).find(entry => entry.role === key);
        if (!track) return;
        const config = asRecord(value);
        if (!config) return;

        let next: TrackState = track;
        if (typeof config.volume === 'number') {
          next = { ...next, gainDb: clamp(config.volume, -60, 6) };
        }
        if (typeof config.muted === 'boolean') {
          next = { ...next, muted: config.muted };
        }
        if (typeof config.solo === 'boolean') {
          next = { ...next, solo: config.solo };
        }

        const effects = asRecord(config.effects);
        if (effects) {
          const delay = asRecord(effects.delay);
          const currentDelay = findInsertByPlugin(next.inserts, 'delay');
          if (delay && currentDelay) {
            const params = { ...currentDelay.params };
            if (typeof delay.wet === 'number') params.wet = clamp(delay.wet, 0, 1);
            if (typeof delay.feedback === 'number') {
              params.feedback = clamp(delay.feedback, 0, 1);
            }
            if (typeof delay.delayTime === 'number') {
              params.time = clamp(delay.delayTime, 0.01, 2);
            }
            next = {
              ...next,
              inserts: next.inserts.map(insert =>
                insert.id === currentDelay.id ? { ...insert, params } : insert
              )
            };
          }

          const reverb = asRecord(effects.reverb);
          const currentReverb = findInsertByPlugin(next.inserts, 'reverb');
          if (reverb && currentReverb) {
            const params = { ...currentReverb.params };
            if (typeof reverb.wet === 'number') params.wet = clamp(reverb.wet, 0, 1);
            if (typeof reverb.decay === 'number') {
              params.decay = clamp(reverb.decay, 0.1, 10);
            } else if (typeof reverb.roomSize === 'number') {
              params.decay = clamp(0.5 + reverb.roomSize * 5.5, 0.1, 10);
            }
            next = {
              ...next,
              inserts: next.inserts.map(insert =>
                insert.id === currentReverb.id ? { ...insert, params } : insert
              )
            };
          }
        }

        tracks[next.id] = next;
      });
    }

    return {
      bpm: clamp(numberOr(data.bpm, current.transport.bpm), 40, 240),
      masterVolume: clamp(numberOr(data.masterVolume, current.masterVolume), -60, 0),
      kit: { ...kit, tracks }
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
