import type { EnvelopeConfig } from '../../../../domain/graph';

type Stage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

export class AdsrEnvelope {
  private stage: Stage = 'idle';
  private value = 0;
  private readonly attackIncrement: number;
  private readonly decayCoefficient: number;
  private readonly sustain: number;
  private readonly releaseCoefficient: number;

  constructor(config: EnvelopeConfig, sampleRate: number) {
    this.sustain = clamp(config.sustain, 0, 1);
    this.attackIncrement = 1 / (Math.max(0.0005, config.attack) * sampleRate);
    this.decayCoefficient = Math.exp(
      -1 / (Math.max(0.001, config.decay) * sampleRate)
    );
    this.releaseCoefficient = Math.exp(
      -1 / (Math.max(0.001, config.release) * sampleRate)
    );
  }

  get isActive(): boolean {
    return this.stage !== 'idle';
  }

  get current(): number {
    return this.value;
  }

  trigger(): void {
    this.stage = 'attack';
    this.value = 0;
  }

  release(): void {
    if (this.stage === 'idle' || this.stage === 'release') return;
    this.stage = 'release';
  }

  kill(): void {
    this.stage = 'idle';
    this.value = 0;
  }

  process(): number {
    switch (this.stage) {
      case 'attack':
        this.value += this.attackIncrement;
        if (this.value >= 1) {
          this.value = 1;
          this.stage = 'decay';
        }
        break;
      case 'decay':
        this.value = this.sustain + (this.value - this.sustain) * this.decayCoefficient;
        if (this.value - this.sustain < 0.0001) {
          this.value = this.sustain;
          this.stage = 'sustain';
        }
        break;
      case 'sustain':
        this.value = this.sustain;
        break;
      case 'release':
        this.value *= this.releaseCoefficient;
        if (this.value < 0.00005) {
          this.value = 0;
          this.stage = 'idle';
        }
        break;
      default:
        this.value = 0;
        break;
    }
    return this.value;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
