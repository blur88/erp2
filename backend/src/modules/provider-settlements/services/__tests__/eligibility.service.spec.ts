import { jest } from '@jest/globals';
import { ProviderSettlementEligibilityService } from '../provider-settlement-eligibility.service';

describe('settlementId validation', () => {
  function serviceWith(settlement: any) {
    const manager: any = {
      getRepository: () => ({
        findOne: (jest.fn() as any).mockResolvedValue(settlement),
        createQueryBuilder: () => ({
          innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(), addOrderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
          getRawMany: (jest.fn() as any).mockResolvedValue([]), getCount: (jest.fn() as any).mockResolvedValue(0),
        }),
      }),
    };
    return new ProviderSettlementEligibilityService(
      manager,
      { resolveAccount: jest.fn(async () => ({ id: 'dep' })) } as any,
      { deriveClearingAccountId: jest.fn() } as any,
    );
  }

  it('rejects a non-DRAFT settlementId', async () => {
    const service = serviceWith({ id: 'ps-1', status: 'POSTED', providerPaymentMethodId: 'pm-1' });
    await expect(service.assertOwnDraft('ps-1')).rejects.toThrow(/Only a draft settlement/);
  });

  it('accepts its own draft', async () => {
    const service = serviceWith({ id: 'ps-1', status: 'DRAFT', providerPaymentMethodId: 'pm-1' });
    await expect(service.assertOwnDraft('ps-1')).resolves.toBeDefined();
  });
});

describe('eligiblePaymentsForOrders — shared builder', () => {
  function harness() {
    const qb: any = { sql: [] as string[], params: {} as Record<string, unknown> };
    for (const m of ['innerJoin', 'select', 'orderBy', 'addOrderBy']) qb[m] = jest.fn().mockReturnValue(qb);
    qb.where = jest.fn((sql: string, params?: any) => { qb.sql.push(sql); Object.assign(qb.params, params ?? {}); return qb; });
    qb.andWhere = qb.where;
    qb.getRawMany = (jest.fn() as any).mockResolvedValue([]);
    const manager: any = { getRepository: () => ({ createQueryBuilder: () => qb }) };
    return {
      qb,
      manager,
      service: new ProviderSettlementEligibilityService(
        manager,
        { resolveAccount: jest.fn(async () => ({ id: 'dep' })) } as any,
        { deriveClearingAccountId: jest.fn() } as any,
      ),
    };
  }

  it('omits the settlementId comparison entirely when none is given', async () => {
    const { qb, manager, service } = harness();
    await service.eligiblePaymentsForOrders(['so-1'], { settlementDate: '2026-09-20' }, manager);
    const claim = qb.sql.find((s: string) => s.includes('provider_settlement_lines'));
    expect(claim).toContain('"releasedAt" IS NULL');
    expect(claim).not.toContain('settlementId" <>');
    expect(qb.params).not.toHaveProperty('settlementId');
  });

  it('keeps its own draft claims eligible when settlementId is given', async () => {
    const { qb, manager, service } = harness();
    await service.eligiblePaymentsForOrders(['so-1'], { settlementDate: '2026-09-20', settlementId: 'ps-1' }, manager);
    const claim = qb.sql.find((s: string) => s.includes('provider_settlement_lines'));
    expect(claim).toContain('"settlementId" <> :settlementId');
    expect(qb.params.settlementId).toBe('ps-1');
  });

  it('applies the date cutoff and NO mapping filter or HAVING', async () => {
    const { qb, manager, service } = harness();
    await service.eligiblePaymentsForOrders(['so-1'], { settlementDate: '2026-09-20' }, manager);
    expect(qb.sql.some((s: string) => s.includes('"paymentDate" <= :settlementDate'))).toBe(true);
    expect(qb.sql.join(' ')).not.toMatch(/HAVING|payment_method_account_mappings/i);
  });

  it('returns nothing without querying for an empty order list', async () => {
    const { qb, manager, service } = harness();
    await expect(service.eligiblePaymentsForOrders([], { settlementDate: '2026-09-20' }, manager)).resolves.toEqual([]);
    expect(qb.getRawMany).not.toHaveBeenCalled();
  });
});

