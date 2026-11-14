export type CoreWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

const TAU = Math.PI * 2;

export class Oscillator {
  private phase = 0;

  reset(phase = 0): void {
    this.phase = phase - Math.floor(phase);
  }

  process(frequency: number, waveform: CoreWaveform, sampleRate: number): number {
    const increment = Math.min(0.45, Math.max(0, frequency / sampleRate));
    const value = this.shape(this.phase, increment, waveform);
    this.phase += increment;
    if (this.phase >= 1) this.phase -= 1;
    return value;
  }

  private shape(phase: number, increment: number, waveform: CoreWaveform): number {
    switch (waveform) {
      case 'sine':
        return Math.sin(TAU * phase);
      case 'triangle':
        return 2 * Math.abs(2 * phase - 1) - 1;
      case 'square':
        return (
          (phase < 0.5 ? 1 : -1) +
          polyBlep(phase, increment) -
          polyBlep((phase + 0.5) % 1, increment)
        );
      case 'sawtooth':
      default:
        return 2 * phase - 1 - polyBlep(phase, increment);
    }
  }
}

function polyBlep(phase: number, increment: number): number {
  if (increment <= 0) return 0;
  if (phase < increment) {
    const value = phase / increment;
    return value + value - value * value - 1;
  }
  if (phase > 1 - increment) {
    const value = (phase - 1) / increment;
    return value * value + value + value + 1;
  }
  return 0;
}
