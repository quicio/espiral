import * as Tone from 'tone';
import type { MasterConfig } from '../../../domain/graph';
import { createSafetyClipper } from '../safety-clipper';
import { readMeter } from './track';

export class MasterBus {
  readonly input = new Tone.Gain(1);
  private readonly transition: Tone.Gain;
  private readonly volume: Tone.Volume;
  private readonly hpf: Tone.Filter;
  private readonly glue: Tone.Compressor;
  private readonly limiter: Tone.Limiter;
  private readonly clipper: Tone.WaveShaper;
  private readonly meter: Tone.Meter;

  constructor(config: MasterConfig) {
    this.transition = new Tone.Gain(1);
    this.volume = new Tone.Volume(config.volumeDb);
    this.hpf = new Tone.Filter({ type: 'highpass', frequency: 25, rolloff: -12 });
    this.glue = new Tone.Compressor(config.glue);
    this.limiter = new Tone.Limiter(config.limiterDb);
    this.clipper = createSafetyClipper();
    this.meter = new Tone.Meter({ normalRange: false, smoothing: 0.8 });

    this.input.chain(
      this.transition,
      this.volume,
      this.hpf,
      this.glue,
      this.limiter,
      this.clipper,
      Tone.getDestination()
    );
    this.clipper.connect(this.meter);
  }

  setVolume(db: number): void {
    this.volume.volume.rampTo(db, 0.05, Tone.now());
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

  dispose(): void {
    this.input.dispose();
    this.transition.dispose();
    this.volume.dispose();
    this.hpf.dispose();
    this.glue.dispose();
    this.limiter.dispose();
    this.clipper.dispose();
    this.meter.dispose();
  }
}
