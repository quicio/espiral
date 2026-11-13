import * as Tone from 'tone';

/**
 * ¿Estamos dentro de un render offline (`Tone.Offline`)?
 *
 * No alcanza con `rawContext instanceof OfflineAudioContext`: Tone envuelve el
 * contexto y el objeto resultante vive en otro realm, así que el `instanceof`
 * da false dentro de `Tone.Offline`. La fuente confiable es la bandera del
 * propio contexto de Tone.
 */
export function isOfflineContext(): boolean {
  const context = Tone.getContext() as unknown as {
    isOffline?: boolean;
    rawContext?: BaseAudioContext;
  };
  if (typeof context.isOffline === 'boolean') return context.isOffline;
  const raw = context.rawContext;
  return (
    typeof OfflineAudioContext !== 'undefined' &&
    raw instanceof OfflineAudioContext
  );
}
