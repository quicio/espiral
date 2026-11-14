import type { MachineConfig } from '../../../../domain/graph';
import { MonoVoice } from './mono-voice';
import type { CoreInstrument } from './instrument';

export class MonoInstrument implements CoreInstrument {
  private readonly voice: MonoVoice;
  private lastMidi: number | undefined;

  constructor(machine: MachineConfig, sampleRate: number) {
    this.voice = new MonoVoice(machine, sampleRate);
  }

  triggerSynth(
    notes: readonly number[],
    durationSeconds: number,
    velocity: number,
    accent: boolean,
    slide: boolean
  ): void {
    const midi = notes[0];
    if (midi === undefined) return;
    this.voice.trigger(
      midi,
      velocity,
      durationSeconds,
      accent,
      slide,
      this.lastMidi
    );
    this.lastMidi = midi;
  }

  render(): number {
    return this.voice.render();
  }

  stop(): void {
    this.voice.kill();
  }

  reset(): void {
    this.voice.reset();
    this.lastMidi = undefined;
  }
}
