import type { InsertConfig } from '../../../../domain/graph';
import { BitcrusherEffect } from './bitcrusher-effect';
import { CompressorEffect } from './compressor-effect';
import { DelayEffect } from './delay-effect';
import { DriveEffect } from './drive-effect';
import { Eq3Effect } from './eq3-effect';
import { FilterEffect } from './filter-effect';
import { ReverbEffect } from './reverb-effect';
import { TremoloEffect } from './tremolo-effect';
import type { CoreEffect, StereoFrame } from './effect';
import type { CoreQualityMode } from '../types';

function createEffect(
  insert: InsertConfig,
  sampleRate: number
): CoreEffect | null {
  switch (insert.pluginId) {
    case 'delay':
      return new DelayEffect(sampleRate, insert.params);
    case 'reverb':
      return new ReverbEffect(sampleRate, insert.params);
    case 'compressor':
      return new CompressorEffect(sampleRate, insert.params);
    case 'drive':
      return new DriveEffect(sampleRate, insert.params);
    case 'filter':
      return new FilterEffect(sampleRate, insert.params);
    case 'eq3':
      return new Eq3Effect(sampleRate, insert.params);
    case 'tremolo':
      return new TremoloEffect(sampleRate, insert.params);
    case 'bitcrusher':
      return new BitcrusherEffect(insert.params);
    default:
      return null;
  }
}

function isExpensive(pluginId: string): boolean {
  return pluginId === 'reverb' || pluginId === 'delay';
}

interface Entry {
  readonly effect: CoreEffect;
  readonly pluginId: string;
}

export class InsertChain {
  private readonly effects: readonly Entry[];
  private readonly byId = new Map<string, CoreEffect>();
  private quality: CoreQualityMode = 'full';

  constructor(inserts: readonly InsertConfig[], sampleRate: number) {
    const effects: Entry[] = [];
    inserts
      .filter(insert => !insert.bypass)
      .forEach(insert => {
        const effect = createEffect(insert, sampleRate);
        if (!effect) return;
        effects.push({ effect, pluginId: insert.pluginId });
        this.byId.set(insert.id, effect);
      });
    this.effects = effects;
  }

  setParam(insertId: string, param: string, value: number): void {
    this.byId.get(insertId)?.setParam?.(param, value);
  }

  setQuality(mode: CoreQualityMode): void {
    if (mode === this.quality) return;
    this.quality = mode;
    if (mode === 'eco') {
      this.effects.forEach(entry => {
        if (isExpensive(entry.pluginId)) entry.effect.reset();
      });
    }
  }

  process(frame: StereoFrame): void {
    for (const entry of this.effects) {
      if (this.quality === 'eco' && isExpensive(entry.pluginId)) continue;
      entry.effect.process(frame);
    }
  }

  reset(): void {
    this.effects.forEach(entry => entry.effect.reset());
  }
}
