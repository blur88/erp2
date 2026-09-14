import { jest } from '@jest/globals';
import { PaymentMethodMappingController } from './payment-method-mapping.controller';
import { NoDuplicatePaymentMethodIds } from '../dto/bulk-update-payment-method-mappings.dto';

describe('PaymentMethodMappingController', () => {
  it('returns the service rows from GET', async () => {
    const service = { list: (jest.fn as unknown as any)().mockResolvedValue([{ paymentMethodId: 'pm-1' }]) };
    const controller = new PaymentMethodMappingController(service as any);
    await expect(controller.list()).resolves.toEqual([{ paymentMethodId: 'pm-1' }]);
  });

  it('forwards the mappings array on PUT', async () => {
    const service = { list: (jest.fn as unknown as any)(), setMappings: (jest.fn as unknown as any)() };
    const controller = new PaymentMethodMappingController(service as any);
    const mappings = [{ paymentMethodId: 'pm-1', accountId: 'a-1' }];
    await controller.update({ mappings } as any);
    expect(service.setMappings).toHaveBeenCalledWith(mappings);
  });

  it('forwards an explicit null accountId as a clear', async () => {
    const service = { list: (jest.fn as unknown as any)(), setMappings: (jest.fn as unknown as any)() };
    const controller = new PaymentMethodMappingController(service as any);
    await controller.update({ mappings: [{ paymentMethodId: 'pm-1', accountId: null }] } as any);
    expect(service.setMappings).toHaveBeenCalledWith([{ paymentMethodId: 'pm-1', accountId: null }]);
  });
});

describe('NoDuplicatePaymentMethodIds', () => {
  it('rejects a payload repeating a payment method', () => {
    const v = new NoDuplicatePaymentMethodIds();
    expect(v.validate([{ paymentMethodId: 'pm-1' }, { paymentMethodId: 'pm-1' }])).toBe(false);
  });

  it('accepts distinct payment methods', () => {
    const v = new NoDuplicatePaymentMethodIds();
    expect(v.validate([{ paymentMethodId: 'pm-1' }, { paymentMethodId: 'pm-2' }])).toBe(true);
  });
});
