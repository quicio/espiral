import * as Tone from 'tone';

/** Techo del safety clipper: 0.8 ≈ −1.94 dBFS. */
export const SAFETY_CLIP_CEILING = 0.8;

/**
 * Última red de seguridad después del limiter. El limiter de Web Audio tiene
 * ataque finito y puede dejar pasar transientes; este shaper garantiza que
 * ninguna muestra salga del techo configurado.
 */
export function createSafetyClipper(): Tone.WaveShaper {
  return new Tone.WaveShaper((value: number) =>
    Math.max(-SAFETY_CLIP_CEILING, Math.min(SAFETY_CLIP_CEILING, value))
  );
}
