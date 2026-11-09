import type { PresetRepositoryPort, PresetSummary } from '../../domain/ports';

const PRESETS: readonly (PresetSummary & { readonly file: string })[] = [
  { id: 'default', name: 'Techno Ambiental', file: './presets/default.json' },
  { id: 'minimal', name: 'Minimal', file: './presets/minimal.json' },
  { id: 'ambient', name: 'Ambient', file: './presets/ambient.json' }
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
