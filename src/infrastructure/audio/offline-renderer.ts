import * as Tone from 'tone';
import { AutomationService } from '../../application/automation';
import { PlaybackService } from '../../application/playback';
import { PlaybackRuntime } from '../../application/runtime';
import { Store } from '../../application/store';
import type { InstrumentState } from '../../domain/models';
import type {
  AudioExportPort,
  ClockPort,
  StepListener,
  StatusPort
} from '../../domain/ports';
import { ModularAudioEngine } from './modular/modular-audio-engine';
import { createEspiralGraph } from './modular/espiral-graph';
import { UmbralGenerative } from '../generative/umbral-generative';
import { encodeWav } from './wav';

class OfflineClock implements ClockPort {
  private readonly listeners = new Set<StepListener>();

  constructor(private bpm: number) {}

  async start(): Promise<void> {
    // El render offline no necesita reloj real.
  }

  stop(): void {}

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  getBpm(): number {
    return this.bpm;
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

export class ToneOfflineRenderer implements AudioExportPort {
  async render(
    state: InstrumentState,
    options: { readonly bars: number; readonly tailSeconds: number }
  ): Promise<Blob> {
    const bpm = state.transport.bpm;
    const stepSeconds = 60 / bpm / 4;
    const duration =
      options.bars * 16 * stepSeconds + options.tailSeconds;
    let engine: ModularAudioEngine | undefined;

    const rendered = await Tone.Offline(async () => {
      const store = new Store(state);
      const clock = new OfflineClock(bpm);
      const status = new NullStatus();
      const runtime = new PlaybackRuntime();
      const generative = new UmbralGenerative();
      engine = new ModularAudioEngine(
        createEspiralGraph(state.kit, state.masterVolume)
      );
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
      for (let step = 0; step < options.bars * 16; step += 1) {
        clock.fire(step * stepSeconds, step);
      }
    }, duration);

    const audio = rendered.get();
    if (!audio) throw new Error('El render offline está vacío.');
    const channels = Array.from(
      { length: audio.numberOfChannels },
      (_, channel) => audio.getChannelData(channel)
    );
    const bytes = encodeWav(channels, audio.sampleRate);
    engine?.dispose();
    const payload = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    return new Blob([payload], { type: 'audio/wav' });
  }
}
