import * as Tone from 'tone';

export function isOfflineContext(): boolean {
  const raw = Tone.getContext().rawContext;
  return typeof OfflineAudioContext !== 'undefined' && raw instanceof OfflineAudioContext;
}
