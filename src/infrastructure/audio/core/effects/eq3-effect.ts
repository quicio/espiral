import { Biquad } from '../dsp/biquad';
import type { CoreEffect, StereoFrame } from './effect';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class Eq3Effect implements CoreEffect {
  private readonly lowLeft = new Biquad();
  private readonly lowRight = new Biquad();
  private readonly midLeft = new Biquad();
  private readonly midRight = new Biquad();
  private readonly highLeft = new Biquad();
  private readonly highRight = new Biquad();
  private low = 0;
  private mid = 0;
  private high = 0;
  private lowFrequency = 250;
  private highFrequency = 3000;

  constructor(
    private readonly sampleRate: number,
    params: Readonly<Record<string, number>>
  ) {
    this.setParam('low', params.low ?? 0);
    this.setParam('mid', params.mid ?? 0);
    this.setParam('high', params.high ?? 0);
    this.setParam('lowFrequency', params.lowFrequency ?? 250);
    this.setParam('highFrequency', params.highFrequency ?? 3000);
  }

  setParam(param: string, value: number): void {
    switch (param) {
      case 'low':
        this.low = clamp(value, -18, 18);
        this.update();
        return;
      case 'mid':
        this.mid = clamp(value, -18, 18);
        this.update();
        return;
      case 'high':
        this.high = clamp(value, -18, 18);
        this.update();
        return;
      case 'lowFrequency':
        this.lowFrequency = clamp(value, 80, 1000);
        this.update();
        return;
      case 'highFrequency':
        this.highFrequency = clamp(value, 1000, 10_000);
        this.update();
        return;
      default:
        return;
    }
  }

  process(frame: StereoFrame): void {
    frame.left = this.highLeft.process(
      this.midLeft.process(this.lowLeft.process(frame.left))
    );
    frame.right = this.highRight.process(
      this.midRight.process(this.lowRight.process(frame.right))
    );
  }

  reset(): void {
    this.lowLeft.reset();
    this.lowRight.reset();
    this.midLeft.reset();
    this.midRight.reset();
    this.highLeft.reset();
    this.highRight.reset();
  }

  private update(): void {
    const mid = Math.sqrt(this.lowFrequency * this.highFrequency);
    this.lowLeft.setLowShelf(this.lowFrequency, this.sampleRate, this.low);
    this.lowRight.setLowShelf(this.lowFrequency, this.sampleRate, this.low);
    this.midLeft.setPeaking(mid, this.sampleRate, 0.7, this.mid);
    this.midRight.setPeaking(mid, this.sampleRate, 0.7, this.mid);
    this.highLeft.setHighShelf(this.highFrequency, this.sampleRate, this.high);
    this.highRight.setHighShelf(this.highFrequency, this.sampleRate, this.high);
  }
}
