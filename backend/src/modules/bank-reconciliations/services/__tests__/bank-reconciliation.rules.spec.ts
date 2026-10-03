import {
  lineCents,
  computeSummary,
  nextPeriodFrom,
  addOneDay,
  diffIds,
  completionGates,
} from '../bank-reconciliation.rules';

describe('BankReconciliation rules', () => {
  describe('computeSummary and line quantization', () => {
    it('quantizes each line individually before summing (D13)', () => {
      const s = computeSummary({
        openingBalance: '100.00',
        closingBalance: '100.02',
        matched: [
          { debit: '0.0050', credit: '0.0000' },
          { debit: '0.0050', credit: '0.0000' },
        ],
        openingCleared: null,
        unclassifiedCount: null,
      });
      expect(s.moneyIn).toBe('0.02'); // sum-then-round would give 0.01
      expect(s.difference).toBe('0.00');
    });

    it('a sub-cent line that rounds down contributes nothing', () => {
      const { moneyIn, moneyOut } = lineCents({ debit: '0.0049', credit: '0.0000' });
      expect(moneyIn).toBe(0n);
      expect(moneyOut).toBe(0n);

      const s = computeSummary({
        openingBalance: '100.00',
        closingBalance: '100.00',
        matched: [{ debit: '0.0049', credit: '0.0000' }],
        openingCleared: null,
        unclassifiedCount: null,
      });
      expect(s.moneyIn).toBe('0.00');
      expect(s.difference).toBe('0.00');
    });

    it('a sub-cent line can round up to a cent and then blocks', () => {
      const s = computeSummary({
        openingBalance: '100.00',
        closingBalance: '100.00',
        matched: [{ debit: '0.0050', credit: '0.0000' }],
        openingCleared: null,
        unclassifiedCount: null,
      });
      expect(s.moneyIn).toBe('0.01');
      expect(s.calculatedClosingBalance).toBe('100.01');
      expect(s.difference).toBe('-0.01');
      const gates = completionGates(s);
      expect(gates.closing).toBe(false);
    });

    it('850.0032 displays and sums as 850.00', () => {
      const { moneyIn, moneyOut } = lineCents({ debit: '850.0032', credit: '0.0000' });
      expect(moneyIn).toBe(8500000n);
      expect(moneyOut).toBe(0n);

      const s = computeSummary({
        openingBalance: '0.00',
        closingBalance: '850.00',
        matched: [{ debit: '850.0032', credit: '0.0000' }],
        openingCleared: null,
        unclassifiedCount: null,
      });
      expect(s.moneyIn).toBe('850.00');
      expect(s.calculatedClosingBalance).toBe('850.00');
      expect(s.difference).toBe('0.00');
    });

    it('never formats negative zero', () => {
      const s = computeSummary({
        openingBalance: '-0.00',
        closingBalance: '0.00',
        matched: [],
        openingCleared: null,
        unclassifiedCount: null,
      });
      expect(s.openingBalance).toBe('0.00');
      expect(s.closingBalance).toBe('0.00');
      expect(s.difference).toBe('0.00');
      expect(s.calculatedClosingBalance).toBe('0.00');
    });

    it('handles signed balances', () => {
      const s = computeSummary({
        openingBalance: '-250.00',
        closingBalance: '-350.00',
        matched: [{ debit: '0.0000', credit: '100.0000' }],
        openingCleared: null,
        unclassifiedCount: null,
      });
      expect(s.moneyIn).toBe('0.00');
      expect(s.moneyOut).toBe('100.00');
      expect(s.calculatedClosingBalance).toBe('-350.00');
      expect(s.difference).toBe('0.00');
      const gates = completionGates(s);
      expect(gates.closing).toBe(true);
    });

    it('an empty selection balances when closing equals opening', () => {
      const s = computeSummary({
        openingBalance: '500.00',
        closingBalance: '500.00',
        matched: [],
        openingCleared: null,
        unclassifiedCount: null,
      });
      expect(s.moneyIn).toBe('0.00');
      expect(s.moneyOut).toBe('0.00');
      expect(s.calculatedClosingBalance).toBe('500.00');
      expect(s.difference).toBe('0.00');
      const gates = completionGates(s);
      expect(gates.closing).toBe(true);
    });

    it('opening difference = opening − net(debit − credit) of cleared lines, in cents', () => {
      const s = computeSummary({
        openingBalance: '150.00',
        closingBalance: '150.00',
        matched: [],
        openingCleared: [
          { debit: '200.0000', credit: '0.0000' },
          { debit: '0.0000', credit: '50.0000' },
        ],
        unclassifiedCount: 0,
      });
      expect(s.openingClearedNet).toBe('150.00');
      expect(s.openingBalanceDifference).toBe('0.00');
      expect(s.unclassifiedCount).toBe(0);

      const gates = completionGates(s);
      expect(gates.closing).toBe(true);
      expect(gates.opening).toBe(true);
      expect(gates.classification).toBe(true);
    });

    it('gates are independent', () => {
      const s = computeSummary({
        openingBalance: '150.00',
        closingBalance: '150.00',
        matched: [],
        openingCleared: [{ debit: '100.0000', credit: '0.0000' }],
        unclassifiedCount: 2,
      });
      expect(s.difference).toBe('0.00');
      expect(s.openingClearedNet).toBe('100.00');
      expect(s.openingBalanceDifference).toBe('50.00');
      expect(s.unclassifiedCount).toBe(2);

      const gates = completionGates(s);
      expect(gates).toEqual({
        closing: true,
        opening: false,
        classification: false,
      });
    });

    it('completionGates returns null opening and classification when not sequence 1', () => {
      const s = computeSummary({
        openingBalance: '100.00',
        closingBalance: '100.00',
        matched: [],
        openingCleared: null,
        unclassifiedCount: null,
      });
      const gates = completionGates(s);
      expect(gates).toEqual({
        closing: true,
        opening: null,
        classification: null,
      });
    });
  });

  describe('nextPeriodFrom and addOneDay', () => {
    it('nextPeriodFrom(null) is first with null From and Opening', () => {
      const np = nextPeriodFrom(null);
      expect(np).toEqual({
        sequenceNo: 1,
        isFirst: true,
        periodFrom: null,
        openingBalance: null,
      });
    });

    it('nextPeriodFrom follows the day after the previous To, across month and year ends', () => {
      expect(addOneDay('2026-12-31')).toBe('2027-01-01');
      expect(addOneDay('2028-02-28')).toBe('2028-02-29');
      expect(addOneDay('2028-02-29')).toBe('2028-03-01');
      expect(addOneDay('2026-01-31')).toBe('2026-02-01');

      const np = nextPeriodFrom({
        sequenceNo: 1,
        periodTo: '2026-01-31',
        closingBalance: '1234.56',
      });
      expect(np).toEqual({
        sequenceNo: 2,
        isFirst: false,
        periodFrom: '2026-02-01',
        openingBalance: '1234.56',
      });
    });
  });

  describe('diffIds', () => {
    it('diffIds returns ascending add and remove sets', () => {
      const current = ['b', 'd', 'a'];
      const desired = ['c', 'a', 'e'];

      const result = diffIds(current, desired);
      expect(result).toEqual({
        add: ['c', 'e'],
        remove: ['b', 'd'],
      });
    });

    it('handles identical sets and empty sets', () => {
      expect(diffIds(['a', 'b'], ['b', 'a'])).toEqual({ add: [], remove: [] });
      expect(diffIds([], ['x', 'y'])).toEqual({ add: ['x', 'y'], remove: [] });
      expect(diffIds(['x', 'y'], [])).toEqual({ add: [], remove: ['x', 'y'] });
    });
  });
});
