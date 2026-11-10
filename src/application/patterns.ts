import { PATTERN_LENGTH, type PatternChannel } from '../domain/channels';
import type {
  GenerativeParams,
  InstrumentState,
  ProgressionId,
  ScaleId
} from '../domain/models';
import {
  normalizeStep,
  type Pattern,
  type PatternSteps
} from '../domain/pattern';
import type { GenerativePort, PatternEvolver, StatusPort } from '../domain/ports';
import type { PlaybackRuntime } from './runtime';
import type { Store } from './store';

const HISTORY_LIMIT = 40;
const PARAM_KEYS: readonly (keyof GenerativeParams)[] = [
  'density',
  'complexity',
  'variation',
  'stability',
  'randomness'
];

export class PatternService implements PatternEvolver {
  constructor(
    private readonly store: Store,
    private readonly generative: GenerativePort,
    private readonly status: StatusPort,
    private readonly runtime: PlaybackRuntime
  ) {}

  toggleStep(channel: string, index: number): void {
    if (index < 0 || index >= PATTERN_LENGTH) return;
    const state = this.store.getState();
    const pattern = state.pattern.steps[channel];
    if (!pattern) {
      this.status.generative('El track es generativo. Agregá un patrón para editarlo.');
      return;
    }
    const next = pattern.slice();
    next[index] = next[index] ? 0 : 1;
    this.store.update(current => ({
      ...current,
      pattern: {
        ...current.pattern,
        steps: { ...current.pattern.steps, [channel]: next }
      },
      history: pushHistory(current)
    }));
  }

  mutateSelected(): void {
    const state = this.store.getState();
    const pattern = this.selectedPattern(state);
    if (!pattern) return;
    if (state.pattern.frozen[state.selected]) {
      this.status.generative(`${trackName(state, state.selected)} está congelado.`);
      return;
    }
    const mutationCount = state.mutationCount + 1;
    const mutated = this.generative.mutatePattern(
      pattern,
      state.params,
      state.seed + mutationCount,
      state.selected
    );
    this.commitSelected(state.selected, mutated, { mutationCount }, 'Patrón mutado.');
  }

  densifySelected(): void {
    const state = this.store.getState();
    const pattern = this.selectedPattern(state);
    if (!pattern) return;
    if (state.pattern.frozen[state.selected]) {
      this.status.generative(`${trackName(state, state.selected)} está congelado.`);
      return;
    }
    const mutationCount = state.mutationCount + 1;
    const dense = this.generative.fillPattern(
      pattern,
      state.params,
      state.seed + state.mutationCount,
      state.selected
    );
    this.commitSelected(
      state.selected,
      dense,
      { mutationCount },
      `Densidad aumentada en ${trackName(state, state.selected)}.`
    );
  }

  thinSelected(): void {
    const state = this.store.getState();
    const pattern = this.selectedPattern(state);
    if (!pattern) return;
    if (state.pattern.frozen[state.selected]) {
      this.status.generative(`${trackName(state, state.selected)} está congelado.`);
      return;
    }
    const mutationCount = state.mutationCount + 1;
    const thin = this.generative.thinPattern(
      pattern,
      state.params,
      state.seed + state.mutationCount,
      state.selected
    );
    this.commitSelected(
      state.selected,
      thin,
      { mutationCount },
      `Densidad reducida en ${trackName(state, state.selected)}.`
    );
  }

  rotateSelected(): void {
    const state = this.store.getState();
    const pattern = this.selectedPattern(state);
    if (!pattern) return;
    if (state.pattern.frozen[state.selected]) {
      this.status.generative(`${trackName(state, state.selected)} está congelado.`);
      return;
    }
    const rotated = this.generative.rotatePattern(pattern, 1);
    this.commitSelected(state.selected, rotated, {}, 'Patrón girado.');
  }

  copySelected(): void {
    const state = this.store.getState();
    const pattern = this.selectedPattern(state);
    if (!pattern) return;
    this.store.update(current => ({
      ...current,
      clipboard: pattern
    }));
    this.status.generative(`Patrón de ${trackName(state, state.selected)} copiado.`);
  }

