import { ProviderSettlementController } from '../provider-settlement.controller';

describe('ProviderSettlementController', () => {
  it('declares /eligible-payments before /:id', () => {
    // NestJS matches in declaration order: if /:id came first it would treat
    // "eligible-payments" as a uuid and fail.
    const proto = ProviderSettlementController.prototype;
    const names = Object.getOwnPropertyNames(proto);
    const eligibleIndex = names.indexOf('eligiblePayments');
    const findOneIndex = names.indexOf('findOne');
    // indexOf returns -1 for a renamed method, and -1 < any real index is
    // TRUE — so without these guards renaming eligiblePayments would leave the
    // test green. Pin both, then compare.
    expect(eligibleIndex).toBeGreaterThanOrEqual(0);
    expect(findOneIndex).toBeGreaterThanOrEqual(0);
    expect(eligibleIndex).toBeLessThan(findOneIndex);
  });

  it('declares /eligible-rows before /:id', () => {
    const names = Object.getOwnPropertyNames(ProviderSettlementController.prototype);
    const rowsIndex = names.indexOf('eligibleRows');
    const findOneIndex = names.indexOf('findOne');
    expect(rowsIndex).toBeGreaterThanOrEqual(0);
    expect(findOneIndex).toBeGreaterThanOrEqual(0);
    expect(rowsIndex).toBeLessThan(findOneIndex);
  });
});
