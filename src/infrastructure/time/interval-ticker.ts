import type { TickerPort } from '../../domain/ports';

export class IntervalTicker implements TickerPort {
  start(callback: () => void, intervalMs: number): () => void {
    const id = globalThis.setInterval(callback, intervalMs);
    return () => globalThis.clearInterval(id);
  }
}
