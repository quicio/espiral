import { describe, expect, it } from 'vitest';
import { BrowserService, MAX_RECENT_SOUNDS } from './browser';
import { createInitialState } from './initial-state';
import { Store } from './store';
import { SOUND_BANK, soundPreset } from '../domain/sound-bank';
import { FakeAudioEngine, FakeGenerative, FakeStatus } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const engine = new FakeAudioEngine();
  const status = new FakeStatus();
  const browser = new BrowserService(store, engine, generative, status);
  return { store, status, browser, engine, generative };
}

describe('BrowserService', () => {
  it('previews a preset without changing the track or session', () => {
    const { store, browser, engine } = setup();
    const preset = soundPreset('warm-pad')!;
    const before = store.getState();

    browser.preview('warm-pad');

    expect(engine.previews).toHaveLength(1);
    expect(engine.previews[0]?.machine).toEqual(preset.machine);
    expect(engine.previews[0]?.notes.length).toBe(4);
    expect(store.getState()).toBe(before);
  });

  it('resolves fixed notes from the preset', () => {
    const { browser, engine } = setup();

    browser.preview('shaker-air');

    expect(engine.previews[0]?.notes).toEqual(['C4']);
  });

  it('toggles favorites on and off', () => {
    const { store, browser } = setup();

    browser.toggleFavorite('warm-pad');
    expect(store.getState().favorites).toEqual(['warm-pad']);

    browser.toggleFavorite('warm-pad');
    expect(store.getState().favorites).toEqual([]);
  });

  it('ignores unknown presets', () => {
    const { store, browser } = setup();

    browser.toggleFavorite('no-existe');
    browser.recordPlayed('no-existe');

    expect(store.getState().favorites).toEqual([]);
    expect(store.getState().recentSounds).toEqual([]);
  });

  it('records recent sounds newest first without duplicates', () => {
    const { store, browser } = setup();

    browser.recordPlayed('warm-pad');
    browser.recordPlayed('acid-bass');
    browser.recordPlayed('warm-pad');

    expect(store.getState().recentSounds).toEqual(['warm-pad', 'acid-bass']);
  });

  it('caps recents and clears them without touching favorites', () => {
    const { store, browser } = setup();
    store.update(state => ({ ...state, favorites: ['warm-pad'] }));

    SOUND_BANK.forEach(preset => browser.recordPlayed(preset.id));

    const state = store.getState();
    expect(state.recentSounds).toHaveLength(MAX_RECENT_SOUNDS);
    expect(state.recentSounds[0]).toBe(SOUND_BANK.at(-1)?.id);
    expect(state.favorites).toEqual(['warm-pad']);

    browser.clearRecent();
    expect(store.getState().recentSounds).toEqual([]);
    expect(store.getState().favorites).toEqual(['warm-pad']);
  });
});
