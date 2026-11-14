import { describe, expect, it } from 'vitest';
import {
  analyzeCoreBuffer,
  stereoRmsDb
} from '../../../audio-check/core-metrics';
import { AudioCore } from './audio-core';
import type { CoreGraph, CoreTrackConfig } from './types';

const SAMPLE_RATE = 48_000;

const kickTrack = (id = 'kick'): CoreTrackConfig => ({
  id,
  machine: { kind: 'membrane' },
  gainDb: -4,
  pan: 0,
  mute: false,
  solo: false
});

function graph(tracks: readonly CoreTrackConfig[] = [kickTrack()]): CoreGraph {
  return {
    tracks,
    master: { volumeDb: -4, limiterDb: -1 }
  };
}

function render(
  core: AudioCore,
  seconds: number
): { left: Float32Array; right: Float32Array } {
  const frames = Math.round(SAMPLE_RATE * seconds);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  core.render(left, right);
  return { left, right };
}

function peak(samples: Float32Array): number {
  let value = 0;
  for (const sample of samples) value = Math.max(value, Math.abs(sample));
  return value;
}

function renderKick(
  tracks: readonly CoreTrackConfig[] = [kickTrack()],
  events: readonly { trackId: string; time: number; velocity?: number }[] = [
    { trackId: 'kick', time: 0, velocity: 1 }
  ],
  seed = 1234
): { left: Float32Array; right: Float32Array } {
  const core = new AudioCore(graph(tracks), SAMPLE_RATE, seed);
  events.forEach(event =>
    core.schedule({ type: 'kick', ...event })
  );
  return render(core, 1.6);
}

