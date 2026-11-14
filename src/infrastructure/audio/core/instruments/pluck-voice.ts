import type { MachineConfig } from '../../../../domain/graph';
import { midiToFrequency } from '../dsp/pitch';

const SILENCE_FRAMES = 512;

export class PluckVoice {
  private buffer: Float32Array = new Float32Array(0);
  private index = 0;
  private active = false;
  private rng = 1;
  private gain = 1;
  private feedback = 0.99;
  private silentFrames = 0;

  constructor(
    private readonly machine: MachineConfig,
    private readonly sampleRate: number
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  trigger(midi: number, velocity: number, seed: number): void {
    const frequency = midiToFrequency(midi);
    const length = Math.max(
      4,
      Math.min(
        Math.floor(this.sampleRate / 20),
        Math.round(this.sampleRate / frequency)
      )
    );
    this.buffer = new Float32Array(length);
    this.rng = seed >>> 0 || 1;
    this.index = 0;
    this.active = true;
    this.silentFrames = 0;

    const pluck = this.machine.pluck;
    const attackNoise = pluck?.attackNoise ?? 1.2;
    const resonance = pluck?.resonance ?? 0.9;
    this.feedback = 0.98 + 0.019 * Math.max(0, Math.min(1, resonance));
    this.gain = Math.max(0, Math.min(1, velocity)) * 0.6;

    for (let position = 0; position < length; position += 1) {
      this.buffer[position] = this.nextNoise() * attackNoise * 0.4;
    }
  }

  stop(): void {
    this.active = false;
  }

  reset(): void {
    this.active = false;
    this.buffer = new Float32Array(0);
    this.index = 0;
    this.silentFrames = 0;
  }

  render(): number {
    if (!this.active || this.buffer.length === 0) return 0;

    const current = this.buffer[this.index] ?? 0;
    const next = this.buffer[(this.index + 1) % this.buffer.length] ?? 0;
    this.buffer[this.index] = 0.5 * (current + next) * this.feedback;
    this.index = (this.index + 1) % this.buffer.length;

    const output = current * this.gain;
    if (Math.abs(output) < 1e-5) {
      this.silentFrames += 1;
      if (this.silentFrames > SILENCE_FRAMES) {
        this.active = false;
        return 0;
      }
    } else {
      this.silentFrames = 0;
    }
    return output;
  }

  private nextNoise(): number {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return (this.rng / 0xffffffff) * 2 - 1;
  }
}
