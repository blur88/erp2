import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder, SalesOrderPaymentStatus, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { Product } from '../../../database/entities/product.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { SalesOrderQueryService } from './sales-order-query.service';

describe('SalesOrderQueryService', () => {
  let service: SalesOrderQueryService;
  let salesOrderRepository: jest.Mocked<Repository<SalesOrder>>;
  let paymentRepository: jest.Mocked<Repository<SalesOrderPayment>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderQueryService,
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SalesOrderPayment),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(SalesOrderQueryService);
    salesOrderRepository = module.get(getRepositoryToken(SalesOrder));
    paymentRepository = module.get(getRepositoryToken(SalesOrderPayment));
  });

  describe('findById', () => {
    const baseOrder = {
      id: 'order-1',
      orderNumber: 'SO-000001',
      customerId: 'customer-1',
      orderDate: new Date('2026-01-01'),
      currency: 'USD',
      status: SalesOrderStatus.DRAFT,
      paymentStatus: SalesOrderPaymentStatus.PARTIAL,
      subtotal: 200,
      shippingAmount: 0,
      totalAmount: 200,
      items: [],
      customer: { id: 'customer-1', name: 'Acme' } as Customer,
    } as SalesOrder;

    it('maps direct sales order payment records onto the response', async () => {
      salesOrderRepository.findOne.mockResolvedValue(baseOrder);
      paymentRepository.find.mockResolvedValue([
        {
          id: 'pay-1',
          amount: 100,
          paymentDate: '2026-01-02',
          paymentMethodId: 'method-1',
        } as SalesOrderPayment,
      ]);

      const result = await service.findById('order-1');

      expect(paymentRepository.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { salesOrderId: 'order-1' },
        order: { paymentDate: 'ASC' },
      }));
      expect(result).toMatchObject({
        id: 'order-1',
        status: SalesOrderStatus.DRAFT,
        paymentStatus: SalesOrderPaymentStatus.PARTIAL,
        payments: [expect.objectContaining({ id: 'pay-1', amount: 100 })],
      });
    });

    it('throws NotFoundException when order does not exist', async () => {
      salesOrderRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow('Sales order not found');
    });
  });
});
