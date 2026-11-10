import { describe, expect, it } from 'vitest';
import { CpuMeter, cpuSeverity } from './cpu-meter';

describe('CpuMeter', () => {
  it('starts at zero and stays low with regular frames', () => {
    const meter = new CpuMeter();
    expect(meter.sample(0)).toBe(0);

    let value = 0;
    for (let index = 1; index <= 20; index += 1) {
      value = meter.sample(index * (1000 / 60));
    }

    expect(value).toBeLessThan(0.05);
  });

  it('rises when frames take longer than the budget', () => {
    const meter = new CpuMeter();
    meter.sample(0);
    meter.sample(16.67);

    const value = meter.sample(66.67);

    expect(value).toBeGreaterThan(0.1);
  });

  it('includes audio underruns in the estimate', () => {
    const meter = new CpuMeter();
    meter.sample(0);

    const value = meter.sample(16.67, {
      underruns: 2,
      underrunDuration: 500,
      totalDuration: 1000
    });

    expect(value).toBeGreaterThan(0.05);
  });

  it('resets its history', () => {
    const meter = new CpuMeter();
    meter.sample(0);
    meter.sample(100);
    meter.reset();

    expect(meter.sample(500)).toBe(0);
  });

  it('classifies load for UI warnings', () => {
    expect(cpuSeverity(0.2)).toBe('normal');
    expect(cpuSeverity(0.6)).toBe('warning');
    expect(cpuSeverity(0.85)).toBe('critical');
  });
});
