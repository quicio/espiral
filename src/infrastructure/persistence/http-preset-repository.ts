import type { PresetRepositoryPort, PresetSummary } from '../../domain/ports';

const PRESETS: readonly (PresetSummary & { readonly file: string })[] = [
  { id: 'techno', name: 'Techno', file: './presets/techno.json' },
  { id: 'dub', name: 'Dub', file: './presets/dub.json' },
  { id: 'ambient', name: 'Ambient', file: './presets/ambient.json' },
  { id: 'breaks', name: 'Breaks', file: './presets/breaks.json' },
  { id: 'house', name: 'House', file: './presets/house.json' },
  { id: 'trance', name: 'Trance', file: './presets/trance.json' },
  { id: 'psytrance', name: 'Psytrance', file: './presets/psytrance.json' },
  { id: 'triphop', name: 'Trip-Hop', file: './presets/triphop.json' }
];

export class HttpPresetRepository implements PresetRepositoryPort {
  list(): readonly PresetSummary[] {
    return PRESETS.map(({ id, name }) => ({ id, name }));
  }

  async load(id: string): Promise<unknown> {
    const preset = PRESETS.find(entry => entry.id === id);
    if (!preset) throw new Error(`Preset desconocido: ${id}`);

    const response = await fetch(preset.file);
    if (!response.ok) throw new Error(`No se pudo cargar el preset: ${response.statusText}`);
    return (await response.json()) as unknown;
  }
}
