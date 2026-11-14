import type { CoreSample } from '../types';

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export class SampleVoice {
  private sample: CoreSample | undefined;
  private position = 0;
  private step = 1;
  private elapsed = 0;
  private durationSeconds = 0;
  private gain = 1;
  private fadeIn = 0;
  private fadeOut = 0.005;
  private active = false;

  constructor(private readonly sampleRate: number) {}

  get isActive(): boolean {
    return this.active;
  }

  trigger(
    sample: CoreSample,
    playbackRate: number,
    durationSeconds: number | undefined,
    gainDb: number,
    fadeIn: number,
    fadeOut: number
  ): void {
    const frames = sample.channels[0]?.length ?? 0;
    if (frames === 0) {
      this.active = false;
      return;
    }

    this.sample = sample;
    this.position = 0;
    this.step = Math.max(
      0.0001,
      playbackRate * (sample.sampleRate / this.sampleRate)
    );
    this.elapsed = 0;
    this.durationSeconds =
      durationSeconds !== undefined
        ? Math.max(0.001, durationSeconds)
        : frames / this.step / this.sampleRate;
    this.gain = dbToGain(gainDb);
    this.fadeIn = Math.max(0, fadeIn);
    this.fadeOut = Math.max(0, fadeOut);
    this.active = true;
  }

  stop(): void {
    this.active = false;
    this.sample = undefined;
  }

  reset(): void {
    this.stop();
    this.position = 0;
    this.elapsed = 0;
  }

  render(): number {
    if (!this.active || !this.sample) return 0;

    const frames = this.sample.channels[0]?.length ?? 0;
    if (this.position >= frames) {
      this.active = false;
      return 0;
    }

    const index = Math.floor(this.position);
    const fraction = this.position - index;
    const value = this.read(index) * (1 - fraction) + this.read(index + 1) * fraction;

    const attack =
      this.fadeIn > 0 ? Math.min(1, this.elapsed / this.fadeIn) : 1;
    const remaining = this.durationSeconds - this.elapsed;
    const release =
      this.fadeOut > 0 ? Math.min(1, Math.max(0, remaining / this.fadeOut)) : 1;
    const output = value * this.gain * attack * release;

    this.position += this.step;
    this.elapsed += 1 / this.sampleRate;
    if (this.elapsed >= this.durationSeconds || this.position >= frames) {
      this.active = false;
    }
    return output;
  }

  private read(index: number): number {
    if (!this.sample) return 0;
    const channels = this.sample.channels;
    if (channels.length === 0) return 0;
    if (channels.length === 1) return channels[0]?.[index] ?? 0;
    let sum = 0;
    for (const channel of channels) sum += channel[index] ?? 0;
    return sum / channels.length;
  }
}
