import { ProviderSettlementController } from '../provider-settlement.controller';

describe('ProviderSettlementController', () => {
  it('declares /eligible-rows before /:id', () => {
    const names = Object.getOwnPropertyNames(ProviderSettlementController.prototype);
    const rowsIndex = names.indexOf('eligibleRows');
    const findOneIndex = names.indexOf('findOne');
    expect(rowsIndex).toBeGreaterThanOrEqual(0);
    expect(findOneIndex).toBeGreaterThanOrEqual(0);
    expect(rowsIndex).toBeLessThan(findOneIndex);
  });
});
