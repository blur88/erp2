import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { ProviderSettlementEligibilityService } from '../provider-settlement-eligibility.service';

describe('ProviderSettlementEligibilityService claim predicate', () => {
  function captureQuery() {
    const qb: any = {
      sql: [] as string[],
      params: {} as Record<string, unknown>,
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      // The implementation calls getRawMany() + getCount(); getManyAndCount is
      // NOT used. A mock offering the wrong method throws at call time.
      getCount: (jest.fn() as any).mockResolvedValue(0),
      getMany: (jest.fn() as any).mockResolvedValue([]),
      getRawMany: (jest.fn() as any).mockResolvedValue([]),
    };
    qb.where = jest.fn((sql: string, params?: any) => {
      qb.sql.push(sql);
      Object.assign(qb.params, params ?? {});
      return qb;
    });
    qb.andWhere = qb.where;
    const manager: any = {
      getRepository: () => ({
        createQueryBuilder: () => qb,
        // A supplied settlementId is validated as the caller's own draft before
        // the claim clause is built, so the stub must answer findOne.
        findOne: (jest.fn() as any).mockResolvedValue({
          id: 'ps-1',
          status: 'DRAFT',
          providerPaymentMethodId: 'pm-1',
        }),
      }),
      createQueryBuilder: () => qb,
    };
    return { qb, manager };
  }

  it('excludes EVERY live claim when no settlementId is supplied', async () => {
    const { qb, manager } = captureQuery();
    const service = new ProviderSettlementEligibilityService(manager, { list: jest.fn(async () => []) } as any);
    await service.listEligible({
      providerPaymentMethodId: 'pm-1',
      settlementDate: '2026-09-20',
    });

    const claimClause = qb.sql.find((s: string) => s.includes('provider_settlement_lines'));
    expect(claimClause).toBeDefined();
    expect(claimClause).toContain('"releasedAt" IS NULL');
    // THE BUG THIS GUARDS: binding NULL into `"settlementId" <> :settlementId`
    // makes the comparison NULL, never TRUE, so the inner query matches nothing,
    // NOT EXISTS is vacuously true, and EVERY claimed row looks eligible. The
    // no-id branch must omit the comparison ENTIRELY.
    expect(claimClause).not.toContain('settlementId" <>');
    expect(qb.params).not.toHaveProperty('settlementId');
  });

  it("includes its own settlement's claims when a settlementId is supplied", async () => {
    const { qb, manager } = captureQuery();
    const service = new ProviderSettlementEligibilityService(manager, { list: jest.fn(async () => []) } as any);
    await service.listEligible({
      providerPaymentMethodId: 'pm-1',
      settlementDate: '2026-09-20',
      settlementId: 'ps-1',
    });

    const claimClause = qb.sql.find((s: string) => s.includes('provider_settlement_lines'));
    expect(claimClause).toContain('"releasedAt" IS NULL');
    expect(claimClause).toContain('"settlementId" <> :settlementId');
    expect(qb.params.settlementId).toBe('ps-1');
  });

  it('rejects missing payments with a structured 409 naming every unavailable id', async () => {
    const { manager } = captureQuery();
    const service = new ProviderSettlementEligibilityService(manager, { list: jest.fn(async () => []) } as any);

    // getMany() resolves [] in this harness, so every submitted id is missing.
    const error = await service
      .assertEligible(
        ['pay-x'],
        { providerPaymentMethodId: 'pm-1', settlementDate: '2026-09-20' },
        manager,
      )
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(error).toBeInstanceOf(ConflictException);
    const response = (error as ConflictException).getResponse() as {
      message: { text: string; unavailablePaymentIds: string[] };
    };
    expect(response.message.unavailablePaymentIds).toEqual(['pay-x']);
    expect(response.message.text).toMatch(/no longer eligible/);
  });
});

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
    return new ProviderSettlementEligibilityService(manager, { list: jest.fn(async () => []) } as any);
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
    const mapping: any = { list: jest.fn() };
    return { qb, manager, service: new ProviderSettlementEligibilityService(manager, mapping) };
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

describe('allowedMethodIds', () => {
  const mappingRows = [
    { paymentMethodId: 'pm-mapped', status: 'mapped' },
    { paymentMethodId: 'pm-unmapped', status: 'unmapped' },
    { paymentMethodId: 'pm-invalid', status: 'invalid' },
  ];

  it('lists mapped methods only when no draft is given', async () => {
    const service = new ProviderSettlementEligibilityService({} as any, { list: jest.fn(async () => mappingRows) } as any);
    expect(await (service as any).allowedMethodIds(undefined)).toEqual(['pm-mapped']);
  });

  it("adds the draft's stored method even when it is no longer mapped", async () => {
    const service = new ProviderSettlementEligibilityService({} as any, { list: jest.fn(async () => mappingRows) } as any);
    const ids = await (service as any).allowedMethodIds({ providerPaymentMethodId: 'pm-unmapped' });
    expect(ids.sort()).toEqual(['pm-mapped', 'pm-unmapped']);
    expect(ids).not.toContain('pm-invalid');
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
      query: (jest.fn() as any)
        .mockResolvedValueOnce([{ total: 1 }])
        // A deliberately DISAGREEING SQL net: the result must not use it.
        .mockResolvedValueOnce([{ salesOrderId: 'so-1', paymentMethodId: 'pm-1', netAmount: '100.0000', orderNumber: 'SO-1', paymentMethodName: 'TikTok' }]),
    };
    const outside = () => { throw new Error('read outside the snapshot'); };
    const defaultManager: any = {
      transaction: jest.fn(async (iso: string, cb: any) => cb(tx)),
      query: jest.fn(outside),
      getRepository: jest.fn(outside),
    };
    const mapping: any = { list: jest.fn(async () => [{ paymentMethodId: 'pm-1', status: 'mapped' }]) };
    const service = new ProviderSettlementEligibilityService(defaultManager, mapping);

    const res = await service.listEligibleRows({ settlementDate: '2026-09-20' });

    expect(defaultManager.transaction.mock.calls[0][0]).toBe('REPEATABLE READ');
    expect(mapping.list).toHaveBeenCalledWith(tx);
    expect(res.data[0].netAmount).toBe('70.0000');
    expect(res.data[0].payments.map((p: any) => p.id)).toEqual(['p1', 'r1']);
  });
});
