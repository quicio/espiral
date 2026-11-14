import type { MachineConfig } from '../../../../domain/graph';
import { FmVoice } from './fm-voice';
import type { CoreInstrument } from './instrument';

export class FmInstrument implements CoreInstrument {
  private readonly voice: FmVoice;

  constructor(machine: MachineConfig, sampleRate: number) {
    this.voice = new FmVoice(machine, sampleRate);
  }

  triggerSynth(
    notes: readonly number[],
    durationSeconds: number,
    velocity: number,
    _accent: boolean,
    _slide: boolean
  ): void {
    const midi = notes[0];
    if (midi === undefined) return;
    this.voice.trigger(midi, velocity, durationSeconds);
  }

  render(): number {
    return this.voice.render();
  }

  stop(): void {
    this.voice.kill();
  }

  reset(): void {
    this.voice.reset();
  }
}
