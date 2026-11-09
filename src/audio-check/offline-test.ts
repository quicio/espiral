import * as Tone from 'tone';
import { AutomationService } from '../application/automation';
import { createInitialState } from '../application/initial-state';
import { PlaybackService } from '../application/playback';
import { PlaybackRuntime } from '../application/runtime';
import { Store } from '../application/store';
import type { AudioEnginePort, ClockPort, StepListener, StatusPort } from '../domain/ports';
import { ToneAudioEngine } from '../infrastructure/audio/tone-audio-engine';
import { ModularAudioEngine } from '../infrastructure/audio/modular/modular-audio-engine';
import { createEspiralGraph } from '../infrastructure/audio/modular/espiral-graph';
import { UmbralGenerative } from '../infrastructure/generative/umbral-generative';

const BARS = 8;
const BPM = 120;
const TAIL_SECONDS = 6;

type EngineKind = 'tone' | 'modular';

interface Scenario {
  readonly name: string;
  readonly engine: EngineKind;
  readonly setup?: (store: Store) => void;
}

interface Metrics {
  readonly name: string;
  readonly engine: EngineKind;
  readonly peak: number;
  readonly peakDb: number;
  readonly rmsDb: number;
  readonly dc: number;
  readonly nan: boolean;
  readonly silent: boolean;
  readonly duration: number;
  readonly sampleRate: number;
}

class OfflineClock implements ClockPort {
  bpm = BPM;
  private readonly listeners = new Set<StepListener>();

  async start(): Promise<void> {
    // El render offline no necesita un reloj real.
  }

  stop(): void {
    // No-op.
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  getBpm(): number {
    return this.bpm;
  }

  onStep(listener: StepListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }

  fire(time: number, step: number): void {
    for (const listener of this.listeners) listener(time, step);
  }
}

class NullStatus implements StatusPort {
  generative(): void {}
  session(): void {}
  instrument(): void {}
  error(): void {}
}

async function renderScenario(scenario: Scenario): Promise<Metrics> {
  const stepSeconds = 60 / BPM / 4;
  const duration = BARS * 16 * stepSeconds + TAIL_SECONDS;
  let engineRef: AudioEnginePort | undefined;

  const buffer = await Tone.Offline(async () => {
    const generative = new UmbralGenerative();
    const initial = createInitialState(generative);
    const store = new Store(initial);
    scenario.setup?.(store);

    const state = store.getState();
    const runtime = new PlaybackRuntime();
    const engine: AudioEnginePort =
      scenario.engine === 'tone'
        ? new ToneAudioEngine(state.kit, state.masterVolume)
        : new ModularAudioEngine(createEspiralGraph(state.kit, state.masterVolume));
    engineRef = engine;

    const clock = new OfflineClock();
    const status = new NullStatus();
    const automation = new AutomationService(store, engine, status);
    const evolver = { evolve(): void {} };
    const playback = new PlaybackService(
      store,
      clock,
      engine,
      generative,
      status,
      automation,
      evolver,
      runtime
    );

    await playback.start();

    for (let step = 0; step < BARS * 16; step += 1) {
      clock.fire(step * stepSeconds, step);
    }
  }, duration);

  const metrics = measure(scenario, buffer);
  try {
    engineRef?.dispose();
  } catch {
    // El contexto offline ya terminó; el dispose es best-effort.
  }
  return metrics;
}

function measure(scenario: Scenario, buffer: Tone.ToneAudioBuffer): Metrics {
  const audio = buffer.get();
  if (!audio) throw new Error('El buffer offline está vacío.');
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  let count = 0;
  let nan = false;

  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    const data = audio.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) {
      const value = data[index] ?? 0;
      if (!Number.isFinite(value)) {
        nan = true;
        continue;
      }
      const absolute = Math.abs(value);
      if (absolute > peak) peak = absolute;
      sumSquares += value * value;
      sum += value;
      count += 1;
    }
  }

  const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
  const dc = count > 0 ? Math.abs(sum / count) : 0;

  return {
    name: scenario.name,
    engine: scenario.engine,
    peak,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -120,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -120,
    dc,
    nan,
    silent: peak < 1e-4,
    duration: audio.duration,
    sampleRate: audio.sampleRate
  };
}

async function run(): Promise<void> {
  const enableAutomation = (store: Store): void => {
    store.update(state => ({
      ...state,
      automation: { ...state.automation, enabled: true }
    }));
  };

  const scenarios: Scenario[] = [
    { name: 'tone-initial', engine: 'tone' },
    { name: 'modular-initial', engine: 'modular' },
    { name: 'tone-automation', engine: 'tone', setup: enableAutomation },
    { name: 'modular-automation', engine: 'modular', setup: enableAutomation }
  ];

  const results: Metrics[] = [];
  for (const scenario of scenarios) {
    results.push(await renderScenario(scenario));
  }

  const resultElement = document.getElementById('result');
  if (resultElement) {
    resultElement.textContent = JSON.stringify(results);
    resultElement.dataset.done = 'true';
  }
  (window as unknown as { __audioMetrics: Metrics[] }).__audioMetrics = results;
}

void run().catch(error => {
  console.error(error);
  const resultElement = document.getElementById('result');
  if (resultElement) {
    resultElement.textContent = JSON.stringify({ error: String(error) });
    resultElement.dataset.done = 'error';
  }
});
