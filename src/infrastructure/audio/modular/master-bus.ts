import * as Tone from 'tone';
import type { EqSettings, MasterConfig } from '../../../domain/graph';
import { createSafetyClipper } from '../safety-clipper';
import { readMeter } from './track';

export class MasterBus {
  readonly input = new Tone.Gain(1);
  private readonly transition: Tone.Gain;
  private readonly volume: Tone.Volume;
  private readonly hpf: Tone.Filter;
  private readonly glue: Tone.Compressor;
  private readonly eq: Tone.EQ3;
  private readonly trim: Tone.Gain;
  private readonly limiter: Tone.Limiter;
  private readonly clipper: Tone.WaveShaper;
  private readonly meter: Tone.Meter;
  private spectrum: Tone.Analyser | null = null;

  constructor(config: MasterConfig) {
    this.transition = new Tone.Gain(1);
    this.volume = new Tone.Volume(config.volumeDb);
    this.hpf = new Tone.Filter({ type: 'highpass', frequency: 25, rolloff: -12 });
    this.glue = new Tone.Compressor(config.glue);
    this.eq = new Tone.EQ3({
      low: config.eq?.low ?? 0,
      mid: config.eq?.mid ?? 0,
      high: config.eq?.high ?? 0,
      lowFrequency: 250,
      highFrequency: 3000
    });
    this.trim = new Tone.Gain(Math.pow(10, (config.trimDb ?? 0) / 20));
    this.limiter = new Tone.Limiter(config.limiterDb);
    this.clipper = createSafetyClipper();
    this.meter = new Tone.Meter({ normalRange: false, smoothing: 0.8 });

    this.input.chain(
      this.transition,
      this.volume,
      this.hpf,
      this.glue,
      this.eq,
      this.trim,
      this.limiter,
      this.clipper,
      Tone.getDestination()
    );
    this.clipper.connect(this.meter);
  }

  setVolume(db: number): void {
    this.volume.volume.rampTo(db, 0.05, Tone.now());
  }

  setEq(eq: EqSettings): void {
    const now = Tone.now();
    this.eq.low.rampTo(eq.low, 0.05, now);
    this.eq.mid.rampTo(eq.mid, 0.05, now);
    this.eq.high.rampTo(eq.high, 0.05, now);
  }

  beginTransition(fadeOutMs = 6): void {
    const now = Tone.now();
    const duration = Math.max(0.001, fadeOutMs / 1000);
    this.transition.gain.cancelScheduledValues(now);
    this.transition.gain.setValueAtTime(this.transition.gain.value, now);
    this.transition.gain.linearRampToValueAtTime(0, now + duration);
  }

  endTransition(fadeInMs = 30): void {
    const now = Tone.now();
    const start = now + 0.01;
    const duration = Math.max(0.001, fadeInMs / 1000);
    this.transition.gain.setValueAtTime(0, start);
    this.transition.gain.linearRampToValueAtTime(1, start + duration);
  }

  getLevel(): number {
    return readMeter(this.meter);
  }

  getSpectrum(bins: number): readonly number[] {
    if (!this.spectrum) {
      this.spectrum = new Tone.Analyser({
        type: 'fft',
        size: 256,
        smoothing: 0.8,
        channels: 1
      });
      this.clipper.connect(this.spectrum);
    }
    const value = this.spectrum.getValue();
    const data = (Array.isArray(value) ? value[0] : value) ?? new Float32Array(0);
    const count = Math.max(1, Math.round(bins));
    const step = Math.max(1, Math.floor(data.length / count));
    return Array.from({ length: count }, (_, index) => {
      const db = data[index * step] ?? -100;
      return Math.max(0, Math.min(1, (db + 100) / 100));
    });
  }

  dispose(): void {
    this.input.dispose();
    this.transition.dispose();
    this.volume.dispose();
    this.hpf.dispose();
    this.glue.dispose();
    this.eq.dispose();
    this.trim.dispose();
    this.limiter.dispose();
    this.clipper.dispose();
    this.meter.dispose();
    this.spectrum?.dispose();
  }
}
