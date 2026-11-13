import { describe, expect, it } from 'vitest';
import { createDefaultKit } from '../../../domain/default-kit';
import { validateGraph } from '../../../domain/graph';
import { createEspiralGraph } from './espiral-graph';

describe('createEspiralGraph', () => {
  it('builds a valid 16-track graph from the kit', () => {
    const graph = createEspiralGraph(createDefaultKit(), -4);

    expect(validateGraph(graph)).toEqual([]);
    expect(graph.tracks).toHaveLength(16);
    expect(graph.tracks.slice(0, 8).map(track => track.id)).toEqual([
      'kick',
      'track-08',
      'track-09',
      'hihat',
      'track-10',
      'perc',
      'track-11',
      'track-12'
    ]);
    expect(graph.tracks.slice(8).map(track => track.id)).toEqual([
      'bass',
      'drone',
      'pad',
      'lead',
      'track-13',
      'track-14',
      'track-15',
      'track-16'
    ]);
    expect(graph.buses.map(bus => bus.id)).toEqual([
      'reverb-bus',
      'delay-bus',
      'drum-bus'
    ]);
    expect(graph.buses[0]?.inserts[0]?.pluginId).toBe('reverb');
    expect(graph.buses[1]?.inserts[0]?.pluginId).toBe('delay');
    expect(graph.buses[2]?.inserts.map(insert => insert.pluginId)).toEqual([
      'compressor',
      'drive'
    ]);
    expect(graph.tracks.find(track => track.id === 'bass')?.machine.samples).toHaveLength(6);
    expect(graph.tracks.find(track => track.id === 'hihat')?.machine.samples).toHaveLength(8);
    expect(graph.tracks.find(track => track.id === 'hihat')?.inserts).toHaveLength(2);
    expect(graph.tracks.find(track => track.id === 'kick')?.inserts).toHaveLength(0);
    const drumIds = [
      'kick',
      'track-08',
      'track-09',
      'hihat',
      'track-10',
      'perc',
      'track-11',
      'track-12',
      'track-16'
    ];
    drumIds.forEach(id => {
      expect(graph.tracks.find(track => track.id === id)?.outputBusId).toBe(
        'drum-bus'
      );
    });
    ['bass', 'drone', 'pad', 'lead', 'track-13', 'track-14', 'track-15'].forEach(
      id => {
        expect(
          graph.tracks.find(track => track.id === id)?.outputBusId
        ).toBeUndefined();
      }
    );
    expect(graph.master.volumeDb).toBe(-4);
    expect(graph.sidechain).toEqual({
      enabled: true,
      sourceTrackId: 'kick',
      targetTrackId: 'bass',
      depthDb: 6,
      attack: 0.006,
      release: 0.16
    });
  });
});
