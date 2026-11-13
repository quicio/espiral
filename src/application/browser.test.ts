import { describe, expect, it } from 'vitest';
import { BrowserService, MAX_RECENT_SOUNDS } from './browser';
import { createInitialState } from './initial-state';
import { Store } from './store';
import { SOUND_BANK } from '../domain/sound-bank';
import { FakeGenerative, FakeStatus } from '../test/fakes';

function setup() {
  const store = new Store(createInitialState(new FakeGenerative()));
  const status = new FakeStatus();
  const browser = new BrowserService(store, status);
  return { store, status, browser };
}

describe('BrowserService', () => {
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
