import type { MachineConfig } from '../../../../domain/graph';
import { MonoVoice } from './mono-voice';
import type { CoreInstrument } from './instrument';

export class PolyInstrument implements CoreInstrument {
  private readonly voices: readonly MonoVoice[];
  private limit: number;
  private next = 0;

  constructor(machine: MachineConfig, sampleRate: number) {
    const count = Math.max(
      1,
      Math.min(16, Math.floor(machine.maxPolyphony ?? 8))
    );
    this.voices = Array.from(
      { length: count },
      () => new MonoVoice(machine, sampleRate)
    );
    this.limit = count;
  }

  triggerSynth(
    notes: readonly number[],
    durationSeconds: number,
    velocity: number,
    accent: boolean,
    _slide: boolean
  ): void {
    for (const midi of notes) {
      const voice = this.allocate();
      voice.trigger(midi, velocity, durationSeconds, accent, false);
    }
  }

  setVoiceLimit(limit: number): void {
    this.limit = Math.max(1, Math.min(this.voices.length, Math.floor(limit)));
    this.voices.forEach((voice, index) => {
      if (index >= this.limit) voice.kill();
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
    this.voices.forEach(voice => voice.kill());
  }

  reset(): void {
    this.voices.forEach(voice => voice.reset());
    this.limit = this.voices.length;
    this.next = 0;
  }

  private allocate(): MonoVoice {
    for (let index = 0; index < this.limit; index += 1) {
      const voice = this.voices[index];
      if (voice && !voice.isActive) return voice;
    }
    const voice = this.voices[this.next % this.limit]!;
    this.next += 1;
    voice.kill();
    return voice;
  }
}
