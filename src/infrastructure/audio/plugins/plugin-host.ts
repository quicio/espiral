import type { InsertConfig } from '../../../domain/graph';
import {
  clampPluginParam,
  defaultPluginState,
  type PluginDefinition
} from '../../../domain/plugin';
import type { PluginFactory, PluginInstance } from './types';

export class PluginHost {
  private readonly factories = new Map<string, PluginFactory>();

  register(factory: PluginFactory): this {
    const id = factory.definition.id;
    if (this.factories.has(id)) throw new Error(`Plugin duplicado: ${id}`);
    this.factories.set(id, factory);
    return this;
  }

  list(): readonly PluginDefinition[] {
    return Array.from(this.factories.values(), factory => factory.definition);
  }

  getDefinition(id: string): PluginDefinition | undefined {
    return this.factories.get(id)?.definition;
  }

  getLatencySamples(id: string): number {
    return Math.max(0, this.factories.get(id)?.definition.latencySamples ?? 0);
  }

  async load(id: string): Promise<void> {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Plugin desconocido: ${id}`);
    await factory.load?.();
  }

  create(config: InsertConfig): PluginInstance {
    const factory = this.factories.get(config.pluginId);
    if (!factory) throw new Error(`Plugin desconocido: ${config.pluginId}`);

    const instance = factory.create(config);
    const state = { ...defaultPluginState(factory.definition), ...config.params };

    factory.definition.params.forEach(param => {
      const raw = state[param.id] ?? param.defaultValue;
      instance.setParam(param.id, clampPluginParam(param, raw));
    });

    return instance;
  }
}
