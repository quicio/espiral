const TAU = Math.PI * 2;

const START_HZ = 180;
const BASE_HZ = 48;
const PITCH_TAU = 0.03;
const AMP_TAU = 0.16;
const ATTACK_SECONDS = 0.0005;
const CLICK_TAU = 0.0025;
const LENGTH_SECONDS = 1.4;

export class KickVoice {
  private active = false;
  private elapsed = 0;
  private phase = 0;
  private velocity = 0;
  private rng = 1;
  private previousNoise = 0;

  constructor(private readonly sampleRate: number) {}

  get isActive(): boolean {
    return this.active;
  }

  trigger(velocity = 1, seed = 1): void {
    this.active = true;
    this.elapsed = 0;
    this.phase = 0;
    this.velocity = Math.max(0, Math.min(1, velocity));
    this.rng = seed >>> 0 || 1;
    this.previousNoise = 0;
  }

  stop(): void {
    this.active = false;
  }

  reset(): void {
    this.stop();
    this.elapsed = 0;
    this.phase = 0;
    this.previousNoise = 0;
  }

  render(): number {
    if (!this.active) return 0;

    const t = this.elapsed;
    if (t >= LENGTH_SECONDS) {
      this.active = false;
      return 0;
    }

    const attack =
      t < ATTACK_SECONDS ? t / ATTACK_SECONDS : 1;
    const amp = attack * Math.exp(-t / AMP_TAU) * this.velocity;
    const frequency = BASE_HZ + (START_HZ - BASE_HZ) * Math.exp(-t / PITCH_TAU);

    this.phase += frequency / this.sampleRate;
    if (this.phase >= 1) this.phase -= 1;

    const body = Math.sin(TAU * this.phase) * amp;

    const noise = this.nextNoise();
    const click =
      (noise - this.previousNoise) *
      0.12 *
      Math.exp(-t / CLICK_TAU) *
      this.velocity;
    this.previousNoise = noise;

    this.elapsed += 1 / this.sampleRate;
    return body + click;
  }

  private nextNoise(): number {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return (this.rng / 0xffffffff) * 2 - 1;
  }
}
