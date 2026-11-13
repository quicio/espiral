import * as Tone from 'tone';
import type { NoteDuration } from '../../domain/audio';
import { isOfflineContext } from './context';
import { SampleVoicePool } from './sample-voice-pool';
import type { SampleLibrary } from './sample-library';
import workletUrl from './worklets/sampler.worklet.js?url';

const PROCESSOR = 'espiral-sampler';
const loadedContexts = new WeakSet<BaseAudioContext>();

export interface SamplerVoiceSource {
  prepare(): Promise<void>;
  play(
    time: number,
    sampleIndex: number,
    playbackRate: number,
    duration?: NoteDuration,
    gainDb?: number
  ): void;
  stop(): void;
  dispose(): void;
}

class PoolSamplerSource implements SamplerVoiceSource {
  private pools: readonly SampleVoicePool[] | null = null;

  constructor(
    private readonly urls: readonly string[],
    private readonly voices: number,
    private readonly fadeIn: number,
    private readonly fadeOut: number,
    private readonly destination: Tone.ToneAudioNode,
    private readonly library: SampleLibrary
  ) {}

  async prepare(): Promise<void> {
    if (this.pools) {
      await Promise.all(this.pools.map(pool => pool.prepare()));
      return;
    }
    this.pools = this.urls.map(
      url =>
        new SampleVoicePool(
          url,
          this.voices,
          this.fadeIn,
          this.fadeOut,
          this.destination,
          this.library
        )
    );
    await Promise.all(this.pools.map(pool => pool.prepare()));
  }

  play(
    time: number,
    sampleIndex: number,
    playbackRate: number,
    duration?: NoteDuration,
    gainDb?: number
  ): void {
    const index = Math.max(
      0,
      Math.min((this.pools?.length ?? 1) - 1, sampleIndex)
    );
    this.pools?.[index]?.play(time, playbackRate, duration, gainDb);
  }

  stop(): void {
    this.pools?.forEach(pool => pool.stop());
  }

  dispose(): void {
    this.pools?.forEach(pool => pool.dispose());
    this.pools = null;
  }
}

class WorkletSamplerSource implements SamplerVoiceSource {
  private node: AudioWorkletNode | null = null;
  private fallback: PoolSamplerSource | null = null;
  private preparing: Promise<void> | null = null;

  constructor(
    private readonly urls: readonly string[],
    private readonly voices: number,
    private readonly fadeIn: number,
    private readonly fadeOut: number,
    private readonly destination: Tone.ToneAudioNode,
    private readonly library: SampleLibrary
  ) {
    void this.prepare().catch(() => {
      // El fallback se resuelve dentro de prepareInternal.
    });
  }

  prepare(): Promise<void> {
    if (!this.preparing) this.preparing = this.prepareInternal();
    return this.preparing;
  }

  private async prepareInternal(): Promise<void> {
    try {
      await ensureWorkletModule();
      const buffers = await Promise.all(
        this.urls.map(url => this.library.load(url))
      );
      const node = Tone.getContext().createAudioWorkletNode(PROCESSOR, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      Tone.connect(node, this.destination);
      node.port.postMessage({ type: 'config', voices: this.voices });
      buffers.forEach((buffer, index) => {
        const channels = Array.from(
          { length: buffer.numberOfChannels },
          (_, channel) => buffer.getChannelData(channel).slice()
        );
        node.port.postMessage(
          {
            type: 'buffer',
            index,
            channels,
            sampleRate: buffer.sampleRate
          },
          channels.map(channel => channel.buffer as ArrayBuffer)
        );
      });
      this.node = node;
      markSamplerMode('worklet');
    } catch (error) {
      console.warn('Sampler worklet no disponible; usando Tone.Player:', error);
      markSamplerMode('fallback');
      this.fallback = new PoolSamplerSource(
        this.urls,
        this.voices,
        this.fadeIn,
        this.fadeOut,
        this.destination,
        this.library
      );
      await this.fallback.prepare();
    }
  }

  play(
    time: number,
    sampleIndex: number,
    playbackRate: number,
    duration?: NoteDuration,
    gainDb?: number
  ): void {
    if (!this.node) {
      this.fallback?.play(time, sampleIndex, playbackRate, duration, gainDb);
      return;
    }
    this.node.port.postMessage({
      type: 'play',
      index: sampleIndex,
      time,
      rate: playbackRate,
      duration: duration ? Tone.Time(duration).toSeconds() : undefined,
      gain: dbToGain(gainDb ?? 0),
      fadeIn: this.fadeIn,
      fadeOut: this.fadeOut
    });
  }

  stop(): void {
    this.node?.port.postMessage({ type: 'stop' });
    this.fallback?.stop();
  }

  dispose(): void {
    this.node?.disconnect();
    this.node?.port.close();
    this.node = null;
    this.fallback?.dispose();
    this.fallback = null;
  }
}

export function createSamplerSource(
  urls: readonly string[],
  voices: number,
  fadeIn: number,
  fadeOut: number,
  destination: Tone.ToneAudioNode,
  library: SampleLibrary
): SamplerVoiceSource {
  if (isOfflineContext()) {
    return new PoolSamplerSource(
      urls,
      voices,
      fadeIn,
      fadeOut,
      destination,
      library
    );
  }
  return new WorkletSamplerSource(
    urls,
    voices,
    fadeIn,
    fadeOut,
    destination,
    library
  );
}

async function ensureWorkletModule(): Promise<void> {
  const context = Tone.getContext().rawContext as BaseAudioContext & {
    audioWorklet?: AudioWorklet;
  };
  if (!context.audioWorklet) {
    throw new Error('AudioWorklet no disponible');
  }
  if (loadedContexts.has(context)) return;
  await context.audioWorklet.addModule(workletUrl);
  loadedContexts.add(context);
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function markSamplerMode(mode: 'worklet' | 'fallback'): void {
  (globalThis as { __espiralSamplerMode?: string }).__espiralSamplerMode = mode;
}
