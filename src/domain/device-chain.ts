import type { InsertConfig } from './graph';

export interface DeviceChainPreset {
  readonly id: string;
  readonly name: string;
  readonly inserts: readonly InsertConfig[];
}

export function cloneInsertChain(
  inserts: readonly InsertConfig[]
): readonly InsertConfig[] {
  return inserts.map(insert => ({
    ...insert,
    params: { ...insert.params }
  }));
}
