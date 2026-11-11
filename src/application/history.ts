import type { InstrumentState } from '../domain/models';
import type { Store } from './store';

const HISTORY_LIMIT = 50;

export class HistoryService {
  private readonly undoStack: InstrumentState[] = [];
  private readonly redoStack: InstrumentState[] = [];
  private lastState: InstrumentState;
  private lastRecordedAt = 0;
  private applying = false;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly store: Store,
    private readonly coalesceMs = 250,
    private readonly now: () => number = Date.now
  ) {
    this.lastState = store.getState();
    this.unsubscribe = store.subscribe(state => this.handleState(state));
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    if (this.applying || this.undoStack.length === 0) return false;
    const current = this.store.getState();
    const target = this.undoStack.pop();
    if (!target) return false;
    this.redoStack.push(current);
    this.apply(target, current);
    return true;
  }

  redo(): boolean {
    if (this.applying || this.redoStack.length === 0) return false;
    const current = this.store.getState();
    const target = this.redoStack.pop();
    if (!target) return false;
    this.undoStack.push(current);
    this.apply(target, current);
    return true;
  }

  dispose(): void {
    this.unsubscribe();
  }

  private handleState(state: InstrumentState): void {
    if (this.applying) {
      this.lastState = state;
      return;
    }
    if (isEphemeralChange(this.lastState, state)) {
      this.lastState = state;
      return;
    }

    const now = this.now();
    const coalesce = now - this.lastRecordedAt < this.coalesceMs;
    if (!coalesce || this.undoStack.length === 0) {
      this.undoStack.push(this.lastState);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.lastRecordedAt = now;
    this.lastState = state;
  }

  private apply(target: InstrumentState, current: InstrumentState): void {
    this.applying = true;
    try {
      const transport = {
        ...target.transport,
        playing: current.transport.playing,
        preparing: current.transport.preparing,
        currentStep: current.transport.currentStep
      };
      this.store.update(() => ({ ...target, transport }));
    } finally {
      this.applying = false;
      this.lastState = this.store.getState();
      this.lastRecordedAt = 0;
    }
  }
}

function isEphemeralChange(
  previous: InstrumentState,
  next: InstrumentState
): boolean {
  if (previous.transport === next.transport) return false;

  if (
    previous.transport.bpm !== next.transport.bpm ||
    previous.transport.swing !== next.transport.swing ||
    previous.transport.humanize !== next.transport.humanize ||
    previous.transport.lookAhead !== next.transport.lookAhead
  ) {
    return false;
  }

  return Object.entries(previous).every(([key, value]) => {
    if (key === 'transport') return true;
    return (next as unknown as Record<string, unknown>)[key] === value;
  });
}