describe('listEligibleRows — one snapshot', () => {
  it('reads count, groups and details in ONE repeatable-read transaction and derives net from the details', async () => {
    const qb: any = {};
    for (const m of ['innerJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy']) qb[m] = jest.fn().mockReturnValue(qb);
    qb.getQueryAndParameters = jest.fn().mockReturnValue(['SELECT 1', []]);
    qb.getRawMany = (jest.fn() as any).mockResolvedValue([
      { id: 'p1', salesOrderId: 'so-1', paymentMethodId: 'pm-1', paymentDate: '2026-09-01', amount: '100.0000', referenceNumber: null },
      { id: 'r1', salesOrderId: 'so-1', paymentMethodId: 'pm-1', paymentDate: '2026-09-02', amount: '-30.0000', referenceNumber: null },
    ]);
    const tx: any = {
      getRepository: () => ({ createQueryBuilder: () => qb }),
      query: (jest.fn() as any).mockImplementation(async (sql: string) => {
        if (sql.includes('AS total')) return [{ total: 1 }];
        // A deliberately DISAGREEING SQL net: the result must not use it.
        return [{ salesOrderId: 'so-1', paymentMethodId: 'pm-1', netAmount: '100.0000', orderNumber: 'SO-1', paymentMethodName: 'TikTok' }];
      }),
    };
    const outside = () => { throw new Error('read outside the snapshot'); };
    const defaultManager: any = {
      transaction: jest.fn(async (iso: string, cb: any) => cb(tx)),
      query: jest.fn(outside),
      getRepository: jest.fn(outside),
    };
    const service = new ProviderSettlementEligibilityService(
      defaultManager,
      { resolveAccount: jest.fn(async () => ({ id: 'dep' })) } as any,
      { deriveClearingAccountId: jest.fn() } as any,
    );

    const res = await service.listEligibleRows({ settlementDate: '2026-09-20' });

    expect(defaultManager.transaction.mock.calls[0][0]).toBe('REPEATABLE READ');
    expect(res.data[0].netAmount).toBe('70.0000');
    expect(res.data[0].payments.map((p: any) => p.id)).toEqual(['p1', 'r1']);
  });
});

describe('listEligibleRows — no mapping gate (#1288)', () => {
  // SQL SHAPE only: the mocked query returns its row whatever the SQL says. The
  // behaviour (remapped/unmapped/invalid methods listed, every-payment rule) is
  // proven against real Postgres in test/provider-settlements.e2e-spec.ts.
  it('builds the group query with no payment-method filter and the journal gate as one aggregate', async () => {
    const qb: any = {};
    for (const m of ['innerJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy']) qb[m] = jest.fn().mockReturnValue(qb);
    qb.getQueryAndParameters = jest.fn().mockReturnValue(['SELECT 1', []]);
    qb.getRawMany = (jest.fn() as any).mockResolvedValue([
      { id: 'p1', salesOrderId: 'so-1', paymentMethodId: 'pm-remapped', paymentDate: '2026-09-01', amount: '40.0000', referenceNumber: null },
    ]);
    const sql: string[] = [];
    const tx: any = {
      getRepository: () => ({ createQueryBuilder: () => qb }),
      query: (jest.fn() as any).mockImplementation(async (q: string) => {
        sql.push(q);
        if (q.includes('AS total')) return [{ total: 1 }];
        return [{ salesOrderId: 'so-1', paymentMethodId: 'pm-remapped', netAmount: '40.0000', orderNumber: 'SO-1', paymentMethodName: 'Shopee' }];
      }),
    };
    const defaultManager: any = { transaction: jest.fn(async (_iso: string, cb: any) => cb(tx)) };
    const service = new ProviderSettlementEligibilityService(
      defaultManager,
      { resolveAccount: jest.fn(async () => ({ id: 'dep' })) } as any,
      { deriveClearingAccountId: jest.fn() } as any,
    );

    const res = await service.listEligibleRows({ settlementDate: '2026-09-20' });

    expect(res.data.map((r) => r.paymentMethodId)).toEqual(['pm-remapped']);
    const groups = sql.find((q) => q.includes('AS total'))!;
    expect(groups).not.toMatch(/g\."paymentMethodId" = ANY/);
    // The journal gate is still the filter.
    expect(groups).toContain('bool_and(a."isProviderClearing" IS TRUE)');
    expect(groups).toContain('count(DISTINCT d."clearingAccountId")');
  });
});

