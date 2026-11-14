import type { CoreSample } from './types';

export class CoreSampleLoader {
  private readonly cache = new Map<string, Promise<CoreSample>>();

  constructor(private readonly context: BaseAudioContext) {}

  load(url: string): Promise<CoreSample> {
    const existing = this.cache.get(url);
    if (existing) return existing;
    const promise = (async (): Promise<CoreSample> => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`No se pudo cargar ${url}: ${response.status}`);
      }
      const data = await response.arrayBuffer();
      const audio = await this.context.decodeAudioData(data);
      return {
        sampleRate: audio.sampleRate,
        channels: Array.from(
          { length: audio.numberOfChannels },
          (_, channel) => audio.getChannelData(channel).slice()
        )
      };
    })();
    this.cache.set(url, promise);
    return promise;
  }

  dispose(): void {
    this.cache.clear();
  }
}
