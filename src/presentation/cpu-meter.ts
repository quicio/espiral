const FRAME_BUDGET_MS = 1000 / 60;

export type CpuSeverity = 'normal' | 'warning' | 'critical';

export function cpuSeverity(load: number): CpuSeverity {
  if (load >= 0.85) return 'critical';
  if (load >= 0.6) return 'warning';
  return 'normal';
}

export class CpuMeter {
  private last: number | null = null;
  private smoothed = 0;

  sample(
    now: number,
    audio?: {
      readonly underruns: number;
      readonly underrunDuration: number;
      readonly totalDuration: number;
    } | null
  ): number {
    if (this.last === null) {
      this.last = now;
      return 0;
    }

    const delta = Math.max(0, now - this.last);
    this.last = now;
    const frameLoad = Math.max(
      0,
      Math.min(1, (delta - FRAME_BUDGET_MS) / FRAME_BUDGET_MS)
    );
    const underrunLoad =
      audio && audio.totalDuration > 0
        ? Math.max(0, Math.min(1, audio.underrunDuration / audio.totalDuration))
        : 0;
    const load = Math.max(frameLoad, underrunLoad);
    this.smoothed = this.smoothed * 0.85 + load * 0.15;
    return this.smoothed;
  }

  reset(): void {
    this.last = null;
    this.smoothed = 0;
  }
}
