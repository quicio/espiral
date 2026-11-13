import { soundPreset, type SoundPreset } from '../domain/sound-bank';
import type { HarmonyState } from '../domain/models';
import type { GenerativePort, AudioEnginePort, StatusPort } from '../domain/ports';
import type { Store } from './store';

export const MAX_RECENT_SOUNDS = 8;

export class BrowserService {
  constructor(
    private readonly store: Store,
    private readonly engine: AudioEnginePort,
    private readonly generative: GenerativePort,
    private readonly status: StatusPort
  ) {}

  preview(presetId: string): void {
    const preset = soundPreset(presetId);
    if (!preset) return;
    const state = this.store.getState();
    this.engine.previewMachine(
      preset.machine,
      previewNotes(preset, state.harmony, this.generative)
    );
    this.status.generative(`Preview: ${preset.name}.`);
  }

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

function previewNotes(
  preset: SoundPreset,
  harmony: HarmonyState,
  generative: GenerativePort
): readonly string[] {
  const source = preset.noteSource;
  if (source.kind === 'fixed') return [source.note];
  if (source.kind === 'scale-degree') {
    return [
      generative.midiToNote(
        generative.scaleDegreeMidi(
          harmony.root,
          harmony.scale,
          source.degree,
          source.octave
        )
      )
    ];
  }
  return generative.chordNotes(
    harmony.root,
    harmony.scale,
    source.degreeOffset,
    source.octave,
    Math.max(1, source.size)
  );
}
