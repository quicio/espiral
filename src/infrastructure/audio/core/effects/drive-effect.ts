import type { CoreEffect, StereoFrame } from './effect';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class DriveEffect implements CoreEffect {
  private preamp: number;
  private makeup: number;
  private mix: number;
  private previousLeft = 0;
  private previousRight = 0;

  constructor(
    _sampleRate: number,
    params: Readonly<Record<string, number>>
  ) {
    const drive = clamp(params.drive ?? 0.4, 0, 1);
    this.preamp = 1 + drive * 8;
    this.makeup = 1 / (1 + drive * 2);
    this.mix = clamp(params.mix ?? 0.5, 0, 1);
  }

  setParam(param: string, value: number): void {
    if (param === 'drive') {
      const drive = clamp(value, 0, 1);
      this.preamp = 1 + drive * 8;
      this.makeup = 1 / (1 + drive * 2);
    } else if (param === 'mix') {
      this.mix = clamp(value, 0, 1);
    }
  }

  process(frame: StereoFrame): void {
    const midLeft = (this.previousLeft + frame.left) * 0.5;
    const midRight = (this.previousRight + frame.right) * 0.5;
    const wetLeft = (this.shape(midLeft) + this.shape(frame.left)) * 0.5;
    const wetRight = (this.shape(midRight) + this.shape(frame.right)) * 0.5;
    this.previousLeft = frame.left;
    this.previousRight = frame.right;
    frame.left = frame.left * (1 - this.mix) + wetLeft * this.mix;
    frame.right = frame.right * (1 - this.mix) + wetRight * this.mix;
  }

  reset(): void {
    this.previousLeft = 0;
    this.previousRight = 0;
  }

  private shape(value: number): number {
    const driven =
      Math.tanh(value * this.preamp) * this.makeup;
    return driven;
  }
}
