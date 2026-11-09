import type { InstrumentState } from '../domain/models';

export type StateListener = (state: InstrumentState) => void;

export class Store {
  private state: InstrumentState;
  private readonly listeners = new Set<StateListener>();

  constructor(initial: InstrumentState) {
    this.state = initial;
  }

  getState(): InstrumentState {
    return this.state;
  }

  update(updater: (state: InstrumentState) => InstrumentState): void {
    const next = updater(this.state);
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener(this.state);
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
