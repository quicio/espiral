export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}
