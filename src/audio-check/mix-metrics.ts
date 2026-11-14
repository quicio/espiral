import * as Tone from 'tone';
import { AutomationService } from '../application/automation';
import { ClipService } from '../application/clip';
import { createInitialState } from '../application/initial-state';
import { MixService } from '../application/mix';
import { PlaybackService } from '../application/playback';
import { PlaybackRuntime } from '../application/runtime';
import { Store } from '../application/store';
import { TrackService } from '../application/tracks';
import { DEFAULT_KIT_ID, soundKit } from '../domain/sound-kits';
import type {
  AudioEnginePort,
  ClockPort,
  StepListener,
  StatusPort
} from '../domain/ports';
import { ModularAudioEngine } from '../infrastructure/audio/modular/modular-audio-engine';
import { createEspiralGraph } from '../infrastructure/audio/modular/espiral-graph';
import { UmbralGenerative } from '../infrastructure/generative/umbral-generative';

const BPM = 128;
const BARS = 4;
const TAIL_SECONDS = 2;
const STEP_SECONDS = 60 / BPM / 4;

interface Scenario {
  readonly name: string;
  readonly setup?: (
    store: Store,
    tracks: TrackService,
    mix: MixService
  ) => void;
}

interface ScenarioMetrics {
  readonly name: string;
  readonly peakDb: number;
  readonly rmsDb: number;
  readonly crestDb: number;
  readonly kickTailDb: number | null;
  readonly bassDipDb: number | null;
  readonly busGrDb: number | null;
  readonly renderMs: number;
}

class OfflineClock implements ClockPort {
  bpm = BPM;
  lookAhead = 0.1;
  private readonly listeners = new Set<StepListener>();

