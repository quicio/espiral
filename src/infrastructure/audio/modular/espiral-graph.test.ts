import { describe, expect, it } from 'vitest';
import { createDefaultKit } from '../../../domain/default-kit';
import { validateGraph } from '../../../domain/graph';
import { createEspiralGraph } from './espiral-graph';

describe('createEspiralGraph', () => {
  it('builds a valid 16-track graph from the kit', () => {
    const graph = createEspiralGraph(createDefaultKit(), -4);

    expect(validateGraph(graph)).toEqual([]);
    expect(graph.tracks).toHaveLength(16);
    expect(graph.tracks.slice(0, 7).map(track => track.id)).toEqual([
      'kick',
      'bass',
      'hihat',
      'perc',
      'drone',
      'pad',
      'lead'
    ]);
    expect(graph.tracks.slice(7).map(track => track.id)).toEqual([
      'track-08',
      'track-09',
      'track-10',
      'track-11',
      'track-12',
      'track-13',
      'track-14',
      'track-15',
      'track-16'
    ]);
    expect(graph.buses.map(bus => bus.id)).toEqual(['reverb-bus', 'delay-bus']);
    expect(graph.buses[0]?.inserts[0]?.pluginId).toBe('reverb');
    expect(graph.buses[1]?.inserts[0]?.pluginId).toBe('delay');
    expect(graph.tracks.find(track => track.id === 'bass')?.machine.samples).toHaveLength(6);
    expect(graph.tracks.find(track => track.id === 'hihat')?.machine.samples).toHaveLength(8);
    expect(graph.tracks.find(track => track.id === 'hihat')?.inserts).toHaveLength(2);
    expect(graph.tracks.find(track => track.id === 'kick')?.inserts).toHaveLength(0);
    expect(graph.master.volumeDb).toBe(-4);
  });
});
