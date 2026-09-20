import { ProviderSettlementController } from '../provider-settlement.controller';

describe('ProviderSettlementController', () => {
  it('declares /eligible-payments before /:id', () => {
    // NestJS matches in declaration order: if /:id came first it would treat
    // "eligible-payments" as a uuid and fail.
    const proto = ProviderSettlementController.prototype;
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('eligiblePayments')).toBeLessThan(names.indexOf('findOne'));
  });
});
