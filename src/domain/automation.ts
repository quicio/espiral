import type { AutomationTarget } from './audio';

export type AutomationTargetId = 'pad-reverb' | 'lead-delay' | 'hihat-reverb' | 'drone-delay';

export const AUTOMATION_TARGET_IDS = [
  'pad-reverb',
  'lead-delay',
  'hihat-reverb',
  'drone-delay'
] as const satisfies readonly AutomationTargetId[];

export const AUTOMATION_TARGETS: Record<AutomationTargetId, AutomationTarget> = {
  'pad-reverb': { channel: 'pad', effect: 'reverb' },
  'lead-delay': { channel: 'lead', effect: 'delay' },
  'hihat-reverb': { channel: 'hihat', effect: 'reverb' },
  'drone-delay': { channel: 'drone', effect: 'delay' }
};

export const DEFAULT_AUTOMATION_VALUES = [
  0.18, 0.22, 0.28, 0.38, 0.5, 0.62, 0.74, 0.82, 0.78, 0.68, 0.56, 0.44, 0.34, 0.27,
  0.22, 0.18
] as const;
