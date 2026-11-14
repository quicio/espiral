import type { EnvelopeConfig, MachineConfig } from '../../../../domain/graph';
import { AdsrEnvelope } from '../dsp/envelope';
import { Oscillator, type CoreWaveform } from '../dsp/oscillator';
import { midiToFrequency } from '../dsp/pitch';
import { StateVariableFilter } from '../dsp/svf';

const DEFAULT_ENVELOPE: EnvelopeConfig = {
  attack: 0.01,
  decay: 0.2,
  sustain: 0.35,
  release: 0.35
};

export class MonoVoice {
  private readonly oscillator = new Oscillator();
  private readonly filter = new StateVariableFilter();
  private readonly ampEnvelope: AdsrEnvelope;
  private readonly filterEnvelope: AdsrEnvelope;
  private readonly waveform: CoreWaveform;
  private readonly baseCutoff: number;
  private readonly resonance: number;
  private readonly filterOctaves: number;
  private readonly glideSeconds: number;
  private currentMidi = 69;
  private targetMidi = 69;
  private glideRemaining = 0;
  private glideStep = 0;
  private gateFrames = 0;
  private released = false;
  private velocity = 1;
  private accent = false;

  constructor(
    machine: MachineConfig,
    private readonly sampleRate: number
  ) {
    const envelope = machine.envelope ?? DEFAULT_ENVELOPE;
    this.waveform = machine.oscillator ?? 'sawtooth';
    this.baseCutoff = machine.filter?.frequency ?? 12000;
    this.resonance = machine.filter?.q ?? 0.7;
    this.filterOctaves = machine.filterEnvelope?.octaves ?? 0;
    this.glideSeconds = Math.max(0, machine.glide ?? 0);
    this.ampEnvelope = new AdsrEnvelope(envelope, sampleRate);
    this.filterEnvelope = new AdsrEnvelope(
      machine.filterEnvelope
        ? {
            attack: machine.filterEnvelope.attack,
            decay: machine.filterEnvelope.decay,
            sustain: machine.filterEnvelope.sustain,
            release: machine.filterEnvelope.release
          }
        : { attack: 0.001, decay: 0.001, sustain: 0, release: 0.001 },
      sampleRate
    );
  }

  get isActive(): boolean {
    return this.ampEnvelope.isActive;
  }

  trigger(
    midi: number,
    velocity: number,
    durationSeconds: number,
    accent: boolean,
    slide: boolean,
    previousMidi?: number
  ): void {
    this.velocity = Math.max(0, Math.min(1, velocity));
    this.accent = accent;
    this.released = false;
    this.gateFrames = Math.max(
      1,
      Math.round(Math.max(0.01, durationSeconds) * this.sampleRate)
    );

    if (slide && previousMidi !== undefined) {
      this.currentMidi = previousMidi;
      this.targetMidi = midi;
      this.glideRemaining = Math.round(
        Math.max(0, this.glideSeconds) * this.sampleRate
      );
      this.glideStep =
        this.glideRemaining > 0
          ? (this.targetMidi - this.currentMidi) / this.glideRemaining
          : 0;
    } else {
      this.currentMidi = midi;
      this.targetMidi = midi;
      this.glideRemaining = 0;
      this.glideStep = 0;
      this.oscillator.reset();
      this.filter.reset();
    }

    this.ampEnvelope.trigger();
    this.filterEnvelope.trigger();
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.ampEnvelope.release();
    this.filterEnvelope.release();
  }

  kill(): void {
    this.ampEnvelope.kill();
    this.filterEnvelope.kill();
    this.filter.reset();
    this.gateFrames = 0;
    this.released = true;
  }

  reset(): void {
    this.kill();
    this.currentMidi = 69;
    this.targetMidi = 69;
    this.glideRemaining = 0;
    this.glideStep = 0;
    this.oscillator.reset();
    this.filter.reset();
  }

  render(): number {
    if (!this.ampEnvelope.isActive) return 0;

    if (this.gateFrames > 0) {
      this.gateFrames -= 1;
      if (this.gateFrames === 0) this.release();
    }

    if (this.glideRemaining > 0) {
      this.currentMidi += this.glideStep;
      this.glideRemaining -= 1;
      if (this.glideRemaining === 0) this.currentMidi = this.targetMidi;
    }

    const frequency = midiToFrequency(this.currentMidi);
    const raw = this.oscillator.process(
      frequency,
      this.waveform,
      this.sampleRate
    );

    const filterAmount = this.filterEnvelope.process();
    let cutoff = this.baseCutoff * Math.pow(2, this.filterOctaves * filterAmount);
    if (this.accent) cutoff *= 1.35;
    const filtered = this.filter.process(
      raw,
      cutoff,
      this.resonance,
      this.sampleRate
    );

    const amplitude =
      this.ampEnvelope.process() * this.velocity * (this.accent ? 1.2 : 1);
    return filtered * amplitude;
  }
}
