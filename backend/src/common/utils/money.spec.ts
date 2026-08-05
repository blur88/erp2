import { toMinorUnits, formatScale4, sumMinor, mulMinor } from './money';

describe('money helpers', () => {
  it('parses decimal string to minor units', () => {
    expect(toMinorUnits('500.0000')).toBe(5000000n);
    expect(toMinorUnits('0.0001')).toBe(1n);
    expect(toMinorUnits('1234.5678')).toBe(12345678n);
  });

  it('rejects more than 4 fractional digits', () => {
    expect(() => toMinorUnits('1.00001')).toThrow();
  });

  it('does not overflow at NUMERIC(18,4) magnitude', () => {
    // 14 integer digits + 4 fractional = 18 total; ×10^4 ≈ 10^18, safe as bigint
    expect(toMinorUnits('99999999999999.9999')).toBe(999999999999999999n);
  });

  it('formats to scale-4 string', () => {
    expect(formatScale4('500')).toBe('500.0000');
    expect(formatScale4(5000000n)).toBe('500.0000');
    expect(formatScale4('1234.5')).toBe('1234.5000');
    expect(formatScale4(-3000000n)).toBe('-300.0000');
  });

  it('rejects a JS number argument', () => {
    // @ts-expect-error number is not accepted
    expect(() => toMinorUnits(500)).toThrow();
    // @ts-expect-error number is not accepted
    expect(() => formatScale4(500)).toThrow();
  });

  it('sums a list in minor units', () => {
    expect(sumMinor(['100.0000', '200.5000', '0.5000'])).toBe(3010000n);
  });

  it('multiplies two scale-4 values, rounding half-up at scale 4', () => {
    // 3 × 2.5 = 7.5000
    expect(mulMinor(toMinorUnits('3'), toMinorUnits('2.5'))).toBe(75000n);
    // 1.0001 × 1.0001 = 1.00020001 → round to 1.0002
    expect(mulMinor(toMinorUnits('1.0001'), toMinorUnits('1.0001'))).toBe(10002n);
    // 0.0001 × 0.0001 = 0.00000001 → rounds to 0.0000
    expect(mulMinor(toMinorUnits('0.0001'), toMinorUnits('0.0001'))).toBe(0n);
  });
});
