import * as Tone from 'tone';
import { PresetMapper } from '../adapters/preset-mapper';
import { AutomationService } from '../application/automation';
import { createInitialState } from '../application/initial-state';
import { PlaybackService } from '../application/playback';
import { PlaybackRuntime } from '../application/runtime';
import { Store } from '../application/store';
import type { AudioEnginePort, ClockPort, StepListener, StatusPort } from '../domain/ports';
import { ModularAudioEngine } from '../infrastructure/audio/modular/modular-audio-engine';
import { createEspiralGraph } from '../infrastructure/audio/modular/espiral-graph';
import { UmbralGenerative } from '../infrastructure/generative/umbral-generative';

const BARS = 8;
const BPM = 120;
const TAIL_SECONDS = 6;

interface Scenario {
  readonly name: string;
  readonly bpm?: number;
  readonly setup?: (store: Store) => void | Promise<void>;
  readonly onStep?: (store: Store, step: number) => void;
}

interface Metrics {
  readonly name: string;
  readonly engine: 'modular';
  readonly peak: number;
  readonly peakDb: number;
  readonly rmsDb: number;
  readonly dc: number;
  readonly nan: boolean;
  readonly silent: boolean;
  readonly duration: number;
  readonly sampleRate: number;
  readonly renderMs: number;
}

class OfflineClock implements ClockPort {
  bpm = BPM;
  lookAhead = 0.1;
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

  setLookAhead(seconds: number): void {
    this.lookAhead = seconds;
  }

  getLookAhead(): number {
    return this.lookAhead;
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
  const bpm = scenario.bpm ?? BPM;
  const stepSeconds = 60 / bpm / 4;
  const duration = BARS * 16 * stepSeconds + TAIL_SECONDS;
  let engineRef: AudioEnginePort | undefined;
  const startedAt = performance.now();

  const buffer = await Tone.Offline(async () => {
    const generative = new UmbralGenerative();
    const initial = createInitialState(generative);
    const store = new Store(initial);
    await scenario.setup?.(store);

    const state = store.getState();
    const runtime = new PlaybackRuntime();
    const engine: AudioEnginePort = new ModularAudioEngine(
      createEspiralGraph(state.kit, state.masterVolume)
    );
    engineRef = engine;

    const clock = new OfflineClock();
    clock.bpm = bpm;
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
      scenario.onStep?.(store, step);
      clock.fire(step * stepSeconds, step);
    }
  }, duration);

  const renderMs = performance.now() - startedAt;
  const metrics = measure(scenario, buffer, renderMs);
  try {
    engineRef?.dispose();
  } catch {
    // El contexto offline ya terminó; el dispose es best-effort.
  }
  return metrics;
}

function measure(
  scenario: Scenario,
  buffer: Tone.ToneAudioBuffer,
  renderMs: number
): Metrics {
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
    engine: 'modular',
    peak,
    peakDb: peak > 0 ? 20 * Math.log10(peak) : -120,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -120,
    dc,
    nan,
    silent: peak < 1e-4,
    duration: audio.duration,
    sampleRate: audio.sampleRate,
    renderMs
  };
}

async function run(): Promise<void> {
  const enableAutomation = (store: Store): void => {
    store.update(state => ({
      ...state,
      automation: { ...state.automation, enabled: true }
    }));
  };

  const loadAmbient = async (store: Store): Promise<void> => {
    const response = await fetch('./presets/ambient.json');
    const raw = (await response.json()) as unknown;
    const generative = new UmbralGenerative();
    const config = new PresetMapper(generative).fromDto(raw, store.getState());
    store.update(state => ({
      ...state,
      transport: { ...state.transport, bpm: config.bpm },
      kit: config.kit,
      masterVolume: config.masterVolume,
      pattern: config.pattern ?? state.pattern,
      harmony: config.harmony ?? state.harmony,
      seed: config.seed ?? state.seed,
      params: config.params ?? state.params,
      scenes: config.scenes ?? state.scenes,
      scene: config.scene ?? state.scene,
      selected: config.selected ?? state.selected
    }));
  };

  const everythingMax = (store: Store): void => {
    store.update(state => ({
      ...state,
      masterVolume: 0,
      kit: {
        ...state.kit,
        tracks: Object.fromEntries(
          Object.entries(state.kit.tracks).map(([id, track]) => [
            id,
            { ...track, gainDb: 6, muted: false, solo: false }
          ])
        )
      }
    }));
  };

  const soloAndMute = (store: Store): void => {
    store.update(state => ({
      ...state,
      kit: {
        ...state.kit,
        tracks: Object.fromEntries(
          Object.entries(state.kit.tracks).map(([id, track]) => [
            id,
            {
              ...track,
              solo: id === 'kick',
              muted: track.muted || id === 'bass'
            }
          ])
        )
      }
    }));
  };

  const sceneMidway = (store: Store, step: number): void => {
    if (step !== 32) return;
    const target = store.getState().scenes.deriva;
    store.update(state => ({
      ...state,
      scene: 'deriva',
      kit: target.kit,
      pattern: target.pattern,
      harmony: target.harmony,
      seed: target.seed,
      params: target.params,
      masterVolume: target.masterVolume
    }));
  };

  const stressInserts = (store: Store): void => {
    store.update(state => ({
      ...state,
      kit: {
        ...state.kit,
        tracks: Object.fromEntries(
          Object.entries(state.kit.tracks).map(([id, track]) => [
            id,
            {
              ...track,
              inserts: [
                ...track.inserts,
                {
                  id: 'stress-filter',
                  pluginId: 'filter',
                  bypass: false,
                  params: { cutoff: 2200, q: 1 }
                },
                {
                  id: 'stress-drive',
                  pluginId: 'drive',
                  bypass: false,
                  params: { drive: 0.3, mix: 0.3 }
                },
                {
                  id: 'stress-compressor',
                  pluginId: 'compressor',
                  bypass: false,
                  params: { threshold: -18, ratio: 3, attack: 0.02, release: 0.2 }
                },
                {
                  id: 'stress-tremolo',
                  pluginId: 'tremolo',
                  bypass: false,
                  params: { rate: 3, depth: 0.35, wet: 0.25 }
                }
              ]
            }
          ])
        )
      }
    }));
  };

  const scenarios: Scenario[] = [
    { name: 'modular-initial' },
    { name: 'modular-automation', setup: enableAutomation },
    { name: 'modular-ambient', bpm: 90, setup: loadAmbient },
    { name: 'modular-max', setup: everythingMax },
    { name: 'modular-solo-mute', setup: soloAndMute },
    { name: 'modular-scene-change', onStep: sceneMidway },
    { name: 'modular-stress', setup: stressInserts }
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
