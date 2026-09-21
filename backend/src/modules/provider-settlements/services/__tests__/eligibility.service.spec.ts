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
    const service = new ProviderSettlementEligibilityService(manager);
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
    const service = new ProviderSettlementEligibilityService(manager);
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
    const service = new ProviderSettlementEligibilityService(manager);

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
    return new ProviderSettlementEligibilityService(manager);
  }
  const base = { providerPaymentMethodId: 'pm-1', settlementDate: '2026-09-20', settlementId: 'ps-1' };

  it('rejects a settlementId belonging to another provider', async () => {
    const service = serviceWith({ id: 'ps-1', status: 'DRAFT', providerPaymentMethodId: 'pm-OTHER' });
    await expect(service.listEligible(base)).rejects.toThrow(/does not belong to the requested provider/);
  });

  it('rejects a non-DRAFT settlementId', async () => {
    const service = serviceWith({ id: 'ps-1', status: 'POSTED', providerPaymentMethodId: 'pm-1' });
    await expect(service.listEligible(base)).rejects.toThrow(/Only a draft settlement/);
  });

  it('accepts its own draft', async () => {
    const service = serviceWith({ id: 'ps-1', status: 'DRAFT', providerPaymentMethodId: 'pm-1' });
    await expect(service.listEligible(base)).resolves.toBeDefined();
  });
});
