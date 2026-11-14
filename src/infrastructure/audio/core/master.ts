import { CompressorEffect } from './effects/compressor-effect';
import type { StereoFrame } from './effects/effect';
import { Biquad } from './dsp/biquad';
import type { CoreMasterConfig } from './types';

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export class MasterBus {
  private readonly gain: number;
  private readonly trim: number;
  private readonly threshold: number;
  private readonly kneeStart: number;
  private readonly dcCoefficient: number;
  private readonly glue: CompressorEffect | null;
  private readonly lowLeft = new Biquad();
  private readonly lowRight = new Biquad();
  private readonly midLeft = new Biquad();
  private readonly midRight = new Biquad();
  private readonly highLeft = new Biquad();
  private readonly highRight = new Biquad();
  private readonly frame: StereoFrame = { left: 0, right: 0 };
  private readonly lookaheadFrames: number;
  private readonly delayLeft: Float32Array;
  private readonly delayRight: Float32Array;
  private readonly releaseCoefficient: number;
  private delayIndex = 0;
  private limiterGain = 1;
  private dcPrevLeft = 0;
  private dcLeft = 0;
  private dcPrevRight = 0;
  private dcRight = 0;

  constructor(config: CoreMasterConfig, sampleRate: number) {
    this.gain = dbToGain(config.volumeDb);
    this.trim = dbToGain(config.trimDb ?? 0);
    this.threshold = dbToGain(config.limiterDb);
    this.kneeStart = this.threshold * 0.9;
    this.lookaheadFrames = Math.max(
      0,
      Math.round(((config.lookaheadMs ?? 0) / 1000) * sampleRate)
    );
    this.delayLeft = new Float32Array(Math.max(1, this.lookaheadFrames));
    this.delayRight = new Float32Array(Math.max(1, this.lookaheadFrames));
    this.releaseCoefficient = 1 - Math.exp(-1 / (0.08 * sampleRate));
    this.dcCoefficient = 1 - (Math.PI * 2 * 5) / sampleRate;
    this.glue = config.glue
      ? new CompressorEffect(sampleRate, {
          threshold: config.glue.threshold,
          ratio: config.glue.ratio,
          attack: config.glue.attack,
          release: config.glue.release
        })
      : null;

    const eq = config.eq ?? { low: 0, mid: 0, high: 0 };
    this.lowLeft.setLowShelf(250, sampleRate, eq.low);
    this.lowRight.setLowShelf(250, sampleRate, eq.low);
    this.midLeft.setPeaking(1000, sampleRate, 0.7, eq.mid);
    this.midRight.setPeaking(1000, sampleRate, 0.7, eq.mid);
    this.highLeft.setHighShelf(3000, sampleRate, eq.high);
    this.highRight.setHighShelf(3000, sampleRate, eq.high);
  }

  process(
    left: number,
    right: number,
    outputLeft: Float32Array,
    outputRight: Float32Array,
    index: number
  ): void {
    const drivenLeft = left * this.gain;
    const drivenRight = right * this.gain;

    const blockedLeft =
      drivenLeft - this.dcPrevLeft + this.dcCoefficient * this.dcLeft;
    const blockedRight =
      drivenRight - this.dcPrevRight + this.dcCoefficient * this.dcRight;
    this.dcPrevLeft = drivenLeft;
    this.dcLeft = blockedLeft;
    this.dcPrevRight = drivenRight;
    this.dcRight = blockedRight;

    this.frame.left = blockedLeft;
    this.frame.right = blockedRight;
    this.glue?.process(this.frame);

    const equalizedLeft = this.highLeft.process(
      this.midLeft.process(this.lowLeft.process(this.frame.left))
    );
    const equalizedRight = this.highRight.process(
      this.midRight.process(this.lowRight.process(this.frame.right))
    );

    const trimmedLeft = equalizedLeft * this.trim;
    const trimmedRight = equalizedRight * this.trim;

    if (this.lookaheadFrames > 0) {
      const peak = Math.max(Math.abs(trimmedLeft), Math.abs(trimmedRight));
      const target = peak > this.threshold ? this.threshold / peak : 1;
      if (target < this.limiterGain) this.limiterGain = target;
      else {
        this.limiterGain +=
          (target - this.limiterGain) * this.releaseCoefficient;
      }
      const delayedLeft = this.delayLeft[this.delayIndex] ?? 0;
      const delayedRight = this.delayRight[this.delayIndex] ?? 0;
      this.delayLeft[this.delayIndex] = trimmedLeft;
      this.delayRight[this.delayIndex] = trimmedRight;
      this.delayIndex = (this.delayIndex + 1) % this.lookaheadFrames;
      outputLeft[index] = this.limit(delayedLeft * this.limiterGain);
      outputRight[index] = this.limit(delayedRight * this.limiterGain);
      return;
    }

    outputLeft[index] = this.limit(trimmedLeft);
    outputRight[index] = this.limit(trimmedRight);
  }

  reset(): void {
    this.dcPrevLeft = 0;
    this.dcLeft = 0;
    this.dcPrevRight = 0;
    this.dcRight = 0;
    this.delayLeft.fill(0);
    this.delayRight.fill(0);
    this.delayIndex = 0;
    this.limiterGain = 1;
    this.glue?.reset();
    this.lowLeft.reset();
    this.lowRight.reset();
    this.midLeft.reset();
    this.midRight.reset();
    this.highLeft.reset();
    this.highRight.reset();
  }

  private limit(value: number): number {
    const absolute = Math.abs(value);
    if (absolute <= this.kneeStart) return value;
    const range = this.threshold - this.kneeStart;
    const shaped = Math.tanh((absolute - this.kneeStart) / range);
    return Math.sign(value) * (this.kneeStart + range * shaped);
  }
}
