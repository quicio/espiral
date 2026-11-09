import * as Tone from 'tone';
import type { ClockPort, StepListener } from '../../domain/ports';

export class ToneClock implements ClockPort {
  private loop: Tone.Loop | null = null;
  private readonly listeners = new Set<StepListener>();

  constructor(private bpm: number) {}

  async start(): Promise<void> {
    await Tone.start();
    Tone.Transport.bpm.value = this.bpm;
    this.loop?.dispose();
    this.loop = new Tone.Loop(time => {
      const step = this.stepAt(time);
      for (const listener of this.listeners) listener(time, step);
    }, '16n');
    this.loop.start(0);
    Tone.Transport.start();
  }

  stop(): void {
    Tone.Transport.stop();
    this.loop?.dispose();
    this.loop = null;
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
    Tone.Transport.bpm.value = bpm;
  }

  getBpm(): number {
    return this.bpm;
  }

  onStep(listener: StepListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
  }

  private stepAt(time: number): number {
    const ticks = Tone.Transport.getTicksAtTime(time);
    const stepTicks = Tone.Transport.PPQ / 4;
    return Math.max(0, Math.round(ticks / stepTicks));
  }
}
