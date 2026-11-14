import { KickVoice } from '../kick-voice';
import type { CoreInstrument } from './instrument';

export class MembraneInstrument implements CoreInstrument {
  private readonly voice: KickVoice;

  constructor(sampleRate: number) {
    this.voice = new KickVoice(sampleRate);
  }

  triggerKick(velocity: number, seed: number): void {
    this.voice.trigger(velocity, seed);
  }

  render(): number {
    return this.voice.render();
  }

  stop(): void {
    this.voice.stop();
  }

  reset(): void {
    this.voice.reset();
  }
}
