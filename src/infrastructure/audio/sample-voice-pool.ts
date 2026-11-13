import * as Tone from 'tone';
import type { NoteDuration } from '../../domain/audio';
import type { SampleLibrary } from './sample-library';

/**
 * Pool de voces reutilizables. Comparte el ToneAudioBuffer entre tracks, pero
 * mantiene voces persistentes para no crear un nodo por nota.
 */
export class SampleVoicePool {
  private readonly voices: readonly Tone.Player[];
  private next = 0;

  constructor(
    private readonly url: string,
    voiceCount: number,
    fadeIn: number,
    fadeOut: number,
    destination: Tone.ToneAudioNode,
    private readonly library: SampleLibrary
  ) {
    const count = Math.max(1, Math.floor(voiceCount));
    this.voices = Array.from({ length: count }, () => {
      const player = new Tone.Player({ fadeIn, fadeOut });
      player.connect(destination);
      return player;
    });
    void this.prepare().catch(error => {
      console.warn(`No se pudo preparar el sample ${url}:`, error);
    });
  }

  async prepare(): Promise<void> {
    const buffer = await this.library.load(this.url);
    this.voices.forEach(player => {
      player.buffer = buffer;
    });
  }

  play(
    time: number,
    playbackRate: number,
    duration?: NoteDuration,
    gainDb?: number
  ): void {
    const voice =
      this.voices.find(player => player.state !== 'started') ??
      this.voices[this.next++ % this.voices.length];
    if (!voice) return;

    voice.playbackRate = playbackRate;
    if (typeof gainDb === 'number') {
      voice.volume.rampTo(gainDb, 0.005, Tone.now());
    }

    if (duration) voice.start(time, 0, duration);
    else voice.start(time);
  }

  stop(): void {
    this.voices.forEach(voice => voice.stop());
  }

  dispose(): void {
    this.voices.forEach(voice => voice.dispose());
  }
}
