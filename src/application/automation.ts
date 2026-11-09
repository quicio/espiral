import { AUTOMATION_TARGETS, type AutomationTargetId } from '../domain/automation';
import { normalizeStep } from '../domain/pattern';
import type { AudioEnginePort, StatusPort } from '../domain/ports';
import type { Store } from './store';

export class AutomationService {
  constructor(
    private readonly store: Store,
    private readonly engine: AudioEnginePort,
    private readonly status: StatusPort
  ) {}

  applyAt(step: number, time: number): void {
    const state = this.store.getState();
    if (!state.automation.enabled) return;

    const target = AUTOMATION_TARGETS[state.automation.target];
    const value = state.automation.values[normalizeStep(step)] ?? 0;
    this.engine.setEffectWet(target.channel, target.effect, value, time);
  }

  applyNow(step?: number): void {
    const state = this.store.getState();
    if (!state.automation.enabled) return;

    const target = AUTOMATION_TARGETS[state.automation.target];
    const index = normalizeStep(step ?? (state.transport.currentStep >= 0 ? state.transport.currentStep : 0));
    const value = state.automation.values[index] ?? 0;
    this.engine.setEffectWet(target.channel, target.effect, value);
  }

  setValue(index: number, value: number): void {
    const clamped = Math.max(0, Math.min(1, Math.round(value * 20) / 20));
    const current = this.store.getState();
    const values = current.automation.values.map((entry, position) =>
      position === index ? clamped : entry
    );
    this.store.update(state => ({
      ...state,
      automation: { ...state.automation, values }
    }));

    if (current.automation.enabled && current.transport.currentStep === index) {
      this.applyNow(index);
    }
  }

  toggle(): void {
    const enabled = !this.store.getState().automation.enabled;
    this.store.update(state => ({
      ...state,
      automation: { ...state.automation, enabled }
    }));
    if (enabled) this.applyNow();
    this.status.generative(enabled ? 'Automatización activa.' : 'Automatización apagada.');
  }

  setTarget(target: AutomationTargetId): void {
    this.store.update(state => ({
      ...state,
      automation: { ...state.automation, target }
    }));
    if (this.store.getState().automation.enabled) this.applyNow();
  }
}
