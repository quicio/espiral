import type { CoreEffect, StereoFrame } from './effect';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

class MonoReverb {
  private readonly combBuffers: Float32Array[];
  private readonly combIndices: Uint32Array;
  private readonly combStores: Float32Array;
  private readonly allpassBuffers: Float32Array[];
  private readonly allpassIndices: Uint32Array;
  private feedback: number;
  private readonly damping = 0.3;

  constructor(sampleRate: number, decay: number, spread: number) {
    const scale = sampleRate / 44_100;
    const combLengths = [1116, 1188, 1277, 1356];
    const allpassLengths = [556, 441];
    this.combBuffers = combLengths.map(length =>
      new Float32Array(Math.max(4, Math.round(length * scale) + spread))
    );
    this.combIndices = new Uint32Array(this.combBuffers.length);
    this.combStores = new Float32Array(this.combBuffers.length);
    this.allpassBuffers = allpassLengths.map(length =>
      new Float32Array(Math.max(4, Math.round(length * scale) + spread))
    );
    this.allpassIndices = new Uint32Array(this.allpassBuffers.length);
    this.feedback = 0.7 + 0.29 * clamp(decay / 10, 0, 1);
  }

  setDecay(decay: number): void {
    this.feedback = 0.7 + 0.29 * clamp(decay / 10, 0, 1);
  }

  process(input: number): number {
    let output = 0;

    for (let index = 0; index < this.combBuffers.length; index += 1) {
      const buffer = this.combBuffers[index]!;
      const position = this.combIndices[index]!;
      const delayed = buffer[position] ?? 0;
      const filtered =
        delayed * (1 - this.damping) +
        (this.combStores[index] ?? 0) * this.damping;
      this.combStores[index] = filtered;
      buffer[position] = input + filtered * this.feedback;
      this.combIndices[index] = (position + 1) % buffer.length;
      output += delayed;
    }

    output *= 0.25;

    for (let index = 0; index < this.allpassBuffers.length; index += 1) {
      const buffer = this.allpassBuffers[index]!;
      const position = this.allpassIndices[index]!;
      const buffered = buffer[position] ?? 0;
      const next = -output + buffered;
      buffer[position] = output + buffered * 0.5;
      this.allpassIndices[index] = (position + 1) % buffer.length;
      output = next;
    }

    return output;
  }

  reset(): void {
    this.combBuffers.forEach(buffer => buffer.fill(0));
    this.combIndices.fill(0);
    this.combStores.fill(0);
    this.allpassBuffers.forEach(buffer => buffer.fill(0));
    this.allpassIndices.fill(0);
  }
}

export class ReverbEffect implements CoreEffect {
  private readonly left: MonoReverb;
  private readonly right: MonoReverb;
  private wet: number;

  constructor(
    sampleRate: number,
    params: Readonly<Record<string, number>>
  ) {
    const decay = clamp(params.decay ?? 4, 0.1, 10);
    this.left = new MonoReverb(sampleRate, decay, 0);
    this.right = new MonoReverb(sampleRate, decay, 23);
    this.wet = clamp(params.wet ?? 0.5, 0, 1);
  }

  setParam(param: string, value: number): void {
    if (param === 'wet') this.wet = clamp(value, 0, 1);
    else if (param === 'decay') {
      const decay = clamp(value, 0.1, 10);
      this.left.setDecay(decay);
      this.right.setDecay(decay);
    }
  }

  process(frame: StereoFrame): void {
    const wetLeft = this.left.process(frame.left);
    const wetRight = this.right.process(frame.right);
    frame.left = frame.left * (1 - this.wet) + wetLeft * this.wet;
    frame.right = frame.right * (1 - this.wet) + wetRight * this.wet;
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
  }
}
