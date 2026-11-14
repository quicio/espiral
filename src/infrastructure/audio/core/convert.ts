import type { NoteDuration, SoundEvent } from '../../../domain/audio';
import type { CoreEvent } from './types';

const PITCH_CLASS: Readonly<Record<string, number>> = {
  C: 0,
  'C#': 1,
  DB: 1,
  D: 2,
  'D#': 3,
  EB: 3,
  E: 4,
  FB: 4,
  'E#': 5,
  F: 5,
  'F#': 6,
  GB: 6,
  G: 7,
  'G#': 8,
  AB: 8,
  A: 9,
  'A#': 10,
  BB: 10,
  B: 11,
  CB: 11,
  'B#': 12
};

export function noteToMidi(note: string): number | null {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim());
  if (!match) return null;
  const letter = (match[1] ?? '').toUpperCase();
  const accidental = (match[2] ?? '').toUpperCase();
  const octave = Number(match[3]);
  const pitch = PITCH_CLASS[`${letter}${accidental}`];
  if (pitch === undefined || !Number.isFinite(octave)) return null;
  return pitch + (octave + 1) * 12;
}

export function noteSeconds(duration: NoteDuration, bpm: number): number {
  switch (duration) {
    case '16n':
      return 60 / bpm / 4;
    case '8n':
      return 60 / bpm / 2;
    case '4n':
      return 60 / bpm;
    case '2n':
      return 120 / bpm;
    case '1m':
      return 240 / bpm;
    case '2m':
      return 480 / bpm;
    default:
      return 60 / bpm / 2;
  }
}

export function toCoreEvent(
  event: SoundEvent,
  bpm: number,
  origin = 0
): CoreEvent | null {
  const time = Math.max(0, event.time - origin);
  if (event.type === 'kick') {
    return {
      type: 'kick',
      trackId: 'kick',
      time,
      velocity: event.velocity
    };
  }
  if (event.type === 'synth') {
    const notes = (
      typeof event.notes === 'string' ? [event.notes] : event.notes
    )
      .map(note => noteToMidi(note))
      .filter((note): note is number => note !== null);
    if (notes.length === 0) return null;
    return {
      type: 'synth',
      trackId: event.trackId ?? event.channel,
      time,
      notes,
      duration: noteSeconds(event.duration, bpm),
      velocity: event.velocity,
      accent: event.accent,
      slide: event.slide
    };
  }
  return {
    type: 'sample',
    trackId: event.trackId ?? event.channel,
    time,
    sampleIndex: event.sampleIndex,
    playbackRate: event.playbackRate,
    duration:
      event.duration !== undefined
        ? noteSeconds(event.duration, bpm)
        : undefined,
    gainDb: event.gainDb
  };
}
