import { busToConfig, trackToConfig, type KitState } from '../../../domain/kit';
import type { EqSettings, GraphConfig } from '../../../domain/graph';

/** El glue de master agrega makeup; este trim devuelve el nivel integrado al rango. */
const MASTER_TRIM_DB = -5.2;

export function createEspiralGraph(
  kit: KitState,
  masterVolumeDb: number,
  masterEq?: EqSettings
): GraphConfig {
  return {
    tracks: Object.values(kit.tracks).map(track => trackToConfig(track)),
    buses: kit.buses.map(bus => busToConfig(bus)),
    ...(kit.sidechain ? { sidechain: kit.sidechain } : {}),
    master: {
      volumeDb: masterVolumeDb,
      limiterDb: -2,
      trimDb: MASTER_TRIM_DB,
      ...(masterEq ? { eq: masterEq } : {}),
      glue: { threshold: -18, ratio: 5, attack: 0.02, release: 0.18, knee: 8 }
    }
  };
}
