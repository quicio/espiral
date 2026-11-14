import type { CoreEffect, StereoFrame } from './effect';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class TremoloEffect implements CoreEffect {
  private rate: number;
  private depth: number;
  private wet: number;
  private phase = 0;

  constructor(
    private readonly sampleRate: number,
    params: Readonly<Record<string, number>>
  ) {
    this.rate = clamp(params.rate ?? 4, 0.1, 20);
    this.depth = clamp(params.depth ?? 0.5, 0, 1);
    this.wet = clamp(params.wet ?? 0.5, 0, 1);
  }

  setParam(param: string, value: number): void {
    if (param === 'rate') this.rate = clamp(value, 0.1, 20);
    else if (param === 'depth') this.depth = clamp(value, 0, 1);
    else if (param === 'wet') this.wet = clamp(value, 0, 1);
  }

  process(frame: StereoFrame): void {
    const lfo = 0.5 + 0.5 * Math.sin(this.phase * Math.PI * 2);
    const gain = 1 - this.depth * (1 - lfo);
    const mixed = 1 - this.wet + gain * this.wet;
    frame.left *= mixed;
    frame.right *= mixed;
    this.phase += this.rate / this.sampleRate;
    if (this.phase >= 1) this.phase -= 1;
  }

  reset(): void {
    this.phase = 0;
  }
}
