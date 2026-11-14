import type { MachineConfig } from '../../../../domain/graph';
import { AdsrEnvelope } from '../dsp/envelope';
import { midiToFrequency } from '../dsp/pitch';

const TAU = Math.PI * 2;

function param(machine: MachineConfig, id: string, fallback: number): number {
  const value = machine.params?.[id];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export class FmVoice {
  private readonly envelope: AdsrEnvelope;
  private carrierPhase = 0;
  private modulatorPhase = 0;
  private carrierFrequency = 440;
  private modulatorFrequency = 880;
  private modulationIndex = 5;
  private velocity = 1;
  private gateFrames = 0;
  private released = false;

  constructor(
    private readonly machine: MachineConfig,
    private readonly sampleRate: number
  ) {
    this.envelope = new AdsrEnvelope(
      {
        attack: param(machine, 'attack', 0.02),
        decay: param(machine, 'decay', 0.3),
        sustain: param(machine, 'sustain', 0.4),
        release: param(machine, 'release', 1.2)
      },
      sampleRate
    );
  }

  get isActive(): boolean {
    return this.envelope.isActive;
  }

  trigger(
    midi: number,
    velocity: number,
    durationSeconds: number
  ): void {
    const harmonicity = Math.max(0.5, param(this.machine, 'harmonicity', 2));
    this.carrierFrequency = midiToFrequency(midi);
    this.modulatorFrequency = this.carrierFrequency * harmonicity;
    this.modulationIndex = Math.max(
      0,
      param(this.machine, 'modulationIndex', 5)
    );
    this.velocity = Math.max(0, Math.min(1, velocity));
    this.carrierPhase = 0;
    this.modulatorPhase = 0;
    this.gateFrames = Math.max(
      1,
      Math.round(Math.max(0.01, durationSeconds) * this.sampleRate)
    );
    this.released = false;
    this.envelope.trigger();
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.envelope.release();
  }

  kill(): void {
    this.envelope.kill();
    this.gateFrames = 0;
    this.released = true;
  }

  reset(): void {
    this.kill();
    this.carrierPhase = 0;
    this.modulatorPhase = 0;
  }

  render(): number {
    if (!this.envelope.isActive) return 0;
    if (this.gateFrames > 0) {
      this.gateFrames -= 1;
      if (this.gateFrames === 0) this.release();
    }

    const modulator = Math.sin(TAU * this.modulatorPhase);
    const carrier = Math.sin(
      TAU * this.carrierPhase + modulator * this.modulationIndex
    );
    this.modulatorPhase += this.modulatorFrequency / this.sampleRate;
    if (this.modulatorPhase >= 1) this.modulatorPhase -= 1;
    this.carrierPhase += this.carrierFrequency / this.sampleRate;
    if (this.carrierPhase >= 1) this.carrierPhase -= 1;

    return carrier * this.envelope.process() * this.velocity * 0.7;
  }
}
