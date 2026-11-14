import type { MachineConfig } from '../../../../domain/graph';
import { PluckVoice } from './pluck-voice';
import type { CoreInstrument } from './instrument';

export class PluckInstrument implements CoreInstrument {
  private readonly voices: readonly PluckVoice[];
  private limit: number;
  private next = 0;

  constructor(machine: MachineConfig, sampleRate: number) {
    this.voices = Array.from({ length: 4 }, () => new PluckVoice(machine, sampleRate));
    this.limit = this.voices.length;
  }

  triggerSynth(
    notes: readonly number[],
    _durationSeconds: number,
    velocity: number,
    _accent: boolean,
    _slide: boolean,
    seed: number
  ): void {
    const midi = notes[0];
    if (midi === undefined) return;
    const voice = this.allocate();
    voice.trigger(midi, velocity, seed);
  }

  setVoiceLimit(limit: number): void {
    this.limit = Math.max(1, Math.min(this.voices.length, Math.floor(limit)));
    this.voices.forEach((voice, index) => {
      if (index >= this.limit) voice.stop();
    });
  }

  render(): number {
    let sum = 0;
    for (const voice of this.voices) {
      if (voice.isActive) sum += voice.render();
    }
    return sum;
  }

  stop(): void {
    this.voices.forEach(voice => voice.stop());
  }

  reset(): void {
    this.voices.forEach(voice => voice.reset());
    this.limit = this.voices.length;
    this.next = 0;
  }

  private allocate(): PluckVoice {
    for (let index = 0; index < this.limit; index += 1) {
      const voice = this.voices[index];
      if (voice && !voice.isActive) return voice;
    }
    const voice = this.voices[this.next % this.limit]!;
    this.next += 1;
    voice.stop();
    return voice;
  }
}
