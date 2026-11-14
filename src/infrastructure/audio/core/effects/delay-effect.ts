import type { CoreEffect, StereoFrame } from './effect';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class DelayEffect implements CoreEffect {
  private readonly bufferLeft: Float32Array;
  private readonly bufferRight: Float32Array;
  private wet: number;
  private feedback: number;
  private delaySamples: number;
  private write = 0;

  constructor(
    private readonly sampleRate: number,
    params: Readonly<Record<string, number>>
  ) {
    const size = Math.max(4, Math.ceil(sampleRate * 2.05));
    this.bufferLeft = new Float32Array(size);
    this.bufferRight = new Float32Array(size);
    this.wet = clamp(params.wet ?? 0.3, 0, 1);
    this.feedback = clamp(params.feedback ?? 0.35, 0, 0.95);
    this.delaySamples = clamp(
      (params.time ?? 0.25) * sampleRate,
      1,
      size - 2
    );
  }

  setParam(param: string, value: number): void {
    if (param === 'wet') this.wet = clamp(value, 0, 1);
    else if (param === 'feedback') this.feedback = clamp(value, 0, 0.95);
    else if (param === 'time') {
      this.delaySamples = clamp(
        value * this.sampleRate,
        1,
        this.bufferLeft.length - 2
      );
    }
  }

  process(frame: StereoFrame): void {
    const read = this.write - this.delaySamples;
    const wrapped = read < 0 ? read + this.bufferLeft.length : read;
    const index = Math.floor(wrapped);
    const fraction = wrapped - index;
    const next = (index + 1) % this.bufferLeft.length;

    const delayedLeft =
      (this.bufferLeft[index] ?? 0) * (1 - fraction) +
      (this.bufferLeft[next] ?? 0) * fraction;
    const delayedRight =
      (this.bufferRight[index] ?? 0) * (1 - fraction) +
      (this.bufferRight[next] ?? 0) * fraction;

    this.bufferLeft[this.write] =
      frame.left + delayedLeft * this.feedback;
    this.bufferRight[this.write] =
      frame.right + delayedRight * this.feedback;
    this.write = (this.write + 1) % this.bufferLeft.length;

    frame.left = frame.left * (1 - this.wet) + delayedLeft * this.wet;
    frame.right = frame.right * (1 - this.wet) + delayedRight * this.wet;
  }

  reset(): void {
    this.bufferLeft.fill(0);
    this.bufferRight.fill(0);
    this.write = 0;
  }
}
