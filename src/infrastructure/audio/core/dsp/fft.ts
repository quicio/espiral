const FFT_SIZE = 128;

export class SpectrumAnalyzer {
  private readonly re = new Float32Array(FFT_SIZE);
  private readonly im = new Float32Array(FFT_SIZE);
  private readonly magnitudes = new Float32Array(FFT_SIZE / 2);
  private output: number[] = [];

  analyze(samples: Float32Array, bins: number): number[] {
    const count = Math.max(1, Math.round(bins));
    if (this.output.length !== count) {
      this.output = new Array<number>(count).fill(0);
    }
    this.re.fill(0);
    this.im.fill(0);

    for (let index = 0; index < FFT_SIZE; index += 1) {
      const window =
        0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1));
      this.re[index] = (samples[index] ?? 0) * window;
    }

    fftInPlace(this.re, this.im);

    for (let index = 0; index < this.magnitudes.length; index += 1) {
      this.magnitudes[index] =
        Math.sqrt(
          (this.re[index] ?? 0) * (this.re[index] ?? 0) +
            (this.im[index] ?? 0) * (this.im[index] ?? 0)
        ) / (FFT_SIZE / 2);
    }

    for (let index = 0; index < count; index += 1) {
      const start = Math.floor(
        Math.pow(this.magnitudes.length - 1, index / count)
      );
      const end = Math.max(
        start + 1,
        Math.floor(Math.pow(this.magnitudes.length - 1, (index + 1) / count))
      );
      let peak = 0;
      for (
        let bin = start;
        bin < Math.min(end, this.magnitudes.length);
        bin += 1
      ) {
        peak = Math.max(peak, this.magnitudes[bin] ?? 0);
      }
      this.output[index] = Math.min(1, Math.sqrt(peak) * 2);
    }
    return this.output;
  }
}

export function spectrumBins(
  samples: Float32Array,
  bins: number
): number[] {
  return new SpectrumAnalyzer().analyze(samples, bins);
}

function fftInPlace(re: Float32Array, im: Float32Array): void {
  const size = re.length;
  let j = 0;
  for (let index = 1; index < size; index += 1) {
    let bit = size >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (index < j) {
      const reTmp = re[index] ?? 0;
      const imTmp = im[index] ?? 0;
      re[index] = re[j] ?? 0;
      im[index] = im[j] ?? 0;
      re[j] = reTmp;
      im[j] = imTmp;
    }
  }

  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let curRe = 1;
      let curIm = 0;
      for (let offset = 0; offset < length / 2; offset += 1) {
        const even = start + offset;
        const odd = even + length / 2;
        const oddRe = re[odd] ?? 0;
        const oddIm = im[odd] ?? 0;
        const tRe = oddRe * curRe - oddIm * curIm;
        const tIm = oddRe * curIm + oddIm * curRe;
        re[odd] = (re[even] ?? 0) - tRe;
        im[odd] = (im[even] ?? 0) - tIm;
        re[even] = (re[even] ?? 0) + tRe;
        im[even] = (im[even] ?? 0) + tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}