  async start(): Promise<void> {}
  stop(): void {}
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
  now(): number {
    return 0;
  }
  onStep(listener: StepListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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

async function renderScenario(
  scenario: Scenario
): Promise<{ name: string; audio: AudioBuffer; renderMs: number }> {
  const startedAt = performance.now();
  let engine: AudioEnginePort | undefined;

  const buffer = await Tone.Offline(async () => {
    const generative = new UmbralGenerative();
    const store = new Store(createInitialState(generative));
    const state = store.getState();
    const runtime = new PlaybackRuntime();
    engine = new ModularAudioEngine(
      createEspiralGraph(state.kit, state.masterVolume, state.masterEq)
    );
    const clock = new OfflineClock();
    const status = new NullStatus();
    const mix = new MixService(store, engine);
    const tracks = new TrackService(store, engine, status);
    applyDefaultKit(store, tracks, mix);
    scenario.setup?.(store, tracks, mix);
    mix.syncAll(store.getState(), true);

    const automation = new AutomationService(store, engine, status);
    const evolver = { evolve(): void {} };
    const clips = new ClipService(store, runtime, status);
    const playback = new PlaybackService(
      store,
      clock,
      engine,
      generative,
      status,
      automation,
      evolver,
      clips,
      runtime
    );

    await playback.start();
    for (let step = 0; step < BARS * 16; step += 1) {
      clock.fire(step * STEP_SECONDS, step);
    }
  }, BARS * 16 * STEP_SECONDS + TAIL_SECONDS);

  const audio = buffer.get();
  if (!audio) throw new Error(`El render de ${scenario.name} está vacío.`);
  try {
    engine?.dispose();
  } catch {
    // El contexto offline ya terminó.
  }
  return { name: scenario.name, audio, renderMs: performance.now() - startedAt };
}

function stereoRms(
  audio: AudioBuffer,
  startSeconds: number,
  endSeconds: number
): number {
  const start = Math.max(0, Math.floor(startSeconds * audio.sampleRate));
  const end = Math.min(
    audio.length,
    Math.ceil(endSeconds * audio.sampleRate)
  );
  if (end <= start) return 0;
  const channels = Array.from(
    { length: audio.numberOfChannels },
    (_, channel) => audio.getChannelData(channel)
  );
  let sum = 0;
  let count = 0;
  for (let index = start; index < end; index += 1) {
    for (const data of channels) {
      const value = data[index] ?? 0;
      sum += value * value;
      count += 1;
    }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

function db(value: number): number {
  return value > 0 ? 20 * Math.log10(value) : -120;
}

function applyDefaultKit(
  store: Store,
  tracks: TrackService,
  mix: MixService
): void {
  const kit = soundKit(DEFAULT_KIT_ID);
  if (kit) {
    Object.entries(kit.sounds).forEach(([trackId, soundId]) => {
      tracks.applyKitSound(trackId, soundId);
    });
  }
  store.update(state => {
    const pad = state.kit.tracks.pad;
    return {
      ...state,
      transport: { ...state.transport, bpm: BPM },
      kit: {
        ...state.kit,
        tracks: pad
          ? {
              ...state.kit.tracks,
              pad: { ...pad, muted: true }
            }
          : state.kit.tracks
      }
    };
  });
  mix.syncAll(store.getState(), true);
}

function mixMetrics(audio: AudioBuffer): {
  peakDb: number;
  rmsDb: number;
  crestDb: number;
} {
  const channels = Array.from(
    { length: audio.numberOfChannels },
    (_, channel) => audio.getChannelData(channel)
  );
  let peak = 0;
  let sum = 0;
  let count = 0;
  for (const data of channels) {
    for (const value of data) {
      const absolute = Math.abs(value);
      if (absolute > peak) peak = absolute;
      sum += value * value;
      count += 1;
    }
  }
  const rms = count > 0 ? Math.sqrt(sum / count) : 0;
  return {
    peakDb: db(peak),
    rmsDb: db(rms),
    crestDb: peak > 0 && rms > 0 ? 20 * Math.log10(peak / rms) : -120
  };
}

function kickTailDb(audio: AudioBuffer): number {
  // El patrón por defecto golpea kick en el paso 0. T1 quita el corte a 8n.
  return db(stereoRms(audio, 0.3, 0.4));
}

function sidechainDipDb(
  kickAudio: AudioBuffer,
  controlAudio: AudioBuffer
): number {
  // Dos renders idénticos salvo por el patrón de kick: uno dispara el sidechain
  // y el otro es el control. Comparar la misma ventana cancela la envolvente
  // natural del bajo.
  const stepSeconds = STEP_SECONDS;
  const kicks = Array.from({ length: 2 * BARS }, (_, index) =>
    index * stepSeconds * 4
  );
  let difference = 0;
  let samples = 0;
  for (const time of kicks) {
    const withKick = stereoRms(kickAudio, time + 0.02, time + 0.12);
    const withoutKick = stereoRms(controlAudio, time + 0.02, time + 0.12);
    if (withKick <= 0 || withoutKick <= 0) continue;
    difference += db(withoutKick) - db(withKick);
    samples += 1;
  }
  return samples > 0 ? difference / samples : 0;
}

async function run(): Promise<void> {
  const kick: Scenario = {
    name: 'kick-only',
    setup: store => {
      store.update(state => ({
        ...state,
        kit: {
          ...state.kit,
          tracks: Object.fromEntries(
            Object.entries(state.kit.tracks).map(([id, track]) => [
              id,
              { ...track, solo: id === 'kick', muted: false }
            ])
          )
        }
      }));
    }
  };

  const busProbe: Scenario = {
    name: 'bus-probe',
    setup: store => {
      store.update(state => ({
        ...state,
        kit: {
          ...state.kit,
          tracks: Object.fromEntries(
            Object.entries(state.kit.tracks).map(([id, track]) => [
              id,
              { ...track, solo: id === 'kick', muted: false }
            ])
          ),
          buses: state.kit.buses.map(bus =>
            bus.id === 'drum-bus'
              ? {
                  ...bus,
                  inserts: bus.inserts.filter(
                    insert => insert.pluginId === 'compressor'
                  )
                }
              : bus
          )
        }
      }));
    }
  };

  const busControl: Scenario = {
    name: 'bus-control',
    setup: store => {
      store.update(state => ({
        ...state,
        kit: {
          ...state.kit,
          tracks: Object.fromEntries(
            Object.entries(state.kit.tracks).map(([id, track]) => [
              id,
              { ...track, solo: id === 'kick', muted: false }
            ])
          ),
          buses: state.kit.buses.map(bus =>
            bus.id === 'drum-bus'
              ? {
                  ...bus,
                  inserts: bus.inserts.map(insert =>
                    insert.pluginId === 'compressor'
                      ? { ...insert, params: { ...insert.params, threshold: -0.01 } }
                      : insert
                  )
                }
              : bus
          )
        }
      }));
    }
  };

  const sidechainSetup = (
    store: Store,
    kickSteps: readonly (0 | 1)[]
  ): void => {
    store.update(state => ({
      ...state,
      pattern: {
        ...state.pattern,
        steps: {
          ...state.pattern.steps,
          kick: kickSteps,
          bass: Array.from({ length: 16 }, () => 1 as const)
        }
      },
      kit: {
        ...state.kit,
        tracks: Object.fromEntries(
          Object.entries(state.kit.tracks).map(([id, track]) => [
            id,
            id === 'kick' || id === 'bass'
              ? {
                  ...track,
                  solo: false,
                  muted: false,
                  gainDb: id === 'kick' ? -60 : track.gainDb
                }
              : { ...track, solo: false, muted: true }
          ])
        )
      }
    }));
  };

  const sidechainProbe: Scenario = {
    name: 'sidechain-probe',
    setup: store =>
      sidechainSetup(
        store,
        (store.getState().pattern.steps.kick ?? []).map(value =>
          value ? (1 as const) : (0 as const)
        )
      )
  };

  const sidechainControl: Scenario = {
    name: 'sidechain-control',
    setup: store =>
      sidechainSetup(
        store,
        Array.from({ length: 16 }, () => 0 as const)
      )
  };

  const scenarios = [];
  for (const scenario of [
    { name: 'mix' },
    kick,
    busProbe,
    busControl,
    sidechainProbe,
    sidechainControl
  ]) {
    scenarios.push(await renderScenario(scenario));
  }

  const mix = scenarios.find(entry => entry.name === 'mix');
  const kickMetrics = scenarios.find(entry => entry.name === 'kick-only');
  const busProbeMetrics = scenarios.find(entry => entry.name === 'bus-probe');
  const busControlMetrics = scenarios.find(
    entry => entry.name === 'bus-control'
  );
  const sidechain = scenarios.find(entry => entry.name === 'sidechain-probe');
  const control = scenarios.find(entry => entry.name === 'sidechain-control');
  if (!mix || !kickMetrics || !busProbeMetrics || !busControlMetrics || !sidechain || !control) {
    throw new Error('Faltan escenarios de mix-metrics.');
  }

  const summary: ScenarioMetrics = {
    name: 'default-techno-909',
    ...mixMetrics(mix.audio),
    kickTailDb: kickTailDb(kickMetrics.audio),
    bassDipDb: sidechainDipDb(sidechain.audio, control.audio),
    busGrDb:
      mixMetrics(busControlMetrics.audio).rmsDb -
      mixMetrics(busProbeMetrics.audio).rmsDb,
    renderMs:
      mix.renderMs +
      kickMetrics.renderMs +
      busProbeMetrics.renderMs +
      busControlMetrics.renderMs +
      sidechain.renderMs +
      control.renderMs
  };

  const resultElement = document.getElementById('result');
  if (resultElement) {
    resultElement.textContent = JSON.stringify(summary);
    resultElement.dataset.done = 'true';
  }
}

void run().catch(error => {
  console.error(error);
  const resultElement = document.getElementById('result');
  if (resultElement) {
    resultElement.textContent = JSON.stringify({ error: String(error) });
    resultElement.dataset.done = 'error';
  }
});
