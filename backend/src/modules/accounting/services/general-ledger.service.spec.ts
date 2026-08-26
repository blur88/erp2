import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { AccountType } from '../entities/account-type.enum';
import { GeneralLedgerService } from './general-ledger.service';
import { toMinorUnits } from '@/common/utils/money';

/**
 * Chainable query-builder stub.
 *
 * Builders are handed out by CLASSIFICATION, never by call order: the opening
 * query is skipped without `fromDate` and the prefix query is skipped on page 1,
 * so a positional queue silently hands the wrong stub to the wrong read.
 * `tag()` marks each builder and `createQueryBuilder` dispenses by tag.
 */
function makeQb(tag: string, result: { raw?: unknown; entities?: unknown[] } = {}) {
  const qb: Record<string, unknown> = { __tag: tag };
  for (const m of [
    'innerJoin', 'innerJoinAndSelect', 'innerJoinAndMapOne', 'select', 'addSelect', 'where', 'andWhere',
    'orderBy', 'addOrderBy', 'limit', 'offset', 'take', 'skip', 'groupBy',
    'from', 'setParameters',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getQuery = jest.fn(() => `SELECT /* ${tag} */`);
  qb.getParameters = jest.fn(() => ({}));
  qb.getRawOne = jest.fn(async () => result.raw);
  qb.getMany = jest.fn(async () => result.entities ?? []);
  // Task 3 only: the pre-rewrite service reads rows via getRawAndEntities.
  qb.getRawAndEntities = jest.fn(async () => ({ raw: [], entities: result.entities ?? [] }));
  return qb;
}

describe('GeneralLedgerService', () => {
  const account = { id: 'acct-1', code: '1100', name: 'Cash', type: AccountType.ASSET };

  function makeService(opts: {
    account?: unknown;
    opening?: { debit: string; credit: string };
    prefix?: { debit: string; credit: string };
    window?: { debit: string; credit: string; count: string };
    lines?: unknown[];
  }) {
    const openingQb = makeQb('opening', { raw: opts.opening ?? { debit: '0', credit: '0' } });
    const prefixInnerQb = makeQb('prefix-inner');
    const prefixQb = makeQb('prefix', { raw: opts.prefix ?? { debit: '0', credit: '0' } });
    const windowQb = makeQb('window', {
      raw: opts.window ?? { debit: '0', credit: '0', count: String((opts.lines ?? []).length) },
    });
    const rowsQb = makeQb('rows', { entities: opts.lines ?? [] });

    // Classify by what the service asks for, not by call order:
    //  - createQueryBuilder()          -> the prefix OUTER wrapper (no entity arg)
    //  - createQueryBuilder(Line, 'l') -> one of the four line queries
    // The four are told apart by the calls the service makes on them, so a
    // skipped opening or prefix query cannot shift the others.
    const lineBuilders: Record<string, unknown> = {
      opening: openingQb, window: windowQb, prefix: prefixInnerQb, rows: rowsQb,
    };
    let nextLineKind: string[] = [];
    const manager = {
      findOne: jest.fn(async () => ('account' in opts ? opts.account : account)),
      createQueryBuilder: jest.fn((...args: unknown[]) => {
        if (args.length === 0) return prefixQb;         // prefix outer wrapper
        const kind = nextLineKind.shift() ?? 'rows';
        return lineBuilders[kind];
      }),
    };
    // The service issues its line queries in a fixed sequence; declare exactly
    // the ones it will issue for this scenario.
    nextLineKind = [
      ...(opts.opening ? ['opening'] : []),
      'window',
      ...(opts.prefix ? ['prefix'] : []),
      'rows',
    ];

    const dataSource = {
      transaction: jest.fn(async (_level: string, cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    };
    const balance = { naturalBalance: (type: AccountType, raw: bigint) =>
      type === AccountType.LIABILITY || type === AccountType.EQUITY || type === AccountType.INCOME ? -raw : raw };
    const service = new GeneralLedgerService(dataSource as never, balance as never);
    return { service, dataSource, manager, openingQb, prefixQb, prefixInnerQb, windowQb, rowsQb };
  }

  function line(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'line-1',
      debit: '100.0000',
      credit: '0.0000',
      entry: {
        id: 'je-1', journalNo: 'JE-26-001', entryDate: '2026-07-10',
        description: 'Test', sourceType: 'OPENING_BALANCE',
        sourceDocumentId: null, sourceRef: 'OB-1',
      },
      ...over,
    };
  }

  it('throws when the account does not exist', async () => {
    const { service } = makeService({ account: null });
    await expect(service.getLedger({ accountId: 'missing' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns the account identity block', async () => {
    const { service } = makeService({ lines: [line()] });
    const gl = await service.getLedger({ accountId: 'acct-1' });
    expect(gl.account).toEqual({ id: 'acct-1', code: '1100', name: 'Cash' });
  });

  it('accumulates a running balance across rows for a debit-normal account', async () => {
    const { service } = makeService({
      window: { debit: '150.0000', credit: '30.0000', count: '3' },
      lines: [
        line({ id: 'l1', debit: '100.0000', credit: '0.0000' }),
        line({ id: 'l2', debit: '50.0000', credit: '0.0000' }),
        line({ id: 'l3', debit: '0.0000', credit: '30.0000' }),
      ],
    });
    const gl = await service.getLedger({ accountId: 'acct-1' });
    expect(gl.movements.map((m) => m.balance)).toEqual([
      '100.0000', '150.0000', '120.0000',
    ]);
    expect(gl.closingBalance).toBe('120.0000');
  });

  it('inverts the sign for a credit-normal account', async () => {
    const { service } = makeService({
      account: { ...account, type: AccountType.EQUITY },
      window: { debit: '0.0000', credit: '400.0000', count: '1' },
      lines: [line({ debit: '0.0000', credit: '400.0000' })],
    });
    const gl = await service.getLedger({ accountId: 'acct-1' });
    expect(gl.movements[0].balance).toBe('400.0000');
    expect(gl.closingBalance).toBe('400.0000');
  });

  it('reports window totals as scale-4 strings', async () => {
    const { service } = makeService({
      window: { debit: '100.0000', credit: '25.5000', count: '2' },
      lines: [
        line({ id: 'l1', debit: '100.0000', credit: '0.0000' }),
        line({ id: 'l2', debit: '0.0000', credit: '25.5000' }),
      ],
    });
    const gl = await service.getLedger({ accountId: 'acct-1' });
    expect(gl.totalDebit).toBe('100.0000');
    expect(gl.totalCredit).toBe('25.5000');
  });

  it('returns a zero opening balance when no fromDate is given', async () => {
    const { service } = makeService({ lines: [line()] });
    const gl = await service.getLedger({ accountId: 'acct-1' });
    expect(gl.openingBalance).toBe('0.0000');
  });

  it('#1146: applies sourceType to the opening-balance query as well as the window', async () => {
    const { service, openingQb } = makeService({
      opening: { debit: '1000.0000', credit: '0.0000' },
      lines: [line({ debit: '200.0000', credit: '0.0000' })],
    });
    await service.getLedger({
      accountId: 'acct-1', fromDate: '2026-07-01', sourceType: 'SALES_ORDER' as never,
    });
    const predicates = (openingQb.andWhere as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(predicates.some((p) => p.includes('sourceType'))).toBe(true);
  });

  it('computes pageOpeningBalance from the window opening plus the prefix aggregate', async () => {
    // opening (before fromDate) = 1000 debit; prefix (rows before page 2) = 300 debit
    const { service } = makeService({
      opening: { debit: '1000.0000', credit: '0.0000' },
      prefix: { debit: '300.0000', credit: '0.0000' },
      window: { debit: '900.0000', credit: '0.0000', count: '9' },
      lines: [line({ id: 'l4', debit: '50.0000', credit: '0.0000' })],
    });
    const gl = await service.getLedger({
      accountId: 'acct-1', fromDate: '2026-07-01', page: 2, limit: 3,
    });
    expect(gl.openingBalance).toBe('1000.0000');
    expect(gl.pageOpeningBalance).toBe('1300.0000');
    expect(gl.movements[0].balance).toBe('1350.0000');
  });

  it('derives closingBalance from the window aggregate, not from the last row of the page', async () => {
    const { service } = makeService({
      opening: { debit: '1000.0000', credit: '0.0000' },
      prefix: { debit: '300.0000', credit: '0.0000' },
      window: { debit: '900.0000', credit: '0.0000', count: '9' },
      lines: [line({ id: 'l4', debit: '50.0000', credit: '0.0000' })],
    });
    const gl = await service.getLedger({
      accountId: 'acct-1', fromDate: '2026-07-01', page: 2, limit: 3,
    });
    // window closing = 1000 + 900 = 1900, well past this page's last row (1350)
    expect(gl.closingBalance).toBe('1900.0000');
  });

  it('reports pageTotals separately from window totals', async () => {
    const { service } = makeService({
      window: { debit: '900.0000', credit: '100.0000', count: '9' },
      lines: [
        line({ id: 'l1', debit: '50.0000', credit: '0.0000' }),
        line({ id: 'l2', debit: '0.0000', credit: '20.0000' }),
      ],
    });
    const gl = await service.getLedger({ accountId: 'acct-1', page: 1, limit: 2 });
    expect(gl.totalDebit).toBe('900.0000');
    expect(gl.totalCredit).toBe('100.0000');
    expect(gl.pageTotals).toEqual({ debit: '50.0000', credit: '20.0000' });
  });

  it('mirrors window figures into page figures when unpaginated', async () => {
    const { service } = makeService({
      window: { debit: '150.0000', credit: '30.0000', count: '3' },
      lines: [
        line({ id: 'l1', debit: '100.0000', credit: '0.0000' }),
        line({ id: 'l2', debit: '50.0000', credit: '0.0000' }),
        line({ id: 'l3', debit: '0.0000', credit: '30.0000' }),
      ],
    });
    const gl = await service.getLedger({ accountId: 'acct-1' });
    expect(gl.pageOpeningBalance).toBe(gl.openingBalance);
    expect(gl.pageTotals).toEqual({ debit: gl.totalDebit, credit: gl.totalCredit });
    expect(gl.meta).toEqual({ total: 3 });
  });

  it('returns meta.page and meta.limit only when paginated', async () => {
    const { service } = makeService({
      window: { debit: '150.0000', credit: '0.0000', count: '7' },
      lines: [line()],
    });
    const gl = await service.getLedger({ accountId: 'acct-1', page: 2, limit: 3 });
    expect(gl.meta).toEqual({ total: 7, page: 2, limit: 3 });
  });

  it('degrades an out-of-range page to the closing balance with no rows', async () => {
    const { service } = makeService({
      opening: { debit: '1000.0000', credit: '0.0000' },
      // prefix over an offset past the end covers the whole window
      prefix: { debit: '900.0000', credit: '0.0000' },
      window: { debit: '900.0000', credit: '0.0000', count: '9' },
      lines: [],
    });
    const gl = await service.getLedger({
      accountId: 'acct-1', fromDate: '2026-07-01', page: 99, limit: 10,
    });
    expect(gl.movements).toEqual([]);
    expect(gl.pageTotals).toEqual({ debit: '0.0000', credit: '0.0000' });
    expect(gl.pageOpeningBalance).toBe(gl.closingBalance);
  });

  it('runs every read inside one REPEATABLE READ transaction', async () => {
    const { service, dataSource } = makeService({ lines: [line()] });
    await service.getLedger({ accountId: 'acct-1' });
    expect(dataSource.transaction).toHaveBeenCalledWith(
      'REPEATABLE READ',
      expect.any(Function),
    );
  });

  it('looks the account up inside the transaction manager, not a repository', async () => {
    const { service, manager } = makeService({ lines: [line()] });
    await service.getLedger({ accountId: 'acct-1' });
    expect(manager.findOne).toHaveBeenCalled();
  });

  it('skips the opening query entirely when no fromDate is given', async () => {
    const { service, openingQb } = makeService({ lines: [line()] });
    const gl = await service.getLedger({ accountId: 'acct-1' });
    expect(gl.openingBalance).toBe('0.0000');
    expect(openingQb.getRawOne).not.toHaveBeenCalled();
  });

  // The #1146 predicate test from Step 1 stays as written; it keeps passing
  // once `applyLedgerScope` is shared, and the new harness returns `openingQb`
  // under the same name.

  // ---- #1146: the approved invariant matrix.
  // opening + windowDebit - windowCredit === closing, in MINOR UNITS, for both
  // account polarities across all four filter combinations. The date+sourceType
  // cell is the one that fails on the pre-rewrite service.
  describe.each([
    ['debit-normal', AccountType.ASSET],
    ['credit-normal', AccountType.EQUITY],
  ])('report invariant (%s)', (_label, type) => {
    it.each([
      ['no filter', {}],
      ['date range', { fromDate: '2026-07-01', toDate: '2026-07-31' }],
      ['sourceType', { sourceType: 'SALES_ORDER' as never }],
      ['date range + sourceType', {
        fromDate: '2026-07-01', toDate: '2026-07-31', sourceType: 'SALES_ORDER' as never,
      }],
    ])('holds with %s', async (_name, filters: Record<string, unknown>) => {
      const { service } = makeService({
        account: { ...account, type },
        ...(filters.fromDate ? { opening: { debit: '1000.0000', credit: '0.0000' } } : {}),
        window: { debit: '500.0000', credit: '120.0000', count: '2' },
        lines: [
          line({ id: 'l1', debit: '500.0000', credit: '0.0000' }),
          line({ id: 'l2', debit: '0.0000', credit: '120.0000' }),
        ],
      });
      const gl = await service.getLedger({ accountId: 'acct-1', ...filters } as never);

      const opening = toMinorUnits(gl.openingBalance);
      const debit = toMinorUnits(gl.totalDebit);
      const credit = toMinorUnits(gl.totalCredit);
      const closing = toMinorUnits(gl.closingBalance);
      // naturalBalance flips the sign of the movement for credit-normal accounts.
      const signed = type === AccountType.EQUITY ? credit - debit : debit - credit;
      expect(opening + signed).toBe(closing);
    });
  });

  it('skips the prefix query on page 1', async () => {
    const { service, prefixQb } = makeService({
      window: { debit: '150.0000', credit: '0.0000', count: '5' },
      lines: [line()],
    });
    await service.getLedger({ accountId: 'acct-1', page: 1, limit: 3 });
    expect(prefixQb.getRawOne).not.toHaveBeenCalled();
  });
});
