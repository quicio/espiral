export type PluginKind = 'effect' | 'instrument';
export type PluginParamUnit = 'db' | 'hz' | 'ms' | 's' | '%' | 'q' | 'ratio' | 'none';
export type PluginParamCurve = 'linear' | 'log';

export interface PluginParam {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
  readonly unit?: PluginParamUnit;
  readonly curve?: PluginParamCurve;
  readonly smoothing?: number;
  readonly step?: number;
}

export interface PluginDefinition {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly kind: PluginKind;
  readonly params: readonly PluginParam[];
  readonly latencySamples?: number;
}

export type PluginState = Readonly<Record<string, number>>;

export function defaultPluginState(definition: PluginDefinition): Record<string, number> {
  const state: Record<string, number> = {};
  definition.params.forEach(param => {
    state[param.id] = clampPluginParam(param, param.defaultValue);
  });
  return state;
}

export function clampPluginParam(param: PluginParam, value: number): number {
  return Math.max(param.min, Math.min(param.max, value));
}

export function normalizePluginParam(param: PluginParam, value: number): number {
  const clamped = clampPluginParam(param, value);

  if (param.curve === 'log' && param.min > 0 && param.max > param.min) {
    return Math.log(clamped / param.min) / Math.log(param.max / param.min);
  }

  if (param.max === param.min) return 0;
  return (clamped - param.min) / (param.max - param.min);
}

export function denormalizePluginParam(param: PluginParam, normalized: number): number {
  const amount = Math.max(0, Math.min(1, normalized));

  if (param.curve === 'log' && param.min > 0 && param.max > param.min) {
    return param.min * Math.pow(param.max / param.min, amount);
  }

  return param.min + (param.max - param.min) * amount;
}
