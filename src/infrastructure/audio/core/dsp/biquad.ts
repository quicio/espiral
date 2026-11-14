export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  reset(): void {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  setLowShelf(frequency: number, sampleRate: number, gainDb: number): void {
    const { cos, alpha, a } = shelfCoefficients(frequency, sampleRate, gainDb);
    const sqrtA = Math.sqrt(a);
    const a0 =
      a + 1 + (a - 1) * cos + 2 * sqrtA * alpha;
    this.b0 =
      (a * (a + 1 - (a - 1) * cos + 2 * sqrtA * alpha)) / a0;
    this.b1 = (2 * a * (a - 1 - (a + 1) * cos)) / a0;
    this.b2 =
      (a * (a + 1 - (a - 1) * cos - 2 * sqrtA * alpha)) / a0;
    this.a1 = (-2 * (a - 1 + (a + 1) * cos)) / a0;
    this.a2 =
      (a + 1 + (a - 1) * cos - 2 * sqrtA * alpha) / a0;
  }

  setHighShelf(frequency: number, sampleRate: number, gainDb: number): void {
    const { cos, alpha, a } = shelfCoefficients(frequency, sampleRate, gainDb);
    const sqrtA = Math.sqrt(a);
    const a0 =
      a + 1 - (a - 1) * cos + 2 * sqrtA * alpha;
    this.b0 =
      (a * (a + 1 + (a - 1) * cos + 2 * sqrtA * alpha)) / a0;
    this.b1 = (-2 * a * (a - 1 + (a + 1) * cos)) / a0;
    this.b2 =
      (a * (a + 1 + (a - 1) * cos - 2 * sqrtA * alpha)) / a0;
    this.a1 = (2 * (a - 1 - (a + 1) * cos)) / a0;
    this.a2 =
      (a + 1 - (a - 1) * cos - 2 * sqrtA * alpha) / a0;
  }

  setPeaking(
    frequency: number,
    sampleRate: number,
    q: number,
    gainDb: number
  ): void {
    const w0 = (2 * Math.PI * Math.max(20, frequency)) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * Math.max(0.1, q));
    const a = Math.pow(10, gainDb / 40);
    const a0 = 1 + alpha / a;
    this.b0 = (1 + alpha * a) / a0;
    this.b1 = (-2 * cos) / a0;
    this.b2 = (1 - alpha * a) / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha / a) / a0;
  }

  process(input: number): number {
    const output =
      this.b0 * input +
      this.b1 * this.x1 +
      this.b2 * this.x2 -
      this.a1 * this.y1 -
      this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }
}

function shelfCoefficients(
  frequency: number,
  sampleRate: number,
  gainDb: number
): { cos: number; alpha: number; a: number } {
  const w0 = (2 * Math.PI * Math.max(20, frequency)) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / 2;
  const a = Math.pow(10, gainDb / 40);
  return { cos, alpha, a };
}
