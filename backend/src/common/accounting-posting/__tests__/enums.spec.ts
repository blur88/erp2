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

  it('appends new members last so ALTER TYPE ADD VALUE order matches', () => {
    const types = Object.values(PostingType);
    expect(types[types.length - 1]).toBe(PostingType.OWNER_STOCK_DRAWING);
    const sources = Object.values(AccountingSourceType);
    expect(sources[sources.length - 1]).toBe(AccountingSourceType.OWNER_EQUITY);
  });
});
