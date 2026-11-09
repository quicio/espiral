import * as Tone from 'tone';
import type { NoteDuration } from '../../domain/audio';

/**
 * Pool de voces para un sample. Evita reutilizar un Tone.Player mientras su
 * cola anterior sigue sonando: cambiar playbackRate sobre una voz activa
 * produce saltos de pitch y clicks.
 */
export class SampleVoicePool {
  private readonly voices: readonly Tone.Player[];
  private next = 0;

  constructor(
    url: string,
    voiceCount: number,
    fadeIn: number,
    fadeOut: number,
    destination: Tone.ToneAudioNode
  ) {
    const count = Math.max(1, Math.floor(voiceCount));
    this.voices = Array.from({ length: count }, () => {
      const player = new Tone.Player({ url, fadeIn, fadeOut });
      player.connect(destination);
      return player;
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
