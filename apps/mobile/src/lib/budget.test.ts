import { calculateConsumedPercent, calculateConsumedTotal } from './budget';

describe('calculateConsumedTotal', () => {
  it('sums numeric amounts', () => {
    expect(calculateConsumedTotal([{ amount: 100 }, { amount: 250 }])).toBe(350);
  });

  it('coerces string amounts (as PostgREST numeric columns arrive)', () => {
    expect(calculateConsumedTotal([{ amount: '100.50' }, { amount: '49.50' }])).toBe(150);
  });

  it('returns 0 for an empty list', () => {
    expect(calculateConsumedTotal([])).toBe(0);
  });
});

describe('calculateConsumedPercent', () => {
  it('returns null when budget_total is null', () => {
    expect(calculateConsumedPercent(500, null)).toBeNull();
  });

  it('returns null when budget_total is undefined', () => {
    expect(calculateConsumedPercent(500, undefined)).toBeNull();
  });

  it('returns null when budget_total is 0', () => {
    expect(calculateConsumedPercent(500, 0)).toBeNull();
  });

  it('rounds to the nearest whole percent', () => {
    expect(calculateConsumedPercent(333, 1000)).toBe(33);
  });

  it('caps at 100 when consumed exceeds budget', () => {
    expect(calculateConsumedPercent(1500, 1000)).toBe(100);
  });

  it('returns 0 when nothing has been consumed yet', () => {
    expect(calculateConsumedPercent(0, 1000)).toBe(0);
  });
});
