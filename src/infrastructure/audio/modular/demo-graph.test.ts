import { describe, expect, it } from 'vitest';
import { validateGraph } from '../../../domain/graph';
import { createDemoGraph } from './demo-graph';

describe('createDemoGraph', () => {
  it('builds a valid 2-track graph with one bus and one insert', () => {
    const graph = createDemoGraph();

    expect(validateGraph(graph)).toEqual([]);
    expect(graph.tracks).toHaveLength(2);
    expect(graph.buses).toHaveLength(1);
    expect(graph.tracks[1]?.inserts).toHaveLength(1);
    expect(graph.tracks[1]?.sends[0]?.busId).toBe('space');
  });
});
