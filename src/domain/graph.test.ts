import { describe, expect, it } from 'vitest';
import {
  insertConfigsEqual,
  planLatency,
  validateGraph,
  type GraphConfig,
  type TrackConfig
} from './graph';

function config(overrides: Partial<GraphConfig> = {}): GraphConfig {
  return {
    tracks: [
      {
        id: 'kick',
        name: 'Kick',
        machine: { kind: 'membrane' },
        gainDb: -6,
        pan: 0,
        mute: false,
        solo: false,
        inserts: [],
        sends: []
      }
    ],
    buses: [
      {
        id: 'space',
        name: 'Space',
        returnDb: -6,
        inserts: [
          {
            id: 'reverb',
            pluginId: 'reverb',
            bypass: false,
            params: { wet: 1, decay: 4 }
          }
        ]
      }
    ],
    master: {
      volumeDb: -6,
      limiterDb: -2,
      glue: { threshold: -14, ratio: 1.5, attack: 0.02, release: 0.3, knee: 6 }
    },
    ...overrides
  };
}

describe('validateGraph', () => {
  it('accepts a valid graph', () => {
    expect(validateGraph(config())).toEqual([]);
  });

  it('detects duplicate IDs and missing buses', () => {
    const invalid = config({
      tracks: [
        {
          id: 'kick',
          name: 'Kick',
          machine: { kind: 'membrane' },
          gainDb: -6,
          pan: 0,
          mute: false,
          solo: false,
          inserts: [],
          sends: [{ busId: 'missing', amount: 0.5, preFader: false }]
        },
        {
          id: 'kick',
          name: 'Kick 2',
          machine: { kind: 'membrane' },
          gainDb: -6,
          pan: 0,
          mute: false,
          solo: false,
          inserts: [],
          sends: []
        }
      ]
    });

    const errors = validateGraph(invalid);
    expect(errors.some(error => error.includes('ID duplicado'))).toBe(true);
    expect(errors.some(error => error.includes('bus inexistente'))).toBe(true);
  });

  it('detects out-of-range sends', () => {
    const invalid = config({
      tracks: [
        {
          id: 'kick',
          name: 'Kick',
          machine: { kind: 'membrane' },
          gainDb: -6,
          pan: 0,
          mute: false,
          solo: false,
          inserts: [],
          sends: [{ busId: 'space', amount: 2, preFader: false }]
        }
      ]
    });

    expect(validateGraph(invalid).some(error => error.includes('fuera de rango'))).toBe(true);
  });
});

describe('planLatency', () => {
  it('compensates direct and send paths to the longest latency', () => {
    const graph = config({
      tracks: [
        track('a', 0, [{ busId: 'space', amount: 0.4, preFader: false }]),
        track('b', 64, [{ busId: 'space', amount: 0.4, preFader: false }]),
        track('c', 64, [])
      ],
      buses: [
        {
          id: 'space',
          name: 'Space',
          returnDb: -6,
          inserts: [
            {
              id: 'reverb',
              pluginId: 'reverb',
              bypass: false,
              params: { wet: 1, decay: 4 },
              latencySamples: 128
            }
          ]
        }
      ]
    });

    const plan = planLatency(graph);

    expect(plan.maxLatencySamples).toBe(192);
    expect(plan.trackCompensation.a).toBe(192);
    expect(plan.trackCompensation.b).toBe(128);
    expect(plan.trackCompensation.c).toBe(128);
    expect(plan.sendCompensation['a:space']).toBe(64);
    expect(plan.sendCompensation['b:space']).toBe(0);
  });
});

function track(
  id: string,
  latencySamples: number,
  sends: TrackConfig['sends']
): TrackConfig {
  return {
    id,
    name: id,
    machine: { kind: 'membrane' },
    gainDb: -6,
    pan: 0,
    mute: false,
    solo: false,
    inserts:
      latencySamples > 0
        ? [
            {
              id: 'latency',
              pluginId: 'filter',
              bypass: false,
              params: { cutoff: 1000, q: 1 },
              latencySamples
            }
          ]
        : [],
    sends
  };
}

describe('insertConfigsEqual', () => {
  const chain = [
    {
      id: 'filter',
      pluginId: 'filter',
      bypass: false,
      params: { cutoff: 1200, q: 1 }
    }
  ] as const;

  it('compares ids, plugins, bypass, params and latency', () => {
    expect(insertConfigsEqual(chain, [...chain])).toBe(true);
    expect(
      insertConfigsEqual(chain, [{ ...chain[0], bypass: true }])
    ).toBe(false);
    expect(
      insertConfigsEqual(chain, [
        { ...chain[0], params: { cutoff: 1200, q: 2 } }
      ])
    ).toBe(false);
    expect(
      insertConfigsEqual(chain, [{ ...chain[0], latencySamples: 128 }])
    ).toBe(false);
  });

  it('detects order changes and empty chains', () => {
    const second = {
      id: 'delay',
      pluginId: 'delay',
      bypass: false,
      params: { wet: 0.3 }
    };

    expect(insertConfigsEqual([], [])).toBe(true);
    expect(insertConfigsEqual(chain, [])).toBe(false);
    expect(insertConfigsEqual([...chain, second], [second, ...chain])).toBe(
      false
    );
  });
});
