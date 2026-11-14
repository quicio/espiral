import * as Tone from 'tone';
import workletUrl from '../infrastructure/audio/worklets/acid303.worklet.js?url';

const SAMPLE_RATE = 48_000;
const BPM = 128;
const BARS = 8;
const STEPS = BARS * 16;
const STEP_SECONDS = 60 / BPM / 4;
const DURATION = STEPS * STEP_SECONDS + 1.5;

interface Metrics {
  readonly name: string;
  readonly renderMs: number;
  readonly peakDb: number;
  readonly rmsDb: number;
  readonly finite: boolean;
}

function db(value: number): number {
  return value > 0 ? 20 * Math.log10(value) : -120;
}

function metrics(name: string, audio: AudioBuffer, renderMs: number): Metrics {
  const channels = Array.from(
    { length: audio.numberOfChannels },
    (_, channel) => audio.getChannelData(channel)
  );
  let peak = 0;
  let sum = 0;
  let count = 0;
  let finite = true;
  for (const data of channels) {
    for (const value of data) {
      if (!Number.isFinite(value)) finite = false;
      const absolute = Math.abs(value);
      if (absolute > peak) peak = absolute;
      sum += value * value;
      count += 1;
    }
  }
  const rms = count > 0 ? Math.sqrt(sum / count) : 0;
  return {
    name,
    renderMs: Math.round(renderMs),
    peakDb: Number(db(peak).toFixed(2)),
    rmsDb: Number(db(rms).toFixed(2)),
    finite
  };
}

async function renderTone(): Promise<Metrics> {
  const started = performance.now();
  const rendered = await Tone.Offline(() => {
    const synth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.003, decay: 0.18, sustain: 0.05, release: 0.09 },
      filter: { frequency: 420, Q: 14, type: 'lowpass', rolloff: -24 },
      filterEnvelope: {
        octaves: 3.2,
        attack: 0.002,
        decay: 0.22,
        sustain: 0.05,
        release: 0.12,
        baseFrequency: 420
      }
    }).toDestination();
    for (let step = 0; step < STEPS; step += 1) {
      const time = step * STEP_SECONDS;
      const degrees = [45, 47, 49, 51, 53, 55];
      const frequency = Tone.Frequency(
        degrees[step % degrees.length]!,
        'midi'
      ).toFrequency();
      const accent = step % 4 === 0;
      synth.portamento = step % 8 === 0 ? 0.06 : 0;
      synth.triggerAttackRelease(
        frequency,
        0.09,
        time,
        accent ? 1 : 0.65
      );
    }
  }, DURATION);
  const audio = rendered.get();
  if (!audio) throw new Error('Tone render vacío');
  return metrics('tone-monosynth', audio, performance.now() - started);
}

async function renderWorklet(): Promise<Metrics> {
  const started = performance.now();
  const context = new OfflineAudioContext(
    2,
    Math.ceil(DURATION * SAMPLE_RATE),
    SAMPLE_RATE
  );
  await context.audioWorklet.addModule(workletUrl);
  const degrees = [45, 47, 49, 51, 53, 55];
  const notes = Array.from({ length: STEPS }, (_, step) => {
    const midi = degrees[step % degrees.length]!;
    return {
      time: step * STEP_SECONDS,
      frequency: 440 * Math.pow(2, (midi - 69) / 12),
      velocity: 0.65,
      accent: step % 4 === 0,
      slide: step % 8 === 0,
      duration: 0.09
    };
  });
  const node = new AudioWorkletNode(context, 'espiral-acid-303', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      notes,
      params: {
        waveform: 'sawtooth',
        cutoff: 420,
        resonance: 0.86,
        envAmount: 3.2,
        envDecay: 0.22,
        envSustain: 0.05,
        glide: 0.06
      }
    }
  });
  node.connect(context.destination);
  const audio = await context.startRendering();
  const result = metrics('acid-303-worklet', audio, performance.now() - started);
  node.disconnect();
  return result;
}

function summarize(name: string, runs: readonly Metrics[]) {
  const times = runs.map(run => run.renderMs);
  return {
    name,
    runs: times,
    avgMs: Math.round(times.reduce((sum, value) => sum + value, 0) / times.length),
    minMs: Math.min(...times),
    peakDb: runs[0]?.peakDb ?? -120,
    rmsDb: runs[0]?.rmsDb ?? -120,
    finite: runs.every(run => run.finite)
  };
}

async function run(): Promise<void> {
  const toneRuns: Metrics[] = [];
  const workletRuns: Metrics[] = [];
  for (let index = 0; index < 3; index += 1) {
    toneRuns.push(await renderTone());
    workletRuns.push(await renderWorklet());
  }
  const result = {
    tone: summarize('tone-monosynth', toneRuns),
    worklet: summarize('acid-303-worklet', workletRuns)
  };
  const element = document.getElementById('result');
  if (element) {
    element.textContent = JSON.stringify(result);
    element.dataset.done = 'true';
  }
}

void run().catch(error => {
  console.error(error);
  const element = document.getElementById('result');
  if (element) {
    element.textContent = JSON.stringify({ error: String(error) });
    element.dataset.done = 'error';
  }
});
