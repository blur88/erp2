import { jest } from '@jest/globals';
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

  // #1335: same trap as /providers.
  it('declares /eligible-methods before /:id', () => {
    const names = Object.getOwnPropertyNames(ProviderSettlementController.prototype);
    const methodsIndex = names.indexOf('eligibleMethods');
    const findOneIndex = names.indexOf('findOne');
    expect(methodsIndex).toBeGreaterThanOrEqual(0);
    expect(methodsIndex).toBeLessThan(findOneIndex);
  });

  it('passes the eligible-methods scope straight to the eligibility service', async () => {
    const eligibility = { listEligibleMethods: jest.fn(async () => [{ id: 'pm-1' }]) };
    const controller = new ProviderSettlementController({} as any, eligibility as any);
    const query = { settlementDate: '2026-09-20', settlementId: 'ps-1' };
    await expect(controller.eligibleMethods(query as any)).resolves.toEqual([{ id: 'pm-1' }]);
    expect(eligibility.listEligibleMethods).toHaveBeenCalledWith(query);
  });
});
