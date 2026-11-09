export type ModulationSourceKind = 'lfo' | 'macro' | 'step';
export type LfoShape = 'sine' | 'triangle' | 'square' | 'saw';

export interface ModulationSource {
  readonly id: string;
  readonly kind: ModulationSourceKind;
  readonly name: string;
  readonly shape?: LfoShape;
  readonly rate?: number;
  readonly value?: number;
}

export interface ModulationTarget {
  readonly trackId: string;
  readonly insertId: string;
  readonly paramId: string;
}

export interface ModulationRoute {
  readonly id: string;
  readonly sourceId: string;
  readonly target: ModulationTarget;
  readonly amount: number;
  readonly bipolar: boolean;
}

export interface ModulationState {
  readonly enabled: boolean;
  readonly sources: readonly ModulationSource[];
  readonly routes: readonly ModulationRoute[];
}

export function createDefaultModulation(): ModulationState {
  return {
    enabled: false,
    sources: [
      { id: 'lfo-1', kind: 'lfo', name: 'LFO 1', shape: 'sine', rate: 0.15 },
      { id: 'lfo-2', kind: 'lfo', name: 'LFO 2', shape: 'triangle', rate: 0.5 },
      { id: 'macro-1', kind: 'macro', name: 'Macro 1', value: 0.5 },
      { id: 'macro-2', kind: 'macro', name: 'Macro 2', value: 0.5 },
      { id: 'step', kind: 'step', name: 'Paso' }
    ],
    routes: []
  };
}

export function modulationSource(
  state: ModulationState,
  sourceId: string
): ModulationSource | undefined {
  return state.sources.find(source => source.id === sourceId);
}

export function modulationTargetKey(target: ModulationTarget): string {
  return `${target.trackId}:${target.insertId}:${target.paramId}`;
}

export function modulationSourceValue(
  source: ModulationSource | undefined,
  time: number,
  step: number
): number {
  if (!source) return 0;
  if (source.kind === 'macro') return clamp(source.value ?? 0.5, 0, 1);
  if (source.kind === 'step') {
    if (step < 0) return 0;
    return ((step % 16) / 15);
  }
  const rate = Math.max(0.001, source.rate ?? 0.25);
  const phase = wrap(rate * time);
  const value = waveform(source.shape ?? 'sine', phase);
  return (value + 1) / 2;
}

function waveform(shape: LfoShape, phase: number): number {
  if (shape === 'square') return phase < 0.5 ? 1 : -1;
  if (shape === 'saw') return phase * 2 - 1;
  if (shape === 'triangle') {
    const x = phase * 4;
    if (x < 1) return x;
    if (x < 3) return 2 - x;
    return x - 4;
  }
  return Math.sin(phase * Math.PI * 2);
}

function wrap(value: number): number {
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
