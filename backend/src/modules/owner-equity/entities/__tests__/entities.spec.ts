import { OwnerEquityType, OwnerEquityDocumentStatus, OwnerEquitySettlementStatus } from '../owner-equity-document.entity';

describe('owner equity enums', () => {
  it('has three transaction types', () => {
    expect(Object.values(OwnerEquityType)).toEqual([
      'CAPITAL_INJECTION', 'CASH_DRAWING', 'STOCK_DRAWING',
    ]);
  });
  it('has four document statuses', () => {
    expect(Object.values(OwnerEquityDocumentStatus)).toEqual([
      'DRAFT', 'READY', 'COMPLETED', 'CANCELLED',
    ]);
  });
  it('has four settlement statuses', () => {
    expect(Object.values(OwnerEquitySettlementStatus)).toEqual([
      'UNSETTLED', 'PARTIAL', 'SETTLED', 'OVERSETTLED',
    ]);
  });
});
