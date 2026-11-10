export type PendingClipAction =
  | {
      readonly kind: 'clip';
      readonly targetStep: number;
      readonly clipId: string;
    }
  | {
      readonly kind: 'stop-track';
      readonly targetStep: number;
      readonly trackId: string;
    }
  | {
      readonly kind: 'stop-all';
      readonly targetStep: number;
    };

export class PlaybackRuntime {
  droneStep = 0;
  padStep = 0;
  lastPadChord = 0;
  currentChordDegree = 0;
  leadCounter = 0;
  absoluteStep = 0;
  pendingClipActions: PendingClipAction[] = [];
  clipStartedAt: Record<string, number> = {};

  resetHarmony(): void {
    this.lastPadChord = 0;
    this.currentChordDegree = 0;
  }

  resetAll(): void {
    this.droneStep = 0;
    this.padStep = 0;
    this.lastPadChord = 0;
    this.currentChordDegree = 0;
    this.leadCounter = 0;
    this.absoluteStep = 0;
    this.pendingClipActions = [];
    this.clipStartedAt = {};
  }
}
