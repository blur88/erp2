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

  // #1289: otherwise GET /providers is routed to findOne and 400s as a bad uuid.
  it('declares /providers before /:id', () => {
    const names = Object.getOwnPropertyNames(ProviderSettlementController.prototype);
    const providersIndex = names.indexOf('providers');
    const findOneIndex = names.indexOf('findOne');
    expect(providersIndex).toBeGreaterThanOrEqual(0);
    expect(providersIndex).toBeLessThan(findOneIndex);
  });
});
