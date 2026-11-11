import * as Tone from 'tone';
import type { ClockPort, StepListener } from '../../domain/ports';

export class ToneClock implements ClockPort {
  private loop: Tone.Loop | null = null;
  private readonly listeners = new Set<StepListener>();

  constructor(private bpm: number, private lookAhead = 0.1) {
    Tone.getContext().lookAhead = this.lookAhead;
  }

  async start(): Promise<void> {
    await Tone.start();
    Tone.getContext().lookAhead = this.lookAhead;
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
    Tone.Transport.bpm.rampTo(bpm, 0.08);
  }

  getBpm(): number {
    return this.bpm;
  }

  setLookAhead(seconds: number): void {
    this.lookAhead = Math.max(0, Math.min(0.5, seconds));
    Tone.getContext().lookAhead = this.lookAhead;
  }

  getLookAhead(): number {
    return this.lookAhead;
  }

  now(): number {
    return Tone.now();
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
