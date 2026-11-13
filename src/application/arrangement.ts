import type { ArrangementState } from '../domain/models';
import type { SceneId } from '../domain/models';
import type { StatusPort } from '../domain/ports';
import type { SceneService } from './scenes';
import type { Store } from './store';

const BAR_STEPS = 16;
const DEFAULT_BARS = 4;

export class ArrangementService {
  constructor(
    private readonly store: Store,
    private readonly scenes: SceneService,
    private readonly status: StatusPort
  ) {}

  toggle(): void {
    const state = this.store.getState();
    const enabled = !state.arrangement.enabled;
    const start = state.arrangement.loop
      ? clamp(state.arrangement.loopStart, 0, Math.max(0, state.arrangement.blocks.length - 1))
      : 0;
    this.update({
      ...state.arrangement,
      enabled,
      blockIndex: enabled ? start : state.arrangement.blockIndex,
      bar: 0
    });
    if (enabled) {
      const first = state.arrangement.blocks[start];
      if (first && first.sceneId !== state.scene) {
        this.scenes.apply(first.sceneId);
      }
    }
    this.status.generative(
      enabled ? 'Arrangement activo.' : 'Arrangement detenido.'
    );
  }

  setLoop(enabled: boolean): void {
    const state = this.store.getState();
    const total = state.arrangement.blocks.length;
    const loopStart = clamp(
      state.arrangement.loopStart,
      0,
      Math.max(0, total - 1)
    );
    const loopEnd =
      total === 0
        ? 0
        : clamp(state.arrangement.loopEnd, loopStart + 1, total);
    this.update({
      ...state.arrangement,
      loop: enabled,
      loopStart,
      loopEnd
    });
    this.status.generative(enabled ? 'Loop activo.' : 'Loop desactivado.');
  }

  setLoopRange(start: number, end: number): void {
    const state = this.store.getState();
    const total = state.arrangement.blocks.length;
    if (total === 0) {
      this.update({ ...state.arrangement, loopStart: 0, loopEnd: 0 });
      return;
    }
    const loopStart = clamp(Math.round(start), 0, total - 1);
    const loopEnd = clamp(Math.round(end), loopStart + 1, total);
    this.update({ ...state.arrangement, loopStart, loopEnd });
  }

  addBlock(sceneId: SceneId): void {
    const state = this.store.getState();
    const id = `block-${Date.now().toString(36)}-${state.arrangement.blocks.length}`;
    const wasFullLoop =
      state.arrangement.loopEnd >= state.arrangement.blocks.length;
    this.update({
      ...state.arrangement,
      blocks: [
        ...state.arrangement.blocks,
        { id, sceneId, bars: DEFAULT_BARS }
      ],
      loopEnd: wasFullLoop
        ? state.arrangement.blocks.length + 1
        : state.arrangement.loopEnd
    });
    this.status.generative('Bloque agregado al arrangement.');
  }

  removeBlock(id: string): void {
    const state = this.store.getState();
    const blocks = state.arrangement.blocks.filter(block => block.id !== id);
    if (blocks.length === 0) return;
    const loopStart = clamp(state.arrangement.loopStart, 0, blocks.length - 1);
    const loopEnd = clamp(
      state.arrangement.loopEnd,
      loopStart + 1,
      blocks.length
    );
    this.update({
      ...state.arrangement,
      blocks,
      blockIndex: Math.min(state.arrangement.blockIndex, blocks.length - 1),
      loopStart,
      loopEnd
    });
    this.status.generative('Bloque eliminado.');
  }

  moveBlock(id: string, offset: number): void {
    const state = this.store.getState();
    const blocks = [...state.arrangement.blocks];
    const index = blocks.findIndex(block => block.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    const [block] = blocks.splice(index, 1);
    if (!block) return;
    blocks.splice(target, 0, block);
    this.update({ ...state.arrangement, blocks, blockIndex: target });
  }

  setBars(id: string, bars: number): void {
    const state = this.store.getState();
    this.update({
      ...state.arrangement,
      blocks: state.arrangement.blocks.map(block =>
        block.id === id
          ? { ...block, bars: Math.max(1, Math.min(64, Math.round(bars))) }
          : block
      )
    });
  }

  reset(): void {
    const state = this.store.getState();
    const start = state.arrangement.loop
      ? clamp(
          state.arrangement.loopStart,
          0,
          Math.max(0, state.arrangement.blocks.length - 1)
        )
      : 0;
    this.update({ ...state.arrangement, blockIndex: start, bar: 0 });
    const first = state.arrangement.blocks[start];
    if (state.arrangement.enabled && first) this.scenes.apply(first.sceneId);
  }

  onStep(stepCount: number): void {
    const state = this.store.getState();
    const arrangement = state.arrangement;
    if (!arrangement.enabled || arrangement.blocks.length === 0) return;
    if (stepCount <= 0 || stepCount % BAR_STEPS !== 0) return;

    const block = arrangement.blocks[arrangement.blockIndex];
    if (!block) return;
    const bar = arrangement.bar + 1;

    if (bar < block.bars) {
      this.update({ ...arrangement, bar });
      return;
    }

    const total = arrangement.blocks.length;
    let blockIndex = (arrangement.blockIndex + 1) % total;
    if (arrangement.loop) {
      const start = clamp(arrangement.loopStart, 0, total - 1);
      const end = clamp(arrangement.loopEnd, start + 1, total);
      if (blockIndex < start || blockIndex >= end) {
        blockIndex = start;
      }
    }
    const next = arrangement.blocks[blockIndex];
    this.update({ ...arrangement, blockIndex, bar: 0 });
    if (next) {
      this.scenes.apply(next.sceneId);
      this.status.generative(`Arrangement · ${next.sceneId}.`);
    }
  }

  private update(arrangement: ArrangementState): void {
    this.store.update(state => ({ ...state, arrangement }));
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
