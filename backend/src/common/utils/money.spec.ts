import {
  toMinorUnits,
  formatScale4,
  sumMinor,
  mulMinor,
  trimTrailingZeros,
  quantizeToCents,
  formatMoney,
  allocate,
  reconcileToCents,
} from './money';
import { QUANTIZE_VECTORS, FORMAT_VECTORS, ALLOCATE_VECTORS } from './money-vectors';

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

  describe('trimTrailingZeros', () => {
    it('drops insignificant trailing zeros', () => {
      expect(trimTrailingZeros('2.0000')).toBe('2');
      expect(trimTrailingZeros('2.5000')).toBe('2.5');
      expect(trimTrailingZeros('1.2500')).toBe('1.25');
      expect(trimTrailingZeros('0.0010')).toBe('0.001');
    });

    it('preserves meaningful scale-4 precision', () => {
      expect(trimTrailingZeros('2.0001')).toBe('2.0001');
      expect(trimTrailingZeros('0.0001')).toBe('0.0001');
      expect(trimTrailingZeros('1.0001')).toBe('1.0001');
    });

    it('leaves integers and negatives intact', () => {
      expect(trimTrailingZeros('1')).toBe('1');
      expect(trimTrailingZeros('0')).toBe('0');
      expect(trimTrailingZeros('100')).toBe('100');
      expect(trimTrailingZeros('-1.5000')).toBe('-1.5');
      expect(trimTrailingZeros('-2.0000')).toBe('-2');
    });

    it('never collapses a whole value to an empty or bare-dot string', () => {
      expect(trimTrailingZeros('0.0000')).toBe('0');
      expect(trimTrailingZeros('10.0000')).toBe('10');
    });

    it('passes non-numeric input through untouched', () => {
      expect(trimTrailingZeros('')).toBe('');
      expect(trimTrailingZeros('abc')).toBe('abc');
      expect(trimTrailingZeros('1.2.3')).toBe('1.2.3');
    });
  });
});

describe('quantizeToCents', () => {
  it.each(QUANTIZE_VECTORS.map((v) => [v.name, v.inputMinor, v.expectedMinor] as const))(
    '%s',
    (_name, input, expected) => {
      expect(quantizeToCents(input)).toBe(expected);
    },
  );

  it('always returns a value divisible by 100 minor units', () => {
    for (const v of QUANTIZE_VECTORS) {
      expect(quantizeToCents(v.inputMinor) % 100n).toBe(0n);
    }
  });

  it('is idempotent', () => {
    for (const v of QUANTIZE_VECTORS) {
      const once = quantizeToCents(v.inputMinor);
      expect(quantizeToCents(once)).toBe(once);
    }
  });
});

describe('formatMoney', () => {
  it.each(FORMAT_VECTORS.map((v) => [v.name, v.inputMinor, v.expected] as const))(
    '%s',
    (_name, input, expected) => {
      expect(formatMoney(input)).toBe(expected);
    },
  );

  it('never emits negative zero', () => {
    for (const minor of [-1n, -32n, -49n, 0n, 49n]) {
      expect(formatMoney(minor)).not.toBe('-0.00');
    }
  });
});

describe('allocate', () => {
  it.each(
    ALLOCATE_VECTORS.map((v) => [v.name, v.targetMinor, v.weightsMinor, v.expectedMinor] as const),
  )('%s', (_name, target, weights, expected) => {
    expect(allocate(target, weights)).toEqual([...expected]);
  });

  it('conserves the target exactly for every vector', () => {
    for (const v of ALLOCATE_VECTORS) {
      const sum = allocate(v.targetMinor, v.weightsMinor).reduce((a, b) => a + b, 0n);
      expect(sum).toBe(v.targetMinor);
    }
  });

  it('rejects negative weights instead of silently allocating', () => {
    expect(() => allocate(100n, [1n, -1n])).toThrow(/negative weight/i);
  });

  it('rejects a non-zero target with no positive weights', () => {
    expect(() => allocate(100n, [0n, 0n])).toThrow(/no positive weights/i);
  });

  it('allocates nothing when the target is zero, even with zero weights', () => {
    expect(allocate(0n, [0n, 0n])).toEqual([0n, 0n]);
  });
});

describe('reconcileToCents', () => {
  it('fixes the duplicated cent that independent rounding creates', () => {
    // 0.3350 + 0.3350 + 0.3300 === 1.0000 exactly, but rounding each to cents
    // gives 0.34 + 0.34 + 0.33 === 1.01. Reconciliation must restore 1.00.
    const shares = [3350n, 3350n, 3300n];
    const result = reconcileToCents(shares, 10000n);
    expect(result.reduce((a, b) => a + b, 0n)).toBe(10000n);
    for (const r of result) {
      expect(r % 100n).toBe(0n);
    }
  });

  it('leaves already-reconciling shares alone', () => {
    const shares = [2500n, 7500n];
    expect(reconcileToCents(shares, 10000n)).toEqual([2500n, 7500n]);
  });

  it('never flips a share to the opposite sign', () => {
    const result = reconcileToCents([3350n, 3350n, 3300n], 10000n);
    for (const r of result) {
      expect(r >= 0n).toBe(true);
    }
  });

  it('preserves the sign convention for negative targets', () => {
    const result = reconcileToCents([-3350n, -3350n, -3300n], -10000n);
    expect(result.reduce((a, b) => a + b, 0n)).toBe(-10000n);
    for (const r of result) {
      expect(r <= 0n).toBe(true);
    }
  });
});
