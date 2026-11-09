import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from './initial-state';
import { ExportService } from './export';
import { Store } from './store';
import type { AudioExportPort, FileGatewayPort } from '../domain/ports';
import { FakeGenerative, FakeStatus } from '../test/fakes';

function setup() {
  const store = new Store(createInitialState(new FakeGenerative()));
  const calls: { bars: number; tailSeconds: number }[] = [];
  const downloads: { filename: string; blob: Blob }[] = [];
  const renderer: AudioExportPort = {
    async render(_state, options) {
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
    }
  };
  const status = new FakeStatus();
  const service = new ExportService(store, renderer, files, status);
  return { service, calls, downloads, status };
}

describe('ExportService', () => {
  it('renders the current state and downloads a WAV', async () => {
    const { service, calls, downloads, status } = setup();

    await service.exportWav();

    expect(calls).toEqual([{ bars: 8, tailSeconds: 2 }]);
    expect(downloads[0]?.filename).toBe('espiral-export.wav');
    expect(downloads[0]?.blob.type).toBe('audio/wav');
    expect(status.messages).toContain('Audio exportado.');
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
