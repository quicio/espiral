import { describe, expect, it } from 'vitest';
import { DeviceChainService } from './device-chains';
import { createInitialState } from './initial-state';
import { MixService } from './mix';
import { Store } from './store';
import type { DeviceChainPreset } from '../domain/device-chain';
import type { DeviceChainPresetRepositoryPort } from '../domain/ports';
import { FakeAudioEngine, FakeGenerative, FakeStatus } from '../test/fakes';

class MemoryChainRepository implements DeviceChainPresetRepositoryPort {
  presets: readonly DeviceChainPreset[] = [];

  list(): readonly DeviceChainPreset[] {
    return this.presets;
  }

  save(preset: DeviceChainPreset): void {
    this.presets = [
      ...this.presets.filter(entry => entry.id !== preset.id),
      preset
    ];
  }

  remove(id: string): void {
    this.presets = this.presets.filter(entry => entry.id !== id);
  }
}

function setup() {
  const store = new Store(createInitialState(new FakeGenerative()));
  const engine = new FakeAudioEngine();
  const mix = new MixService(store, engine);
  const repository = new MemoryChainRepository();
  const status = new FakeStatus();
  const chains = new DeviceChainService(store, mix, repository, status);
  return { store, engine, mix, repository, status, chains };
}

describe('DeviceChainService', () => {
  it('saves the selected track chain and reuses the name', () => {
    const { store, mix, chains } = setup();
    mix.addInsert('kick', 'filter');

    const first = chains.saveCurrent('Batería seca');
    const second = chains.saveCurrent('batería seca');

    expect(chains.list()).toHaveLength(1);
    expect(second?.id).toBe(first?.id);
    expect(store.getState().kit.tracks.kick?.inserts).toHaveLength(1);
    expect(chains.list()[0]?.inserts[0]?.pluginId).toBe('filter');
  });

  it('rejects saving an empty rack', () => {
    const { chains, status } = setup();

    const preset = chains.saveCurrent('Vacía');

    expect(preset).toBeNull();
    expect(chains.list()).toHaveLength(0);
    expect(status.messages.at(-1)).toContain('rack está vacío');
  });

  it('applies a saved chain to the selected track', () => {
    const { store, mix, chains } = setup();
    mix.addInsert('kick', 'filter');
    const preset = chains.saveCurrent('Cadena')!;
    store.update(state => ({ ...state, selected: 'bass' }));

    expect(chains.apply(preset.id)).toBe(true);

    const inserts = store.getState().kit.tracks.bass?.inserts ?? [];
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.pluginId).toBe('filter');
    expect(inserts[0]?.id).toBe('filter');
  });

  it('removes a saved chain', () => {
    const { mix, chains } = setup();
    mix.addInsert('kick', 'filter');
    const preset = chains.saveCurrent('Cadena')!;

    chains.remove(preset.id);

    expect(chains.list()).toHaveLength(0);
  });
});
