import { describe, expect, it } from 'vitest';
import { wouldCreateCycle } from './patch';

describe('wouldCreateCycle', () => {
  it('rejects self connections', () => {
    expect(wouldCreateCycle({}, 'a', 'a')).toBe(true);
  });

  it('rejects a direct reverse connection', () => {
    expect(wouldCreateCycle({ a: ['b'], b: [] }, 'b', 'a')).toBe(true);
  });

  it('rejects an indirect cycle', () => {
    expect(
      wouldCreateCycle({ a: ['b'], b: ['c'], c: [] }, 'c', 'a')
    ).toBe(true);
  });

  it('allows acyclic connections', () => {
    expect(
      wouldCreateCycle({ a: ['b'], b: ['c'], c: [] }, 'a', 'c')
    ).toBe(false);
  });
});
