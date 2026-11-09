import { describe, expect, it } from 'vitest';
import { encodeWav } from './wav';

describe('encodeWav', () => {
  it('writes a valid stereo PCM header and samples', () => {
    const bytes = encodeWav(
      [new Float32Array([0, 1, -1]), new Float32Array([0.5, -0.5, 0])],
      44100
    );
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(readAscii(view, 0, 4)).toBe('RIFF');
    expect(readAscii(view, 8, 4)).toBe('WAVE');
    expect(readAscii(view, 36, 4)).toBe('data');
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(3 * 2 * 2);
  });

  it('clamps samples outside the valid range', () => {
    const bytes = encodeWav([new Float32Array([2, -2])], 22050);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });

  it('rejects empty audio', () => {
    expect(() => encodeWav([], 44100)).toThrow('canales');
  });
});

function readAscii(view: DataView, offset: number, length: number): string {
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(view.getUint8(offset + index));
  }
  return text;
}
