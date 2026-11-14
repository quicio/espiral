export interface CoreInstrument {
  triggerKick?(velocity: number, seed: number): void;
  triggerSynth?(
    notes: readonly number[],
    durationSeconds: number,
    velocity: number,
    accent: boolean,
    slide: boolean,
    seed: number
  ): void;
  setVoiceLimit?(limit: number): void;
  triggerSample?(
    sampleIndex: number,
    playbackRate: number,
    durationSeconds: number | undefined,
    gainDb: number,
    seed: number
  ): void;
  render(): number;
  stop(): void;
  reset(): void;
}
