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
      relations: ['customer', 'items', 'items.product'],
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
  });
});
