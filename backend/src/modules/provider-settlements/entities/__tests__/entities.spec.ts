import { getMetadataArgsStorage } from 'typeorm';
import { ProviderSettlement, ProviderSettlementStatus } from '../provider-settlement.entity';
import { ProviderSettlementLine } from '../provider-settlement-line.entity';
import { AccountingSourceType, PostingType } from '../../../../common/accounting-posting/enums';

describe('provider settlement entities', () => {
  it('declares the settlement table with its status enum', () => {
    const table = getMetadataArgsStorage().tables.find((t) => t.target === ProviderSettlement);
    expect(table?.name).toBe('provider_settlements');
    expect(Object.values(ProviderSettlementStatus)).toEqual(['DRAFT', 'POSTED', 'REVERSED']);
  });

  it('claims are enforced by a partial unique index keyed on releasedAt', () => {
    const idx = getMetadataArgsStorage().indices.find(
      (i) => i.target === ProviderSettlementLine && i.unique,
    );
    expect(idx).toBeDefined();
    expect(idx!.columns).toEqual(['salesOrderPaymentId']);
    // The predicate MUST be releasedAt, not deletedAt: a soft-deleted line
    // would otherwise keep its claim forever.
    expect(idx!.where).toBe('"releasedAt" IS NULL');
  });

  it('appends its posting enum members last so ALTER TYPE order matches', () => {
    const sources = Object.values(AccountingSourceType);
    expect(sources[sources.length - 1]).toBe('PROVIDER_SETTLEMENT');
    const postings = Object.values(PostingType);
    expect(postings[postings.length - 1]).toBe('PROVIDER_SETTLEMENT');
  });
});
