import { BadRequestException } from '@nestjs/common';
import { AccountType } from '../entities/account-type.enum';
import { GeneralLedgerService } from './general-ledger.service';

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
    lines?: unknown[];
  }) {
    const coaRepo = {
      findOne: jest.fn(async () => ('account' in opts ? opts.account : account)),
    };
    const openingQb = makeQb('opening', { raw: opts.opening ?? { debit: '0', credit: '0' } });
    const rowsQb = makeQb('rows', { entities: opts.lines ?? [] });
    let call = 0;
    const lineRepo = {
      createQueryBuilder: jest.fn(() => (call++ === 0 && opts.opening ? openingQb : rowsQb)),
    };
    const balance = {
      naturalBalance: (type: AccountType, raw: bigint) =>
        type === AccountType.LIABILITY || type === AccountType.EQUITY || type === AccountType.INCOME
          ? -raw
          : raw,
    };
    const service = new GeneralLedgerService(coaRepo as never, lineRepo as never, balance as never);
    return { service, coaRepo, lineRepo, openingQb, rowsQb };
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
      lines: [line({ debit: '0.0000', credit: '400.0000' })],
    });
    const gl = await service.getLedger({ accountId: 'acct-1' });
    expect(gl.movements[0].balance).toBe('400.0000');
    expect(gl.closingBalance).toBe('400.0000');
  });

  it('reports window totals as scale-4 strings', async () => {
    const { service } = makeService({
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

});