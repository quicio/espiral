import type { MachineConfig } from '../../../../domain/graph';
import type { CoreSample } from '../types';
import { SampleVoice } from './sample-voice';
import type { CoreInstrument } from './instrument';

export class SamplerInstrument implements CoreInstrument {
  private readonly voices: readonly SampleVoice[];
  private readonly samples: readonly CoreSample[];
  private readonly fadeIn: number;
  private readonly fadeOut: number;
  private limit: number;
  private next = 0;

  constructor(
    machine: MachineConfig,
    samples: readonly CoreSample[] = [],
    sampleRate: number
  ) {
    const count = Math.max(1, Math.floor(machine.voices ?? 1));
    this.voices = Array.from(
      { length: count },
      () => new SampleVoice(sampleRate)
    );
    this.samples = samples;
    this.fadeIn = machine.fadeIn ?? 0.004;
    this.fadeOut = machine.fadeOut ?? 0.03;
    this.limit = count;
  }

  triggerSample(
    sampleIndex: number,
    playbackRate: number,
    durationSeconds: number | undefined,
    gainDb: number,
    _seed: number
  ): void {
    if (this.samples.length === 0) return;
    const index = Math.max(
      0,
      Math.min(this.samples.length - 1, Math.round(sampleIndex))
    );
    const sample = this.samples[index];
    if (!sample) return;

    const voice = this.allocate();
    voice.trigger(
      sample,
      playbackRate,
      durationSeconds,
      gainDb,
      this.fadeIn,
      this.fadeOut
    );
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

  private allocate(): SampleVoice {
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