  pasteSelected(): void {
    const state = this.store.getState();
    if (!state.clipboard) return;
    if (!this.selectedPattern(state)) return;
    if (state.pattern.frozen[state.selected]) {
      this.status.generative(`${trackName(state, state.selected)} está congelado.`);
      return;
    }
    this.commitSelected(
      state.selected,
      state.clipboard,
      {},
      `Patrón pegado en ${trackName(state, state.selected)}.`
    );
  }

  undo(): void {
    const state = this.store.getState();
    const previous = state.history[state.history.length - 1];
    if (!previous) return;
    this.store.update(current => ({
      ...current,
      pattern: { ...current.pattern, steps: previous },
      history: current.history.slice(0, -1)
    }));
    this.status.generative('Patrón restaurado.');
  }

  applyEuclid(): void {
    const state = this.store.getState();
    if (!this.selectedPattern(state)) return;
    if (state.pattern.frozen[state.selected]) {
      this.status.generative(`${trackName(state, state.selected)} está congelado.`);
      return;
    }
    const pattern = this.generative.euclidean(
      PATTERN_LENGTH,
      state.pattern.pulses[state.selected] ?? 4,
      this.generative.channelSeeds[state.selected as PatternChannel]?.offset ?? 0
    );
    this.commitSelected(
      state.selected,
      pattern,
      {},
      `Euclid aplicado a ${trackName(state, state.selected)}.`
    );
  }

  generateAll(seed = this.store.getState().seed): void {
    const state = this.store.getState();
    const steps: PatternSteps = { ...state.pattern.steps };
    let changed = false;

    Object.keys(steps).forEach(key => {
      const track = state.kit.tracks[key];
      if (!track || track.role === 'user') return;
      if (state.pattern.frozen[key]) return;
      steps[key] = this.generative.generatePattern(
        key as PatternChannel,
        state.params,
        state.pattern.pulses[key] ?? 4,
        seed
      );
      changed = true;
    });

    if (!changed && seed === state.seed) return;

    this.store.update(current => ({
      ...current,
      seed,
      pattern: changed ? { ...current.pattern, steps } : current.pattern,
      history: changed ? pushHistory(current) : current.history
    }));
    this.status.generative(`Patrones generados · semilla ${seed}.`);
  }

  evolve(): void {
    const state = this.store.getState();
    if (!state.evolve || !state.transport.playing) return;

    const evolveCount = state.evolveCount + 1;
    const params = { ...state.params, variation: state.params.variation * 0.55 };
    const steps: PatternSteps = { ...state.pattern.steps };

    Object.keys(steps).forEach(key => {
      const track = state.kit.tracks[key];
      if (!track || track.role === 'user') return;
      if (state.pattern.frozen[key]) return;
      steps[key] = this.generative.mutatePattern(
        state.pattern.steps[key] ?? [],
        params,
        state.seed + evolveCount * 37,
        key as PatternChannel
      );
    });

    this.store.update(current => ({
      ...current,
      evolveCount,
      pattern: { ...current.pattern, steps },
      history: pushHistory(current)
    }));
    this.status.generative(`Evolución ${evolveCount}.`);
  }

  toggleFreeze(channel: string = this.store.getState().selected): void {
    const state = this.store.getState();
    if (state.pattern.steps[channel] === undefined) {
      this.status.generative('El track es generativo. Agregá un patrón para congelarlo.');
      return;
    }
    const frozen = !state.pattern.frozen[channel];
    this.store.update(current => ({
      ...current,
      pattern: {
        ...current.pattern,
        frozen: { ...current.pattern.frozen, [channel]: frozen }
      }
    }));
    this.status.generative(`${trackName(this.store.getState(), channel)} ${frozen ? 'congelado' : 'libre'}.`);
  }

  setEvolve(evolve: boolean): void {
    this.store.update(state => ({ ...state, evolve }));
    this.status.generative(
      evolve ? 'Evolución activa: cada 2 compases.' : 'Evolución detenida.'
    );
  }

