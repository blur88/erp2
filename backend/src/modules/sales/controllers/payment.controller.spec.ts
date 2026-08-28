import { jest } from '@jest/globals';
import { PaymentController } from './payment.controller';
import { PaymentService } from '../services/payment.service';

describe('PaymentController', () => {
  let controller: PaymentController;
  let paymentService: Pick<PaymentService, 'getPaymentStatistics' | 'allocatePayment'>;

  beforeEach(() => {
    paymentService = {
      getPaymentStatistics: (jest.fn as unknown as any)().mockResolvedValue({ totalPayments: 0 }),
      allocatePayment: (jest.fn as unknown as any)().mockResolvedValue({ id: 'p-1' }),
    } as any;

    controller = new PaymentController(paymentService as PaymentService);
  });

  it('passes validated statistics query values to getPaymentStatistics', async () => {
    await controller.getPaymentStatistics({
      customerId: '550e8400-e29b-41d4-a716-446655440000',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    });

    expect(paymentService.getPaymentStatistics).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      new Date('2026-01-01'),
      new Date('2026-01-31'),
    );
  });

  // POST /payments/allocate has no :id route segment. Sourcing the payment id
  // from @Param('id') made every request fail ParseUUIDPipe with a 400; the id
  // must come from the validated body.
  describe('allocatePayment', () => {
    const paymentId = '550e8400-e29b-41d4-a716-446655440001';
    const allocationDto = {
      paymentId,
      allocations: [
        { salesOrderId: '550e8400-e29b-41d4-a716-446655440002', amount: '750.2500' },
      ],
    } as any;

    it('passes the body paymentId through to the service', async () => {
      await controller.allocatePayment(allocationDto);

      expect(paymentService.allocatePayment).toHaveBeenCalledWith(paymentId, allocationDto);
    });

    it('takes the payment id from the body only — the handler accepts a single argument', () => {
      // A second (route-param) parameter would reintroduce the 400-on-every-request
      // bug, since the route declares no :id segment.
      expect(controller.allocatePayment).toHaveLength(1);
    });

    it('returns the service result', async () => {
      await expect(controller.allocatePayment(allocationDto)).resolves.toEqual({ id: 'p-1' });
    });
  });
});
