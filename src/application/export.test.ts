import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from './initial-state';
import { ExportService } from './export';
import { Store } from './store';
import type { AudioExportPort, FileGatewayPort } from '../domain/ports';
import { FakeGenerative, FakeStatus } from '../test/fakes';

function setup() {
  const store = new Store(createInitialState(new FakeGenerative()));
  const calls: { bars: number; tailSeconds: number }[] = [];
  const states: ReturnType<Store['getState']>[] = [];
  const downloads: { filename: string; blob: Blob }[] = [];
  const renderer: AudioExportPort = {
    async render(state, options) {
      states.push(state);
      calls.push(options);
      return new Blob(['wav'], { type: 'audio/wav' });
    }
  };
  const files: FileGatewayPort = {
    downloadJson() {},
    downloadBlob(filename, blob) {
      downloads.push({ filename, blob });
    },
    async readJsonFile() {
      return {};
    },
    async readFileAsDataUrl() {
      return '';
    }
  };
  const status = new FakeStatus();
  const service = new ExportService(store, renderer, files, status);
  return { service, calls, states, downloads, status };
}

describe('ExportService', () => {
  it('renders the current state and downloads a WAV', async () => {
    const { service, calls, downloads, status } = setup();

    await service.exportWav();

    expect(calls).toEqual([{ bars: 8, tailSeconds: 2 }]);
    expect(downloads[0]?.filename).toBe('espiral-umbral-8bars.wav');
    expect(downloads[0]?.blob.type).toBe('audio/wav');
    expect(status.messages).toContain('Audio exportado.');
  });

  it('exports a selected scene with custom duration', async () => {
    const { service, calls, states, downloads } = setup();

    await service.exportWav({ bars: 4, tailSeconds: 1, scene: 'deriva' });

    expect(calls).toEqual([{ bars: 4, tailSeconds: 1 }]);
    expect(states[0]?.scene).toBe('deriva');
    expect(states[0]?.kit).toEqual(states[0]?.scenes.deriva.kit);
    expect(downloads[0]?.filename).toBe('espiral-deriva-4bars.wav');
  });

  it('reports a failed render', async () => {
    const status = new FakeStatus();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = new ExportService(
      new Store(createInitialState(new FakeGenerative())),
      {
        async render() {
          throw new Error('offline');
        }
      },
      {
        downloadJson() {},
        downloadBlob() {},
        async readJsonFile() {
          return {};
        },
        async readFileAsDataUrl() {
          return '';
        }
      },
      status
    );

    await failing.exportWav();
    spy.mockRestore();

    expect(status.messages).toContain('No se pudo exportar el audio.');
    expect(status.messages).not.toContain('Audio exportado.');
  });
});
