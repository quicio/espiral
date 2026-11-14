export interface CoreMetrics {
  readonly peakDb: number;
  readonly rmsDb: number;
  readonly crestDb: number;
  readonly dc: number;
  readonly nan: boolean;
  readonly silent: boolean;
  readonly maxStep: number;
  readonly kickTailDb: number;
  readonly duration: number;
  readonly sampleRate: number;
}

export interface KickTailWindow {
  readonly start: number;
  readonly end: number;
}

const DEFAULT_KICK_TAIL: KickTailWindow = { start: 0.3, end: 0.4 };

export function analyzeCoreBuffer(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  kickTail: KickTailWindow = DEFAULT_KICK_TAIL
): CoreMetrics {
  const frames = Math.min(left.length, right.length);
  let peak = 0;
  let sumSquares = 0;
  let sum = 0;
  let count = 0;
  let nan = false;
  let maxStep = 0;
  let previousLeft = 0;
  let previousRight = 0;

  for (let index = 0; index < frames; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      nan = true;
      continue;
    }

    peak = Math.max(peak, Math.abs(leftValue), Math.abs(rightValue));
    sumSquares += leftValue * leftValue + rightValue * rightValue;
    sum += leftValue + rightValue;
    count += 2;

    if (index > 0) {
      maxStep = Math.max(
        maxStep,
        Math.abs(leftValue - previousLeft),
        Math.abs(rightValue - previousRight)
      );
    }
    previousLeft = leftValue;
    previousRight = rightValue;
  }

  const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
  const dc = count > 0 ? Math.abs(sum / count) : 0;
  const peakDb = db(peak);
  const rmsDb = db(rms);

  return {
    peakDb,
    rmsDb,
    crestDb: peak > 0 && rms > 0 ? 20 * Math.log10(peak / rms) : -120,
    dc,
    nan,
    silent: peak < 1e-4,
    maxStep,
    kickTailDb: stereoRmsDb(left, right, sampleRate, kickTail),
    duration: frames / sampleRate,
    sampleRate
  };
}

export function stereoRmsDb(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number,
  window: KickTailWindow
): number {
  const start = Math.max(0, Math.floor(window.start * sampleRate));
  const end = Math.min(
    Math.min(left.length, right.length),
    Math.ceil(window.end * sampleRate)
  );
  if (end <= start) return -120;

  let sum = 0;
  for (let index = start; index < end; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    sum += leftValue * leftValue + rightValue * rightValue;
  }
  const rms = Math.sqrt(sum / ((end - start) * 2));
  return db(rms);
}

function db(value: number): number {
  return value > 0 ? 20 * Math.log10(value) : -120;
}
