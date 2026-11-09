export class PlaybackRuntime {
  droneStep = 0;
  padStep = 0;
  lastPadChord = 0;
  currentChordDegree = 0;
  leadCounter = 0;

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
  }
}
