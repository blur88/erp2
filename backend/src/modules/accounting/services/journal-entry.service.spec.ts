import { JournalEntryService } from './journal-entry.service';
import { AccountingSourceType } from '../entities/source-type.enum';

describe('JournalEntryService.deriveStatus', () => {
  const svc = new JournalEntryService({} as any, {} as any);
  it('returns Reversed when a reversal exists', () => {
    expect(svc.deriveStatus({ id: 'e1' } as any, true)).toBe('Reversed');
  });
  it('returns Posted when none exists', () => {
    expect(svc.deriveStatus({ id: 'e1' } as any, false)).toBe('Posted');
  });
});

describe('JournalEntryService.entryTotals', () => {
  const svc = new JournalEntryService({} as any, {} as any);
  it('sums debit/credit in display scale', () => {
    const totals = svc.entryTotals([
      { debit: '500.0000', credit: '0.0000' },
      { debit: '0.0000', credit: '500.0000' },
    ]);
    expect(totals.totalDebit).toBe('500.0000');
    expect(totals.totalCredit).toBe('500.0000');
    expect(totals.difference).toBe('0.0000');
  });
});

describe('JournalEntryService.list filtering', () => {
  function makeQb() {
    const calls: { sql: string; params: any }[] = [];
    const order: string[] = [];
    const qb: any = {
      calls,
      order,
      leftJoinAndSelect: () => qb,
      andWhere: (sql: string, params?: any) => {
        calls.push({ sql, params });
        order.push(sql.includes('EXISTS') ? 'andWhere:EXISTS' : 'andWhere');
        return qb;
      },
      orderBy: (col: string, dir: string) => { qb._orderBy = { col, dir }; order.push('orderBy'); return qb; },
      skip: (n: number) => { qb._skip = n; order.push('skip'); return qb; },
      take: (n: number) => { qb._take = n; order.push('take'); return qb; },
      subQuery: () => ({
        select: () => ({
          from: () => ({
            where: () => ({ andWhere: () => ({ getQuery: () => '(SELECT 1)' }) }),
          }),
        }),
      }),
      getManyAndCount: async () => { order.push('getManyAndCount'); return [[], 0]; },
    };
    return qb;
  }

  function build(qb: any) {
    return new JournalEntryService(
      { createQueryBuilder: () => qb, find: async () => [] } as any,
      {} as any,
    );
  }

  it('applies an ILIKE OR-group for search', async () => {
    const qb = makeQb();
    await build(qb).list({ search: 'INV-1' });
    const where = qb.calls.find((c: any) => c.sql.includes('ILIKE'));
    expect(where).toBeDefined();
    expect(where.sql).toMatch(/journalNo.*ILIKE.*sourceRef.*ILIKE.*description.*ILIKE/s);
    expect(where.sql.startsWith('(')).toBe(true);
    expect(where.params).toEqual({ search: '%INV-1%' });
  });

  it('filters an inclusive date range on entryDate', async () => {
    const qb = makeQb();
    await build(qb).list({ fromDate: '2026-01-01', toDate: '2026-01-31' });
    expect(qb.calls.some((c: any) => c.sql.includes('>=') && c.params.fromDate === '2026-01-01')).toBe(true);
    expect(qb.calls.some((c: any) => c.sql.includes('<=') && c.params.toDate === '2026-01-31')).toBe(true);
  });

  it('filters sourceType directly', async () => {
    const qb = makeQb();
    await build(qb).list({ sourceType: AccountingSourceType.SALES_ORDER });
    expect(qb.calls.some((c: any) => c.params?.sourceType === 'SALES_ORDER')).toBe(true);
  });

  it('resolves Reversed via EXISTS', async () => {
    const qb = makeQb();
    await build(qb).list({ status: 'Reversed' });
    const exists = qb.calls.find((c: any) => c.sql.includes('EXISTS'));
    expect(exists).toBeDefined();
    expect(exists.sql.startsWith('NOT EXISTS')).toBe(false);
  });

  it('resolves Posted via NOT EXISTS', async () => {
    const qb = makeQb();
    await build(qb).list({ status: 'Posted' });
    expect(qb.calls.some((c: any) => c.sql.includes('NOT EXISTS'))).toBe(true);
  });

  it('applies the status predicate BEFORE skip/take', async () => {
    const qb = makeQb();
    await build(qb).list({ status: 'Reversed' });
    expect(qb.order.indexOf('andWhere:EXISTS')).toBeGreaterThan(-1);
    expect(qb.order.indexOf('andWhere:EXISTS'))
      .toBeLessThan(qb.order.indexOf('skip'));
    expect(qb.order.indexOf('skip')).toBeLessThan(qb.order.indexOf('getManyAndCount'));
  });

  it('reports the filtered total, not the unfiltered one', async () => {
    const qb = makeQb();
    qb.getManyAndCount = async () => [
      [],
      qb.order.includes('andWhere:EXISTS') ? 3 : 90,
    ];
    const result = await build(qb).list({ status: 'Reversed', limit: 25 });
    expect(result.meta.total).toBe(3);
    expect(result.meta.totalPages).toBe(1);
  });

  it('rejects an inverted date range', async () => {
    await expect(build(makeQb()).list({ fromDate: '2026-02-01', toDate: '2026-01-01' }))
      .rejects.toThrow(/fromDate/);
  });

  it('defaults to page 1, limit 25', async () => {
    const qb = makeQb();
    const result = await build(qb).list({});
    expect(qb._skip).toBe(0);
    expect(qb._take).toBe(25);
    expect(result.meta.page).toBe(1);
    expect(result.meta.limit).toBe(25);
  });
});

