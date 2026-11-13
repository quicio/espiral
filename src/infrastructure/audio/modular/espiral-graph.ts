import { busToConfig, trackToConfig, type KitState } from '../../../domain/kit';
import type { GraphConfig } from '../../../domain/graph';

export function createEspiralGraph(kit: KitState, masterVolumeDb: number): GraphConfig {
  return {
    tracks: Object.values(kit.tracks).map(track => trackToConfig(track)),
    buses: kit.buses.map(bus => busToConfig(bus)),
    master: {
      volumeDb: masterVolumeDb,
      limiterDb: -2,
      glue: { threshold: -18, ratio: 2.5, attack: 0.02, release: 0.18, knee: 8 }
    }
  };
}
