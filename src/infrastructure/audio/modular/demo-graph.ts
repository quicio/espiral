import type { GraphConfig } from '../../../domain/graph';

export function createDemoGraph(): GraphConfig {
  return {
    tracks: [
      {
        id: 'kick',
        name: 'Kick',
        role: 'kick',
        machine: {
          kind: 'membrane',
          oscillator: 'sine',
          envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
        },
        gainDb: -6,
        pan: 0,
        mute: false,
        solo: false,
        inserts: [],
        sends: []
      },
      {
        id: 'bass',
        name: 'Bass',
        role: 'bass',
        machine: {
          kind: 'sampler',
          samples: ['./audio/bass-a.wav'],
          voices: 2,
          fadeIn: 0.004,
          fadeOut: 0.05
        },
        gainDb: -8,
        pan: 0,
        mute: false,
        solo: false,
        inserts: [
          {
            id: 'insert',
            pluginId: 'filter',
            bypass: false,
            params: { cutoff: 1200, q: 1 }
          }
        ],
        sends: [{ busId: 'space', amount: 0.35, preFader: false }]
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
    }
  };
}
