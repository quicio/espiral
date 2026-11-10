import { normalizeStep } from '../domain/pattern';
import type { NoteDuration } from '../domain/audio';
import type { InstrumentState } from '../domain/models';
import type { GenerativePort } from '../domain/ports';

export const BASS_SAMPLE_MIDI = [45, 47, 49, 51, 53, 55] as const;

export function noteDuration(kind: 'pad' | 'lead' | 'bass', sustain: number): NoteDuration {
  if (kind === 'pad') {
    return sustain < 0.34 ? '2n' : sustain < 0.67 ? '1m' : '2m';
  }
  if (kind === 'lead') {
    return sustain < 0.25 ? '16n' : sustain < 0.5 ? '8n' : sustain < 0.75 ? '4n' : '2n';
  }
  return sustain < 0.4 ? '16n' : sustain < 0.7 ? '8n' : '4n';
}

export function timingOffset(
  state: InstrumentState,
  generative: GenerativePort,
  channel: string,
  stepCount: number
): number {
  const stepSeconds = 60 / Math.max(state.transport.bpm, 1) / 4;
  const step = normalizeStep(stepCount);
  const swing = step % 2 === 1 ? state.transport.swing * stepSeconds * 0.5 : 0;
  const human =
    (generative.hash01(state.seed, channel, stepCount, 91) - 0.5) *
    state.transport.humanize *
    0.03;
  return swing + human;
}

export function progressionDegrees(state: InstrumentState, generative: GenerativePort): readonly number[] {
  return generative.progressions[state.harmony.progression].degrees;
}

export function bassVoice(
  state: InstrumentState,
  generative: GenerativePort,
  stepCount: number,
  chordDegree: number
): { sampleIndex: number; playbackRate: number } {
  const degrees = progressionDegrees(state, generative);
  const degree = degrees[chordDegree % degrees.length] ?? 0;
  const step = normalizeStep(stepCount);
  const offset = step === 4 || step === 12 ? 4 : 0;
  const target = generative.scaleDegreeMidi(
    state.harmony.root,
    state.harmony.scale,
    degree + offset,
    3
  );

  let sampleIndex = 0;
  let distance = Number.POSITIVE_INFINITY;
  BASS_SAMPLE_MIDI.forEach((midi, index) => {
    const delta = Math.abs(midi - target);
    if (delta < distance) {
      distance = delta;
      sampleIndex = index;
    }
  });

  const sampleMidi = BASS_SAMPLE_MIDI[sampleIndex] ?? target;
  const jitter =
    1 + (generative.hash01(state.seed, 'bass-pitch', stepCount, 12) - 0.5) * 0.004;

  return {
    sampleIndex,
    playbackRate: Math.pow(2, (target - sampleMidi) / 12) * jitter
  };
}

export function hihatVoice(
  state: InstrumentState,
  generative: GenerativePort,
  stepCount: number,
  sampleCount: number
): { sampleIndex: number; playbackRate: number; gainDb: number } {
  const sampleIndex = Math.min(
    sampleCount - 1,
    Math.floor(generative.hash01(state.seed, 'hihat', stepCount, 3) * sampleCount)
  );
  const accent = stepCount % 4 === 0 ? 2.5 : stepCount % 2 === 0 ? 1 : 0;

  return {
    sampleIndex: Math.max(0, sampleIndex),
    playbackRate: 1 + (generative.hash01(state.seed, 'hihat', stepCount, 4) - 0.5) * 0.1,
    gainDb: -10 + accent
  };
}

export function percPlaybackRate(
  state: InstrumentState,
  generative: GenerativePort,
  stepCount: number
): number {
  return 1 + (generative.hash01(state.seed, 'perc', stepCount, 6) - 0.5) * 0.1;
}

export function dronePlaybackRate(
  state: InstrumentState,
  generative: GenerativePort,
  droneStep: number
): number {
  let rootOffset = (state.harmony.root - 9 + 12) % 12;
  if (rootOffset > 6) rootOffset -= 12;
  const drift =
    1 + (generative.hash01(state.seed, 'drone-tune', droneStep, 5) - 0.5) * 0.01;
  return Math.pow(2, rootOffset / 12) * drift;
}

export function padChord(
  state: InstrumentState,
  generative: GenerativePort,
  chordIndex: number
): { degree: number; notes: readonly string[] } {
  const degrees = progressionDegrees(state, generative);
  const degree = degrees[chordIndex % degrees.length] ?? 0;
  return {
    degree,
    notes: generative.chordNotes(state.harmony.root, state.harmony.scale, degree, 3, 4)
  };
}

export function leadNote(
  state: InstrumentState,
  generative: GenerativePort,
  counter: number,
  chordDegree: number
): string | null {
  if (generative.hash01(state.seed, 'lead', counter, 7) <= 0.68) return null;

  if (generative.hash01(state.seed, 'lead', counter, 10) < 0.35) {
    const degrees = progressionDegrees(state, generative);
    const degree = degrees[chordDegree % degrees.length] ?? 0;
    return generative.midiToNote(
      generative.scaleDegreeMidi(state.harmony.root, state.harmony.scale, degree, 4)
    );
  }

  const scale = generative.scaleNotes(state.harmony.root, state.harmony.scale, 3, 14);
  const index = Math.floor(generative.hash01(state.seed, 'lead', counter, 8) * scale.length);
  return scale[index] ?? scale[0] ?? 'C4';
}
