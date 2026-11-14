export class StateVariableFilter {
  private ic1eq = 0;
  private ic2eq = 0;
  private a1 = 1;
  private a2 = 0;
  private a3 = 0;
  private refresh = 0;

  reset(): void {
    this.ic1eq = 0;
    this.ic2eq = 0;
    this.refresh = 0;
  }

  process(
    input: number,
    cutoff: number,
    resonance: number,
    sampleRate: number
  ): number {
    if (this.refresh <= 0) {
      const frequency = Math.max(
        20,
        Math.min(sampleRate * 0.45, cutoff)
      );
      const q = Math.max(0.5, Math.min(20, resonance));
      const g = Math.tan((Math.PI * frequency) / sampleRate);
      const k = 1 / q;
      this.a1 = 1 / (1 + g * (g + k));
      this.a2 = g * this.a1;
      this.a3 = g * this.a2;
      this.refresh = 8;
    }
    this.refresh -= 1;

    const v3 = input - this.ic2eq;
    const v1 = this.a1 * this.ic1eq + this.a2 * v3;
    const v2 = this.ic2eq + this.a2 * this.ic1eq + this.a3 * v3;

    this.ic1eq = 2 * v1 - this.ic1eq;
    this.ic2eq = 2 * v2 - this.ic2eq;

    return v2;
  }
}
