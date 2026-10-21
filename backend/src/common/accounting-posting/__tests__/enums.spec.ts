import { PostingType, AccountingSourceType } from '../enums';

describe('owner equity posting enums', () => {
  it('exposes the five owner-equity posting types', () => {
    expect(PostingType.OWNER_CAPITAL_INJECTION).toBe('OWNER_CAPITAL_INJECTION');
    expect(PostingType.OWNER_CAPITAL_INJECTION_REFUND).toBe('OWNER_CAPITAL_INJECTION_REFUND');
    expect(PostingType.OWNER_CASH_DRAWING).toBe('OWNER_CASH_DRAWING');
    expect(PostingType.OWNER_CASH_DRAWING_REFUND).toBe('OWNER_CASH_DRAWING_REFUND');
    expect(PostingType.OWNER_STOCK_DRAWING).toBe('OWNER_STOCK_DRAWING');
  });

  it('exposes the OWNER_EQUITY source type', () => {
    expect(AccountingSourceType.OWNER_EQUITY).toBe('OWNER_EQUITY');
  });

  it('preserves migration order for provider settlements and inventory opening', () => {
    const types = Object.values(PostingType);
    expect(types.slice(-2)).toEqual([PostingType.PROVIDER_SETTLEMENT, PostingType.INVENTORY_OPENING]);
    const sources = Object.values(AccountingSourceType);
    expect(sources.slice(-2)).toEqual([AccountingSourceType.PROVIDER_SETTLEMENT, AccountingSourceType.PRODUCT]);
  });
});
