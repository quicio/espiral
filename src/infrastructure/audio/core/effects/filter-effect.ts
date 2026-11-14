import { StateVariableFilter } from '../dsp/svf';
import type { CoreEffect, StereoFrame } from './effect';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class FilterEffect implements CoreEffect {
  private readonly left = new StateVariableFilter();
  private readonly right = new StateVariableFilter();
  private cutoff: number;
  private resonance: number;

  constructor(
    private readonly sampleRate: number,
    params: Readonly<Record<string, number>>
  ) {
    this.cutoff = clamp(params.cutoff ?? 1200, 20, 20_000);
    this.resonance = clamp(params.q ?? 1, 0.1, 20);
  }

  setParam(param: string, value: number): void {
    if (param === 'cutoff') this.cutoff = clamp(value, 20, 20_000);
    else if (param === 'q') this.resonance = clamp(value, 0.1, 20);
  }

  process(frame: StereoFrame): void {
    frame.left = this.left.process(
      frame.left,
      this.cutoff,
      this.resonance,
      this.sampleRate
    );
    frame.right = this.right.process(
      frame.right,
      this.cutoff,
      this.resonance,
      this.sampleRate
    );
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
  }
}
