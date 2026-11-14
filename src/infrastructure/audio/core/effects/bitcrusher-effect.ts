import type { CoreEffect, StereoFrame } from './effect';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class BitcrusherEffect implements CoreEffect {
  private bits: number;
  private wet: number;

  constructor(params: Readonly<Record<string, number>>) {
    this.bits = clamp(params.bits ?? 6, 1, 16);
    this.wet = clamp(params.wet ?? 0.5, 0, 1);
  }

  setParam(param: string, value: number): void {
    if (param === 'bits') this.bits = clamp(value, 1, 16);
    else if (param === 'wet') this.wet = clamp(value, 0, 1);
  }

  process(frame: StereoFrame): void {
    const levels = Math.pow(2, this.bits);
    frame.left =
      frame.left * (1 - this.wet) +
      (Math.round(frame.left * levels) / levels) * this.wet;
    frame.right =
      frame.right * (1 - this.wet) +
      (Math.round(frame.right * levels) / levels) * this.wet;
  }

  reset(): void {}
}
