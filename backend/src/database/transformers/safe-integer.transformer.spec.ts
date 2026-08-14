import { safeIntegerTransformer } from './safe-integer.transformer';

describe('safeIntegerTransformer', () => {
  describe('from (DB -> app)', () => {
    it('converts a numeric string to a number', () => {
      expect(safeIntegerTransformer.from('2297720')).toBe(2297720);
    });

    it('returns a real number type, not a string', () => {
      expect(typeof safeIntegerTransformer.from('5')).toBe('number');
    });

    it('passes null through', () => {
      expect(safeIntegerTransformer.from(null)).toBeNull();
    });

    it('passes undefined through as null', () => {
      expect(safeIntegerTransformer.from(undefined as unknown as null)).toBeNull();
    });

    it('accepts a value already returned as a number', () => {
      expect(safeIntegerTransformer.from(42 as unknown as string)).toBe(42);
    });

    it('throws rather than truncating beyond MAX_SAFE_INTEGER', () => {
      expect(() => safeIntegerTransformer.from('9007199254740993')).toThrow(
        /exceeds safe integer range/,
      );
    });

    it('throws on a non-numeric string', () => {
      expect(() => safeIntegerTransformer.from('abc')).toThrow(
        /exceeds safe integer range/,
      );
    });
  });

  describe('to (app -> DB)', () => {
    it('stringifies a number', () => {
      expect(safeIntegerTransformer.to(2297720)).toBe('2297720');
    });

    it('passes null through', () => {
      expect(safeIntegerTransformer.to(null)).toBeNull();
    });

    it('passes undefined through as null', () => {
      expect(safeIntegerTransformer.to(undefined as unknown as null)).toBeNull();
    });

    it('throws rather than persisting a value beyond MAX_SAFE_INTEGER', () => {
      expect(() => safeIntegerTransformer.to(9007199254740993)).toThrow(
        /exceeds safe integer range/,
      );
    });

    it('throws on a non-integer', () => {
      expect(() => safeIntegerTransformer.to(1.5)).toThrow(/exceeds safe integer range/);
    });

    it('accepts a value exactly at MAX_SAFE_INTEGER', () => {
      expect(safeIntegerTransformer.to(Number.MAX_SAFE_INTEGER)).toBe('9007199254740991');
    });
  });
});