describe('AudioCore', () => {
  it('renders the same PCM twice with the same seed', () => {
    const first = renderKick();
    const second = renderKick();
    expect(first.left).toEqual(second.left);
    expect(first.right).toEqual(second.right);
  });

  it('triggers at the scheduled frame', () => {
    const core = new AudioCore(graph(), SAMPLE_RATE, 99);
    core.schedule({ type: 'kick', trackId: 'kick', time: 0.1, velocity: 1 });
    const { left, right } = render(core, 0.2);

    const firstNonZero = left.findIndex(value => value !== 0);
    expect(firstNonZero).toBeGreaterThanOrEqual(4_800);
    expect(firstNonZero).toBeLessThan(4_810);
    expect(left[4_799]).toBe(0);
    expect(right.some(value => value !== 0)).toBe(true);
  });

  it('mutes a track without affecting the others', () => {
    const both = [kickTrack('kick'), kickTrack('kick-2')];
    const events = [
      { trackId: 'kick', time: 0, velocity: 1 },
      { trackId: 'kick-2', time: 0, velocity: 1 }
    ];
    const muted = renderKick(
      both.map(track =>
        track.id === 'kick-2' ? { ...track, mute: true } : track
      ),
      events
    );
    const onlyKick = renderKick([kickTrack('kick')], [events[0]!]);
    expect(muted.left).toEqual(onlyKick.left);
    expect(muted.right).toEqual(onlyKick.right);
  });

  it('solo isolates a track', () => {
    const both = [kickTrack('kick'), kickTrack('kick-2')];
    const events = [
      { trackId: 'kick', time: 0, velocity: 1 },
      { trackId: 'kick-2', time: 0, velocity: 1 }
    ];
    const solo = renderKick(
      both.map(track =>
        track.id === 'kick-2' ? { ...track, solo: true } : track
      ),
      events
    );
    const onlyKick2 = renderKick([kickTrack('kick-2')], [events[1]!]);
    expect(solo.left).toEqual(onlyKick2.left);
    expect(solo.right).toEqual(onlyKick2.right);
  });

  it('routes a track through a bus', () => {
    const direct = renderKick();
    const core = new AudioCore(
      {
        tracks: [{ ...kickTrack(), outputBusId: 'bus' }],
        buses: [{ id: 'bus', returnDb: 0, inserts: [] }],
        master: { volumeDb: -4, limiterDb: -1 }
      },
      SAMPLE_RATE,
      1234
    );
    core.schedule({ type: 'kick', trackId: 'kick', time: 0, velocity: 1 });
    const routed = render(core, 1.6);
    expect(routed.left).toEqual(direct.left);
    expect(routed.right).toEqual(direct.right);
  });

  it('adds a post-fader send to a bus', () => {
    const direct = renderKick();
    const core = new AudioCore(
      {
        tracks: [
          {
            ...kickTrack(),
            sends: [{ busId: 'send-bus', amount: 1, preFader: false }]
          }
        ],
        buses: [{ id: 'send-bus', returnDb: 0, inserts: [] }],
        master: { volumeDb: -4, limiterDb: -1 }
      },
      SAMPLE_RATE,
      1234
    );
    core.schedule({ type: 'kick', trackId: 'kick', time: 0, velocity: 1 });
    const withSend = render(core, 1.6);
    const directPeak = peak(direct.left);
    const sendPeak = peak(withSend.left);
    expect(sendPeak).toBeCloseTo(directPeak * 2, 5);
    expect(core.getTrackLevels().kick).toBeGreaterThan(0);
    expect(core.getBusLevels()['send-bus']).toBeGreaterThan(0);
  });

  it('ducks the bass when the kick hits', () => {
    const bassTrack: CoreTrackConfig = {
      id: 'bass',
      machine: {
        kind: 'mono',
        oscillator: 'sawtooth',
        envelope: { attack: 0.001, decay: 0.1, sustain: 0.8, release: 0.1 },
        filter: { frequency: 800, q: 2 },
        glide: 0
      },
      gainDb: -6,
      pan: 0,
      mute: false,
      solo: true
    };
    const sidechain = {
      enabled: true,
      sourceTrackId: 'kick',
      targetTrackId: 'bass',
      depthDb: 6,
      attack: 0.006,
      release: 0.16
    } as const;

    const renderDuck = (enabled: boolean): Float32Array => {
      const core = new AudioCore(
        {
          tracks: [kickTrack(), bassTrack],
          sidechain: { ...sidechain, enabled },
          master: { volumeDb: 0, limiterDb: -1 }
        },
        SAMPLE_RATE,
        1234
      );
      core.schedule({ type: 'kick', trackId: 'kick', time: 0, velocity: 1 });
      core.schedule({
        type: 'synth',
        trackId: 'bass',
        time: 0,
        notes: [33],
        duration: 0.4,
        velocity: 1
      });
      return render(core, 0.3).left;
    };

    const withDuck = renderDuck(true);
    const withoutDuck = renderDuck(false);
    const start = Math.round(0.03 * SAMPLE_RATE);
    const end = Math.round(0.12 * SAMPLE_RATE);
    const rms = (samples: Float32Array): number => {
      let sum = 0;
      for (let index = start; index < end; index += 1) {
        const value = samples[index] ?? 0;
        sum += value * value;
      }
      return Math.sqrt(sum / (end - start));
    };
    expect(rms(withDuck)).toBeLessThan(rms(withoutDuck) * 0.75);
  });

  it('modulates an insert parameter sample-accurately', () => {
    const track = {
      ...kickTrack(),
      inserts: [
        {
          id: 'filter',
          pluginId: 'filter',
          bypass: false,
          params: { cutoff: 500, q: 1 }
        }
      ]
    };
    const build = (modulate: boolean): Float32Array => {
      const core = new AudioCore(
        {
          tracks: [track],
          master: { volumeDb: -4, limiterDb: -1 }
        },
        SAMPLE_RATE,
        1234
      );
      if (modulate) {
        core.addAudioModulation({
          id: 'lfo',
          trackId: 'kick',
          insertId: 'filter',
          param: 'cutoff',
          rate: 8,
          shape: 'sine',
          amount: 1,
          bipolar: false,
          min: 20,
          max: 20_000,
          base: 500
        });
      }
      core.schedule({ type: 'kick', trackId: 'kick', time: 0, velocity: 1 });
      return render(core, 1.6).left;
    };
    expect(build(true)).not.toEqual(build(false));
  });

  it('sends a bus into another bus', () => {
    const build = (send: boolean): Float32Array => {
      const core = new AudioCore(
        {
          tracks: [{ ...kickTrack(), outputBusId: 'a' }],
          buses: [
            {
              id: 'a',
              returnDb: -120,
              inserts: [],
              sends: send
                ? [{ busId: 'b', amount: 1, preFader: false }]
                : []
            },
            { id: 'b', returnDb: 0, inserts: [] }
          ],
          master: { volumeDb: -4, limiterDb: -1 }
        },
        SAMPLE_RATE,
        1234
      );
      core.schedule({ type: 'kick', trackId: 'kick', time: 0, velocity: 1 });
      return render(core, 0.5).left;
    };
    expect(peak(build(false))).toBeLessThan(0.001);
    expect(peak(build(true))).toBeGreaterThan(0.01);
  });

  it('limits the master output below the limiter threshold', () => {
    const core = new AudioCore(
      {
        tracks: [kickTrack()],
        master: { volumeDb: 12, limiterDb: -1 }
      },
      SAMPLE_RATE,
      7
    );
    core.schedule({ type: 'kick', trackId: 'kick', time: 0, velocity: 1 });
    const { left, right } = render(core, 1.6);
    const metrics = analyzeCoreBuffer(left, right, SAMPLE_RATE);
    expect(metrics.peakDb).toBeLessThanOrEqual(-0.99);
  });

  it('limits with lookahead enabled', () => {
    const core = new AudioCore(
      {
        tracks: [kickTrack()],
        master: { volumeDb: 12, limiterDb: -1, lookaheadMs: 5 }
      },
      SAMPLE_RATE,
      7
    );
    core.schedule({ type: 'kick', trackId: 'kick', time: 0, velocity: 1 });
    const { left, right } = render(core, 1.6);
    const metrics = analyzeCoreBuffer(left, right, SAMPLE_RATE);
    expect(metrics.silent).toBe(false);
    expect(metrics.peakDb).toBeLessThanOrEqual(-0.99);
  });

  it('keeps the kick tail and releases the voice', () => {
    const { left, right } = renderKick();
    const metrics = analyzeCoreBuffer(left, right, SAMPLE_RATE);
    expect(metrics.kickTailDb).toBeGreaterThan(-45);
    expect(
      stereoRmsDb(left, right, SAMPLE_RATE, { start: 1.5, end: 1.6 })
    ).toBeLessThan(-80);
  });

  it('resets its timeline and voices', () => {
    const core = new AudioCore(graph(), SAMPLE_RATE, 1234);
    core.schedule({ type: 'kick', trackId: 'kick', time: 0, velocity: 1 });
    const first = render(core, 0.5);
    core.reset();
    expect(core.currentFrame).toBe(0);
    core.schedule({ type: 'kick', trackId: 'kick', time: 0, velocity: 1 });
    const second = render(core, 0.5);
    expect(first.left).toEqual(second.left);
    expect(first.right).toEqual(second.right);
  });

  it('rejects duplicate track ids', () => {
    expect(() => new AudioCore(graph([kickTrack(), kickTrack()]), SAMPLE_RATE)).toThrow(
      'Track duplicado'
    );
  });
});
