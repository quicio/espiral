import { describe, expect, it } from 'vitest';
import { createInitialState } from '../application/initial-state';
import { Store } from '../application/store';
import {
  bassVoice,
  dronePlaybackRate,
  leadNote,
  noteDuration,
  padChord,
  timingOffset
} from '../application/voices';
import { FakeGenerative } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  store.update(state => ({
    ...state,
    transport: { ...state.transport, humanize: 0, swing: 0.12 }
  }));
  return { generative, store };
}

describe('voice rules', () => {
  it('maps sustain to note durations', () => {
    expect(noteDuration('pad', 0.2)).toBe('2n');
    expect(noteDuration('pad', 0.5)).toBe('1m');
    expect(noteDuration('pad', 0.8)).toBe('2m');
    expect(noteDuration('lead', 0.2)).toBe('16n');
    expect(noteDuration('lead', 0.9)).toBe('2n');
    expect(noteDuration('bass', 0.2)).toBe('16n');
    expect(noteDuration('bass', 0.9)).toBe('4n');
  });

  it('applies swing to odd steps', () => {
    const { generative, store } = setup();
    const state = store.getState();

    expect(timingOffset(state, generative, 'kick', 0)).toBe(0);
    expect(timingOffset(state, generative, 'kick', 1)).toBeGreaterThan(0);
  });

  it('chooses a bass sample and a positive playback rate', () => {
    const { generative, store } = setup();
    const voice = bassVoice(store.getState(), generative, 4, 0);

    expect(voice.sampleIndex).toBeGreaterThanOrEqual(0);
    expect(voice.sampleIndex).toBeLessThan(6);
    expect(voice.playbackRate).toBeGreaterThan(0);
  });

  it('builds a four-note pad chord', () => {
    const { generative, store } = setup();
    const chord = padChord(store.getState(), generative, 0);

    expect(chord.notes).toHaveLength(4);
  });

  it('produces lead notes and rests', () => {
    const { generative, store } = setup();
    const results = Array.from({ length: 8 }, (_, counter) =>
      leadNote(store.getState(), generative, counter + 1, 0)
    );

    expect(results.every(note => note === null || typeof note === 'string')).toBe(true);
    expect(results.some(note => typeof note === 'string')).toBe(true);

    const resting = Object.assign(new FakeGenerative(), {
      hash01: (_seed: number, _key: string, _step: number, salt: number) =>
        salt === 7 ? 0 : 0.9
    });
    expect(leadNote(store.getState(), resting, 1, 0)).toBeNull();
  });

  it('returns a positive drone playback rate', () => {
    const { generative, store } = setup();
    expect(dronePlaybackRate(store.getState(), generative, 1)).toBeGreaterThan(0);
  });
});
