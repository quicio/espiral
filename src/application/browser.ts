import { soundPreset } from '../domain/sound-bank';
import type { StatusPort } from '../domain/ports';
import type { Store } from './store';

export const MAX_RECENT_SOUNDS = 8;

export class BrowserService {
  constructor(
    private readonly store: Store,
    private readonly status: StatusPort
  ) {}

  toggleFavorite(presetId: string): void {
    const preset = soundPreset(presetId);
    if (!preset) return;
    const state = this.store.getState();
    const favorite = state.favorites.includes(presetId);
    const favorites = favorite
      ? state.favorites.filter(id => id !== presetId)
      : [...state.favorites, presetId];
    this.store.update(current => ({ ...current, favorites }));
    this.status.generative(
      favorite
        ? `${preset.name} fuera de favoritos.`
        : `${preset.name} en favoritos.`
    );
  }

  recordPlayed(presetId: string): void {
    const preset = soundPreset(presetId);
    if (!preset) return;
    const state = this.store.getState();
    const recentSounds = [
      presetId,
      ...state.recentSounds.filter(id => id !== presetId)
    ].slice(0, MAX_RECENT_SOUNDS);
    this.store.update(current => ({ ...current, recentSounds }));
  }

  clearRecent(): void {
    this.store.update(current => ({ ...current, recentSounds: [] }));
    this.status.generative('Recientes del browser vaciados.');
  }
}
