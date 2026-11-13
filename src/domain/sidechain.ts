/**
 * Sidechain de mezcla: el kick abre un ducking sobre el bajo.
 *
 * Vive en `domain` porque es una decisión musical, no de infraestructura: el
 * motor sólo traduce estos puntos a automatización de audio.
 */
export interface SidechainConfig {
  readonly enabled: boolean;
  readonly sourceTrackId: string;
  readonly targetTrackId: string;
  /** Cuánto baja el target, en dB positivos (4 = −4 dB). */
  readonly depthDb: number;
  readonly attack: number;
  readonly release: number;
}

export interface SidechainPoint {
  readonly time: number;
  readonly gain: number;
}

/** Convierte dB a ganancia lineal. 0 dB = 1, −6 dB ≈ 0.501. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Tres puntos deterministas: abierto en el golpe, cerrado tras el ataque y
 * abierto de nuevo al terminar el release.
 */
export function sidechainPoints(
  time: number,
  depthDb: number,
  attack: number,
  release: number
): readonly SidechainPoint[] {
  const attackSeconds = Math.max(0, attack);
  const releaseSeconds = Math.max(0, release);
  const ducked = dbToGain(-Math.max(0, depthDb));
  return [
    { time, gain: 1 },
    { time: time + attackSeconds, gain: ducked },
    { time: time + attackSeconds + releaseSeconds, gain: 1 }
  ];
}
