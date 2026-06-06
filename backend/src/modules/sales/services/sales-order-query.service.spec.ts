import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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

  describe('findAll', () => {
    function buildQbMock() {
      const andWhereCalls: Array<{ clause: string; params: Record<string, unknown> }> = [];
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn((clause: string, params: Record<string, unknown> = {}) => {
          andWhereCalls.push({ clause, params });
          return qb;
        }),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      return { qb, andWhereCalls };
    }

    it('selects product.stockQuantity so the list can show real stock status', async () => {
      // Without stockQuantity in the select, the mapper sees undefined and the
      // frontend falsely reports "out of stock", blocking fulfilment of
      // in-stock items (SO-26-024).
      const { qb } = buildQbMock();
      salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({} as any);

      const selectArg = qb.select.mock.calls[0][0] as string[];
      expect(selectArg).toContain('product.stockQuantity');
    });

    it('applies persisted status=READY directly', async () => {
      const { qb, andWhereCalls } = buildQbMock();
      salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ status: 'READY' } as any);

      const statusClause = andWhereCalls.find((c) => c.clause === 'order.status = :status');
      const paymentClause = andWhereCalls.find((c) => c.clause === 'order.paymentStatus = :ps');
      expect(statusClause?.params.status).toBe('READY');
      expect(paymentClause).toBeUndefined();
    });

    it('adds an orderNumber DESC tiebreaker when sorting by a non-orderNumber field', async () => {
      const { qb } = buildQbMock();
      salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ sortBy: 'orderDate', sortOrder: 'DESC' } as any);

      expect(qb.orderBy).toHaveBeenCalledWith('order.orderDate', 'DESC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('order.orderNumber', 'DESC');
    });

    it('does not add a redundant tiebreaker when already sorting by orderNumber', async () => {
      const { qb } = buildQbMock();
      salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ sortBy: 'orderNumber', sortOrder: 'ASC' } as any);

      expect(qb.orderBy).toHaveBeenCalledWith('order.orderNumber', 'ASC');
      expect(qb.addOrderBy).not.toHaveBeenCalled();
    });

    it('applies a paymentStatus param independently of READY', async () => {
      const { qb, andWhereCalls } = buildQbMock();
      salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ status: 'READY', paymentStatus: SalesOrderPaymentStatus.UNPAID } as any);

      const paymentClauses = andWhereCalls.filter((c) => c.clause.startsWith('order.paymentStatus'));
      expect(paymentClauses).toHaveLength(1);
      expect(paymentClauses[0].params.paymentStatus).toBe('UNPAID');
    });

    it('does not exclude PAID orders when filtering by DRAFT', async () => {
      const { qb, andWhereCalls } = buildQbMock();
      salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ status: SalesOrderStatus.DRAFT } as any);

      const statusClause = andWhereCalls.find((c) => c.clause === 'order.status = :status');
      expect(statusClause?.params.status).toBe('DRAFT');

      const excludeClause = andWhereCalls.find(
        (c) => c.clause === 'order.paymentStatus != :excludePs',
      );
      expect(excludeClause).toBeUndefined();
    });

    it('does not add the PAID exclusion for a non-DRAFT status', async () => {
      const { qb, andWhereCalls } = buildQbMock();
      salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ status: SalesOrderStatus.FULFILLED } as any);

      const statusClause = andWhereCalls.find((c) => c.clause === 'order.status = :status');
      expect(statusClause?.params.status).toBe('FULFILLED');

      const excludeClause = andWhereCalls.find(
        (c) => c.clause === 'order.paymentStatus != :excludePs',
      );
      expect(excludeClause).toBeUndefined();
    });

    describe('independent status + payment filtering', () => {
      it('status=READY applies status=READY only', async () => {
        const { qb, andWhereCalls } = buildQbMock();
        salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

        await service.findAll({ status: 'READY' } as any);

        expect(andWhereCalls).toContainEqual({
          clause: 'order.status = :status',
          params: { status: 'READY' },
        });
        expect(andWhereCalls).not.toContainEqual({
          clause: 'order.paymentStatus = :ps',
          params: { ps: SalesOrderPaymentStatus.PAID },
        });
      });

      it('status=READY and paymentStatus=UNPAID applies both filters', async () => {
        const { qb, andWhereCalls } = buildQbMock();
        salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

        await service.findAll({ status: 'READY', paymentStatus: SalesOrderPaymentStatus.UNPAID } as any);

        expect(andWhereCalls).toContainEqual({
          clause: 'order.status = :status',
          params: { status: 'READY' },
        });
        expect(andWhereCalls).toContainEqual({
          clause: 'order.paymentStatus = :paymentStatus',
          params: { paymentStatus: 'UNPAID' },
        });
      });

      it('status=DRAFT no longer excludes PAID orders', async () => {
        const { qb, andWhereCalls } = buildQbMock();
        salesOrderRepository.createQueryBuilder.mockReturnValue(qb);

        await service.findAll({ status: SalesOrderStatus.DRAFT } as any);

        expect(andWhereCalls).not.toContainEqual({
          clause: 'order.paymentStatus != :excludePs',
          params: { excludePs: SalesOrderPaymentStatus.PAID },
        });
      });
    });
  });

  describe('getDashboardStats', () => {
    it('counts unfulfilled orders as DRAFT + READY (not DRAFT only)', async () => {
      // Sum queries use a chainable query builder ending in getRawOne().
      const sumQb = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
      };
      salesOrderRepository.createQueryBuilder.mockReturnValue(sumQb as any);
      salesOrderRepository.count.mockResolvedValue(0);

      await service.getDashboardStats();

      expect(salesOrderRepository.count).toHaveBeenCalledWith({
        where: { status: In([SalesOrderStatus.DRAFT, SalesOrderStatus.READY]) },
      });
      // Guard against regression to DRAFT-only.
      expect(salesOrderRepository.count).not.toHaveBeenCalledWith({
        where: { status: SalesOrderStatus.DRAFT },
      });
    });
  });
});
