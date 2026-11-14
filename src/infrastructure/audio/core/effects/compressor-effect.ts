import type { CoreEffect, StereoFrame } from './effect';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class CompressorEffect implements CoreEffect {
  private threshold: number;
  private ratio: number;
  private attack: number;
  private release: number;
  private gainDb = 0;
  private gain = 1;
  private refresh = 0;

  constructor(
    private readonly sampleRate: number,
    params: Readonly<Record<string, number>>
  ) {
    this.threshold = clamp(params.threshold ?? -18, -60, 0);
    this.ratio = clamp(params.ratio ?? 4, 1, 20);
    this.attack = 1 - Math.exp(-1 / ((params.attack ?? 0.01) * sampleRate));
    this.release = 1 - Math.exp(-1 / ((params.release ?? 0.2) * sampleRate));
  }

  setParam(param: string, value: number): void {
    if (param === 'threshold') this.threshold = clamp(value, -60, 0);
    else if (param === 'ratio') this.ratio = clamp(value, 1, 20);
    else if (param === 'attack') {
      this.attack = 1 - Math.exp(-1 / (clamp(value, 0.001, 0.2) * this.sampleRate));
    } else if (param === 'release') {
      this.release = 1 - Math.exp(-1 / (clamp(value, 0.01, 1) * this.sampleRate));
    }
  }

  process(frame: StereoFrame): void {
    if (this.ratio <= 1) return;
    const peak = Math.max(Math.abs(frame.left), Math.abs(frame.right));
    const levelDb = peak > 0 ? 20 * Math.log10(peak) : -120;
    const over = levelDb - this.threshold;
    const target =
      over > 0 ? -over * (1 - 1 / this.ratio) : 0;
    const coefficient = target < this.gainDb ? this.attack : this.release;
    this.gainDb += (target - this.gainDb) * coefficient;

    if (this.refresh <= 0) {
      this.gain = Math.pow(10, this.gainDb / 20);
      this.refresh = 8;
    }
    this.refresh -= 1;
    frame.left *= this.gain;
    frame.right *= this.gain;
  }

  reset(): void {
    this.gainDb = 0;
    this.gain = 1;
    this.refresh = 0;
  }
}