describe('JournalEntryService.list sorting', () => {
  function makeSortQb() {
    const qb: any = {
      leftJoinAndSelect: () => qb,
      andWhere: () => qb,
      orderBy: (col: string, dir: string) => { qb._orderBy = { col, dir }; return qb; },
      skip: () => qb,
      take: () => qb,
      subQuery: () => ({ select: () => ({ from: () => ({ where: () => ({ andWhere: () => ({ getQuery: () => '(SELECT 1)' }) }) }) }) }),
      getManyAndCount: async () => [[], 0],
    };
    return qb;
  }
  function buildSvc(qb: any) {
    return new JournalEntryService(
      { createQueryBuilder: () => qb, find: async () => [] } as any,
      {} as any,
    );
  }

  it('defaults to journalNo DESC when no sort params given', async () => {
    const qb = makeSortQb();
    await buildSvc(qb).list({});
    expect(qb._orderBy).toEqual({ col: 'e.journalNo', dir: 'DESC' });
  });

  it('applies journalNo ASC when requested', async () => {
    const qb = makeSortQb();
    await buildSvc(qb).list({ sortBy: 'journalNo', sortOrder: 'ASC' });
    expect(qb._orderBy).toEqual({ col: 'e.journalNo', dir: 'ASC' });
  });

  it('applies journalNo DESC when requested', async () => {
    const qb = makeSortQb();
    await buildSvc(qb).list({ sortBy: 'journalNo', sortOrder: 'DESC' });
    expect(qb._orderBy).toEqual({ col: 'e.journalNo', dir: 'DESC' });
  });

  it('applies the sort together with active filters', async () => {
    const qb = makeSortQb();
    const calls: any[] = [];
    qb.andWhere = (sql: string, params?: any) => { calls.push({ sql, params }); return qb; };
    await buildSvc(qb).list({ sortBy: 'journalNo', sortOrder: 'ASC', search: 'INV-1', status: 'Reversed' });
    // sort still applied…
    expect(qb._orderBy).toEqual({ col: 'e.journalNo', dir: 'ASC' });
    // …and the filters were not dropped
    expect(calls.some((c) => c.sql.includes('ILIKE'))).toBe(true);
    expect(calls.some((c) => c.sql.includes('EXISTS'))).toBe(true);
  });

  it('applies the sort together with pagination (page 2)', async () => {
    const qb = makeSortQb();
    qb.skip = (n: number) => { qb._skip = n; return qb; };
    qb.take = (n: number) => { qb._take = n; return qb; };
    await buildSvc(qb).list({ sortBy: 'journalNo', sortOrder: 'ASC', page: 2, limit: 25 });
    expect(qb._orderBy).toEqual({ col: 'e.journalNo', dir: 'ASC' });
    expect(qb._skip).toBe(25);
    expect(qb._take).toBe(25);
  });
});
