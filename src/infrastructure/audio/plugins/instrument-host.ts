import {
  clampPluginParam,
  defaultPluginState,
  type PluginDefinition,
  type PluginState
} from '../../../domain/plugin';
import type {
  InstrumentPluginFactory,
  InstrumentPluginInstance
} from './types';

export class InstrumentPluginHost {
  private readonly factories = new Map<string, InstrumentPluginFactory>();

  register(factory: InstrumentPluginFactory): this {
    const id = factory.definition.id;
    if (this.factories.has(id)) throw new Error(`Instrumento duplicado: ${id}`);
    this.factories.set(id, factory);
    return this;
  }

  list(): readonly PluginDefinition[] {
    return Array.from(this.factories.values(), factory => factory.definition);
  }

  getDefinition(id: string): PluginDefinition | undefined {
    return this.factories.get(id)?.definition;
  }

  async load(id: string): Promise<void> {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Instrumento desconocido: ${id}`);
    await factory.load?.();
  }

  create(pluginId: string, state: PluginState = {}): InstrumentPluginInstance {
    const factory = this.factories.get(pluginId);
    if (!factory) throw new Error(`Instrumento desconocido: ${pluginId}`);

    const next = { ...defaultPluginState(factory.definition), ...state };
    const instance = factory.create(next);
    factory.definition.params.forEach(param => {
      instance.setParam(
        param.id,
        clampPluginParam(param, next[param.id] ?? param.defaultValue)
      );
    });
    return instance;
  }
}
