import { writeFileSync } from 'node:fs';
import { analyzeCoreBuffer } from '../src/audio-check/core-metrics';
import { AudioCore } from '../src/infrastructure/audio/core/audio-core';
import type {
  CoreGraph,
  CoreSample,
  CoreTrackConfig
} from '../src/infrastructure/audio/core/types';
import { encodeWav } from '../src/infrastructure/audio/wav';

const SAMPLE_RATE = 48_000;

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

const kickGraph: CoreGraph = {
  tracks: [
    {
      id: 'kick',
      machine: { kind: 'membrane' },
      gainDb: -4,
      pan: 0,
      mute: false,
      solo: false
    }
  ],
  master: { volumeDb: -4, limiterDb: -1 }
};

const kickCore = new AudioCore(kickGraph, SAMPLE_RATE);
kickCore.schedule({ type: 'kick', trackId: 'kick', time: 0, velocity: 1 });
const kick = render(kickCore, 1.6);
const kickMetrics = analyzeCoreBuffer(kick.left, kick.right, SAMPLE_RATE);

function sample(): CoreSample {
  const data = new Float32Array(Math.round(SAMPLE_RATE * 0.05));
  for (let index = 0; index < data.length; index += 1) {
    const t = index / SAMPLE_RATE;
    data[index] = Math.sin(Math.PI * 2 * 800 * t) * Math.exp(-t / 0.01) * 0.5;
  }
  return { sampleRate: SAMPLE_RATE, channels: [data] };
}

const mixTracks: readonly CoreTrackConfig[] = [
  {
    id: 'kick',
    machine: { kind: 'membrane' },
    gainDb: -4,
    pan: 0,
    mute: false,
    solo: false
  },
  {
    id: 'bass',
    machine: {
      kind: 'mono',
      oscillator: 'sawtooth',
      envelope: { attack: 0.002, decay: 0.18, sustain: 0.25, release: 0.12 },
      filter: { frequency: 420, q: 6 },
      filterEnvelope: {
        octaves: 2.5,
        attack: 0.001,
        decay: 0.18,
        sustain: 0.1,
        release: 0.1
      }
    },
    gainDb: -8,
    pan: -0.1,
    mute: false,
    solo: false
  },
  {
    id: 'chord',
    machine: {
      kind: 'poly',
      oscillator: 'triangle',
      envelope: { attack: 0.3, decay: 0.8, sustain: 0.5, release: 1.2 },
      filter: { frequency: 1200, q: 1.2 },
      filterEnvelope: {
        octaves: 1.5,
        attack: 0.4,
        decay: 1.2,
        sustain: 0.4,
        release: 1.5
      },
      maxPolyphony: 6
    },
    gainDb: -14,
    pan: 0.1,
    mute: false,
    solo: false
  },
  {
    id: 'pluck',
    machine: {
      kind: 'pluck',
      pluck: {
        attackNoise: 1,
        dampening: 4000,
        resonance: 0.9,
        release: 1.1
      }
    },
    gainDb: -14,
    pan: 0.25,
    mute: false,
    solo: false
  },
  {
    id: 'sample',
    machine: {
      kind: 'sampler',
      voices: 2,
      fadeIn: 0.001,
      fadeOut: 0.02
    },
    samples: [sample()],
    gainDb: -18,
    pan: -0.2,
    mute: false,
    solo: false
  }
];

const mixCore = new AudioCore(
  { tracks: mixTracks, master: { volumeDb: -4, limiterDb: -1 } },
  SAMPLE_RATE
);

const step = 60 / 128 / 4;
for (let index = 0; index < 8; index += 1) {
  const time = index * step * 2;
  mixCore.schedule({ type: 'kick', trackId: 'kick', time, velocity: 1 });
  mixCore.schedule({
    type: 'synth',
    trackId: 'bass',
    time,
    notes: [index % 2 === 0 ? 33 : 36],
    duration: 0.2,
    velocity: 0.9,
    accent: index % 4 === 0,
    slide: index % 3 === 0
  });
  mixCore.schedule({
    type: 'sample',
    trackId: 'sample',
    time: time + step,
    sampleIndex: 0,
    playbackRate: 1,
    gainDb: 0
  });
  if (index % 2 === 0) {
    mixCore.schedule({
      type: 'synth',
      trackId: 'chord',
      time,
      notes: [57, 60, 64],
      duration: 0.8,
      velocity: 0.8
    });
  }
  mixCore.schedule({
    type: 'synth',
    trackId: 'pluck',
    time: time + step * 0.5,
    notes: [72],
    duration: 0.2,
    velocity: 0.8
  });
}

const startedAt = performance.now();
const mix = render(mixCore, 2);
const renderMs = performance.now() - startedAt;
const mixMetrics = analyzeCoreBuffer(mix.left, mix.right, SAMPLE_RATE);

console.log(
  JSON.stringify({ kick: kickMetrics, mix: { ...mixMetrics, renderMs } }, null, 2)
);

const wavPath = process.argv[2];
if (wavPath) {
  writeFileSync(wavPath, encodeWav([mix.left, mix.right], SAMPLE_RATE));
  console.log(`WAV: ${wavPath}`);
}

const failures: string[] = [];
if (kickMetrics.nan || mixMetrics.nan) failures.push('NaN/Infinity en el render.');
if (kickMetrics.silent || mixMetrics.silent) failures.push('Un render es silencio.');
if (kickMetrics.dc >= 0.001 || mixMetrics.dc >= 0.001) {
  failures.push(`DC >= 0.001 (kick ${kickMetrics.dc.toExponential(2)}, mix ${mixMetrics.dc.toExponential(2)}).`);
}
if (kickMetrics.peakDb > -1 || mixMetrics.peakDb > -1) {
  failures.push(
    `peak > -1 dBFS (kick ${kickMetrics.peakDb.toFixed(2)}, mix ${mixMetrics.peakDb.toFixed(2)}).`
  );
}
if (kickMetrics.kickTailDb < -45) {
  failures.push(`kickTail ${kickMetrics.kickTailDb.toFixed(2)} dB < -45 dB.`);
}
if (kickMetrics.maxStep > 0.5) {
  failures.push(`maxStep kick ${kickMetrics.maxStep.toFixed(3)} > 0.5 (posible click).`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('AudioCore check OK');
}