  newSeed(): void {
    const seed = Math.floor(Math.random() * 10000);
    this.generateAll(seed);
  }

  selectChannel(channel: string): void {
    if (this.store.getState().kit.tracks[channel] === undefined) return;
    this.store.update(state => ({ ...state, selected: channel }));
  }

  setPulses(value: number): void {
    const state = this.store.getState();
    if (state.pattern.steps[state.selected] === undefined) return;
    const pulses = clamp(Math.round(value), 1, PATTERN_LENGTH);
    this.store.update(current => ({
      ...current,
      pattern: {
        ...current.pattern,
        pulses: { ...current.pattern.pulses, [state.selected]: pulses }
      }
    }));
  }

  setStepVelocity(trackId: string, step: number, value: number): void {
    this.setStepValue('velocity', trackId, step, clamp(value, 0, 1));
  }

  setStepProbability(trackId: string, step: number, value: number): void {
    this.setStepValue('probability', trackId, step, clamp(value, 0, 1));
  }

  setStepRatchets(trackId: string, step: number, value: number): void {
    this.setStepValue(
      'ratchets',
      trackId,
      step,
      clamp(Math.round(value), 1, 4)
    );
  }

  private setStepValue(
    field: 'velocity' | 'probability' | 'ratchets',
    trackId: string,
    step: number,
    value: number
  ): void {
    const index = normalizeStep(step);
    this.store.update(current => {
      const values = current.pattern[field][trackId];
      if (!values) return current;
      const next = [...values];
      next[index] = value;
      return {
        ...current,
        pattern: {
          ...current.pattern,
          [field]: { ...current.pattern[field], [trackId]: next }
        }
      };
    });
  }

  setParam(key: keyof GenerativeParams, value: number): void {
    if (!PARAM_KEYS.includes(key)) return;
    this.store.update(state => ({
      ...state,
      params: { ...state.params, [key]: clamp(value, 0, 1) }
    }));
  }

  setRoot(root: number): void {
    if (!Number.isInteger(root) || root < 0 || root >= this.generative.roots.length) return;
    this.store.update(state => ({
      ...state,
      harmony: { ...state.harmony, root }
    }));
    this.runtime.resetHarmony();
    this.status.generative('Tonalidad actualizada.');
  }

  setScale(scale: ScaleId): void {
    if (!(scale in this.generative.scales)) return;
    this.store.update(state => ({
      ...state,
      harmony: { ...state.harmony, scale }
    }));
    this.runtime.resetHarmony();
    this.status.generative('Escala actualizada.');
  }

  setProgression(progression: ProgressionId): void {
    if (!(progression in this.generative.progressions)) return;
    this.store.update(state => ({
      ...state,
      harmony: { ...state.harmony, progression }
    }));
    this.runtime.resetHarmony();
    this.status.generative('Progresión actualizada.');
  }

  setSustain(sustain: number): void {
    this.store.update(state => ({
      ...state,
      harmony: { ...state.harmony, sustain: clamp(sustain, 0, 1) }
    }));
  }

  private selectedPattern(state: InstrumentState): Pattern | null {
    const pattern = state.pattern.steps[state.selected];
    if (!pattern) {
      this.status.generative(
        `${trackName(state, state.selected)} es generativo. Agregá un patrón para editarlo.`
      );
      return null;
    }
    return pattern;
  }

  private commitSelected(
    channel: string,
    pattern: Pattern,
    extras: Partial<Pick<InstrumentState, 'mutationCount'>>,
    message: string
  ): void {
    this.store.update(state => ({
      ...state,
      ...extras,
      pattern: {
        ...state.pattern,
        steps: { ...state.pattern.steps, [channel]: pattern }
      },
      history: pushHistory(state)
    }));
    this.status.generative(message);
  }
}

function pushHistory(state: InstrumentState): readonly PatternSteps[] {
  return [...state.history, state.pattern.steps].slice(-HISTORY_LIMIT);
}

function trackName(state: InstrumentState, id: string): string {
  return state.kit.tracks[id]?.name ?? id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