describe('listClaimedRows — one snapshot', () => {
  it('listClaimedRows reads lines and current eligibility inside ONE repeatable-read transaction', async () => {
    const qb: any = {};
    for (const m of ['innerJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy']) qb[m] = jest.fn().mockReturnValue(qb);
    qb.getRawMany = (jest.fn() as any).mockResolvedValue([]);
    const tx: any = {
      getRepository: () => ({
        createQueryBuilder: () => qb,
        findOne: (jest.fn() as any).mockResolvedValue({ id: 'ps-1', status: 'DRAFT', providerPaymentMethodId: 'pm-1' }),
      }),
      query: (jest.fn() as any).mockResolvedValue([
        { id: 'p1', salesOrderId: 'so-1', paymentMethodId: 'pm-1', paymentDate: '2026-09-01', amount: '10.0000', referenceNumber: null, orderNumber: 'SO-1', paymentMethodName: 'TikTok' },
      ]),
    };
    const outside = () => { throw new Error('read outside the snapshot'); };
    const defaultManager: any = {
      transaction: jest.fn(async (iso: string, cb: any) => cb(tx)),
      query: jest.fn(outside), getRepository: jest.fn(outside),
    };
    const service = new ProviderSettlementEligibilityService(
      defaultManager,
      { resolveAccount: jest.fn(async () => ({ id: 'dep' })) } as any,
      { deriveClearingAccountId: jest.fn() } as any,
    );
    const res = await service.listClaimedRows('ps-1', '2026-09-20');
    expect(defaultManager.transaction.mock.calls[0][0]).toBe('REPEATABLE READ');
    expect(res.data[0].state).toBe('ineligible');
  });
});

describe('listClaimedRows — provider clearing (#1285)', () => {
  function harness(current: any[]) {
    const saved = [{ id: 'pay-A', salesOrderId: 'so-1', paymentMethodId: 'pm-1', paymentDate: '2026-09-01',
      amount: '40.0000', referenceNumber: null, orderNumber: 'SO-1', paymentMethodName: 'CIMB' }];
    const manager: any = {
      query: jest.fn(async () => saved),
      getRepository: () => ({ findOne: jest.fn(async () => ({ id: 'acc-1200', isProviderClearing: false })) }),
      transaction: jest.fn(async (_iso: string, cb: any) => cb(manager)),
    };
    const derivation = { deriveClearingAccountId: jest.fn(async () => 'acc-1200') };
    const service = new ProviderSettlementEligibilityService(
      manager, { resolveAccount: jest.fn() } as any, derivation as any,
    );
    jest.spyOn(service, 'assertOwnDraft').mockResolvedValue({ id: 'ps-1' } as any);
    jest.spyOn(service, 'eligiblePaymentsForOrders').mockResolvedValue(current as any);
    return { service, derivation };
  }

  it('keeps an ineligible group ineligible WITHOUT calling the derivation', async () => {
    const { service, derivation } = harness([]); // no current eligible payments
    const { data } = await service.listClaimedRows('ps-1', '2026-09-20');
    expect(data.map((d) => d.state)).toEqual(['ineligible']);
    expect(derivation.deriveClearingAccountId).not.toHaveBeenCalled();
  });

  it('reclassifies a current group whose saved payments derive to an unflagged account', async () => {
    const { service, derivation } = harness([
      { id: 'pay-A', salesOrderId: 'so-1', paymentMethodId: 'pm-1', paymentDate: '2026-09-01', amount: '40.0000', referenceNumber: null },
    ]);
    const { data } = await service.listClaimedRows('ps-1', '2026-09-20');
    expect(data.map((d) => d.state)).toEqual(['not_provider_clearing']);
    expect(derivation.deriveClearingAccountId).toHaveBeenCalledTimes(1);
  });
});
