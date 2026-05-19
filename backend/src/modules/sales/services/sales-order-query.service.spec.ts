import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Product } from '../../../database/entities/product.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { SalesOrderQueryService } from './sales-order-query.service';

describe('SalesOrderQueryService', () => {
  let service: SalesOrderQueryService;
  let salesOrderRepository: jest.Mocked<Repository<SalesOrder>>;

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
          provide: getRepositoryToken(Product),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Invoice),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get(SalesOrderQueryService);
    salesOrderRepository = module.get(getRepositoryToken(SalesOrder));
  });

  it('returns the previous sequential order when it exists', async () => {
    salesOrderRepository.findOne.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'SO-000001',
      customerId: 'customer-1',
      orderDate: new Date('2026-01-01T00:00:00.000Z'),
      totalAmount: 100,
      paidAmount: 0,
      balanceDue: 100,
      isFulfilled: false,
      isPaidInFull: false,
      customer: {
        id: 'customer-1',
        name: 'Acme',
      } as Customer,
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          quantity: 1,
          unitPrice: 100,
          totalAmount: 100,
          product: {
            id: 'product-1',
            name: 'Widget',
          } as Product,
        } as SalesOrderItem,
      ],
    } as SalesOrder);

    const result = await service.findPreviousOrder('SO-000002');

    expect(salesOrderRepository.findOne).toHaveBeenCalledWith({
      where: { orderNumber: 'SO-000001' },
      relations: { customer: true, items: { product: true } },
      withDeleted: true,
    });
    expect(result).toMatchObject({
      id: 'order-1',
      orderNumber: 'SO-000001',
      customer: { name: 'Acme' },
      items: [
        expect.objectContaining({
          productId: 'product-1',
        }),
      ],
    });
  });

  describe('findById', () => {
    function makeQueryBuilder(result: SalesOrder | null) {
      return {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(result),
      } as any;
    }

    const baseOrder: SalesOrder = {
      id: 'order-1',
      orderNumber: 'SO-000001',
      customerId: 'customer-1',
      orderDate: new Date('2026-01-01'),
      totalAmount: 200,
      paidAmount: 100,
      balanceDue: 100,
      isFulfilled: true,
      isPaidInFull: false,
      invoices: [
        {
          id: 'invoice-1',
          invoiceNumber: 'INV-000001',
          payments: [
            { id: 'pay-1', paymentNumber: 'PAY-1', amount: 50, paymentDate: new Date(), isActive: true, deletedAt: null } as Payment,
          ],
        } as any,
      ],
      items: [],
      customer: { id: 'customer-1', name: 'Acme' } as Customer,
    } as SalesOrder;

    let paymentRepository: jest.Mocked<Repository<Payment>>;

    beforeEach(() => {
      paymentRepository = service['paymentRepository'] as jest.Mocked<Repository<Payment>>;
    });

    it('merges direct payments into dto.payments alongside invoice payments', async () => {
      salesOrderRepository.createQueryBuilder.mockReturnValue(makeQueryBuilder(baseOrder));
      paymentRepository.find.mockResolvedValue([
        { id: 'pay-direct-1', paymentNumber: 'PAY-D1', amount: 50, paymentDate: new Date() } as Payment,
      ]);

      const result = await service.findById('order-1');

      expect(result.payments).toHaveLength(2);
      expect(result.payments.map((p) => p.id)).toEqual(expect.arrayContaining(['pay-1', 'pay-direct-1']));
    });

    it('deduplicates payments that appear in both invoice and direct results', async () => {
      salesOrderRepository.createQueryBuilder.mockReturnValue(makeQueryBuilder(baseOrder));
      paymentRepository.find.mockResolvedValue([
        { id: 'pay-1', paymentNumber: 'PAY-1', amount: 50, paymentDate: new Date() } as Payment,
      ]);

      const result = await service.findById('order-1');

      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].id).toBe('pay-1');
    });

    it('falls back to invoice-only payments when payment repository throws', async () => {
      salesOrderRepository.createQueryBuilder.mockReturnValue(makeQueryBuilder(baseOrder));
      paymentRepository.find.mockRejectedValue(new Error('DB error'));

      const result = await service.findById('order-1');

      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].id).toBe('pay-1');
    });

    it('throws NotFoundException when order does not exist', async () => {
      salesOrderRepository.createQueryBuilder.mockReturnValue(makeQueryBuilder(null));

      await expect(service.findById('missing')).rejects.toThrow('Sales order not found');
    });
  });

  describe('findAll', () => {
    function makeQueryBuilder() {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getRawOne: jest.fn().mockResolvedValue({ count: '0' }),
      };
      return qb;
    }

    it('searches customer name with ILIKE', async () => {
      const qb = makeQueryBuilder();
      salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ search: 'Acme' });

      const andWhereCalls: string[] = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
      const searchCall = andWhereCalls.find(
        (c) => typeof c === 'string' && c.includes('customer.name ILIKE'),
      );
      expect(searchCall).toBeDefined();
    });

    it('searches product name with ILIKE in main query', async () => {
      const qb = makeQueryBuilder();
      salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ search: 'Widget' });

      const andWhereCalls: string[] = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
      const searchCall = andWhereCalls.find(
        (c) => typeof c === 'string' && c.includes('product.name ILIKE'),
      );
      expect(searchCall).toBeDefined();
    });

    it('uses EXISTS subquery in count so an order with multiple matching items counts as 1', async () => {
      const mainQb = makeQueryBuilder();
      const countQb = makeQueryBuilder();
      let callCount = 0;
      salesOrderRepository.createQueryBuilder.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? mainQb : countQb;
      });

      await service.findAll({ search: 'Widget' });

      const countAndWhereCalls: string[] = countQb.andWhere.mock.calls.map((c: any[]) => c[0]);
      const existsCall = countAndWhereCalls.find(
        (c) => typeof c === 'string' && c.includes('EXISTS'),
      );
      expect(existsCall).toBeDefined();
    });
  });
});
