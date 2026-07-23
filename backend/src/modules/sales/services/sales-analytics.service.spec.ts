import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SalesAnalyticsService } from './sales-analytics.service';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { SalesAnalyticsQueryDto } from '../dto/sales-analytics.dto';
import { SettingsService } from '../../settings/settings.service';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function makeRepoMock() {
  return {
    createQueryBuilder: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
  };
}

/**
 * Standalone query-builder mock used by the canonical-params describe blocks.
 * Simpler than makeChainMock (no rawMany defaults) so each test can configure
 * exactly what it needs without noise.
 * Use makeChainMock (in getSalesAnalytics filter propagation) for full-service tests.
 */
function makeChainableQb(rawOneResult: any = {}) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(rawOneResult),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };
  return qb;
}

describe('SalesAnalyticsService', () => {
  let service: SalesAnalyticsService;
  const settingsService = {
    getRegionalSettings: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
  };

  beforeEach(async () => {
    settingsService.getRegionalSettings.mockResolvedValue({ timezone: 'UTC' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesAnalyticsService,
        { provide: getRepositoryToken(SalesOrder), useValue: makeRepoMock() },
        { provide: getRepositoryToken(Payment), useValue: makeRepoMock() },
        { provide: getRepositoryToken(Customer), useValue: makeRepoMock() },
        {
          provide: getRepositoryToken(SalesOrderItem),
          useValue: makeRepoMock(),
        },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get<SalesAnalyticsService>(SalesAnalyticsService);
  });

  describe('computeComparePeriod', () => {
    describe('previous_period', () => {
      it('returns window of same day count ending day before start', () => {
        const result = (service as any).computeComparePeriod(
          d('2026-03-01'),
          d('2026-03-31'),
          'previous_period',
        );
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-01-29');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-02-28');
      });

      it('handles 28-day window (non-leap Feb)', () => {
        const result = (service as any).computeComparePeriod(
          d('2026-02-01'),
          d('2026-02-28'),
          'previous_period',
        );
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-01-04');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-01-31');
      });

      it('handles single-day window', () => {
        const result = (service as any).computeComparePeriod(
          d('2026-03-15'),
          d('2026-03-15'),
          'previous_period',
        );
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-03-14');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-03-14');
      });
    });

    describe('last_month', () => {
      it('subtracts one calendar month from start and end independently', () => {
        const result = (service as any).computeComparePeriod(
          d('2026-03-01'),
          d('2026-03-31'),
          'last_month',
        );
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-02-01');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-02-28');
      });

      it('handles range spanning a month boundary', () => {
        const result = (service as any).computeComparePeriod(
          d('2026-01-28'),
          d('2026-02-03'),
          'last_month',
        );
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2025-12-28');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-01-03');
      });
    });

    describe('last_year', () => {
      it('returns same date one year back', () => {
        const result = (service as any).computeComparePeriod(
          d('2026-03-01'),
          d('2026-03-31'),
          'last_year',
        );
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2025-03-01');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2025-03-31');
      });

      it('clamps Feb 29 to Feb 28 in non-leap year', () => {
        const result = (service as any).computeComparePeriod(
          d('2024-02-01'),
          d('2024-02-29'),
          'last_year',
        );
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2023-02-28');
      });
    });
  });

  describe('getSalesAnalytics', () => {
    beforeEach(() => {
      jest.spyOn(service as any, 'calculateSalesMetrics').mockResolvedValue({
        totalRevenue: 100,
        totalOrders: 10,
        newCustomers: 2,
        averageOrderValue: 10,
        conversionRate: 50,
        paidInvoicesAmount: 80,
        pendingInvoicesAmount: 20,
        overdueInvoicesAmount: 0,
        completedOrders: 5,
        confirmedOrders: 5,
        draftOrders: 0,
      });
      jest.spyOn(service as any, 'getPeriodData').mockResolvedValue([
        {
          period: '2026-03',
          revenue: 100,
          orders: 10,
          newCustomers: 2,
          averageOrderValue: 10,
        },
      ]);
      jest.spyOn(service as any, 'getTopCustomers').mockResolvedValue([]);
      jest.spyOn(service as any, 'getTopProducts').mockResolvedValue([]);
    });

    it('returns comparison block when compareWith is set', async () => {
      jest.spyOn(service as any, 'computeComparePeriod').mockReturnValue({
        compareStart: d('2026-02-01'),
        compareEnd: d('2026-02-28'),
      });

      const result = await service.getSalesAnalytics({
        dateRange: 'this_month' as any,
        compareWith: 'last_month',
      } as any);

      expect(result.current).toBeDefined();
      expect(result.current.metrics).toBeDefined();
      expect(result.comparison).toBeDefined();
      expect(result.topCustomers).toBeDefined();
      expect(result.topProducts).toBeDefined();
      expect(settingsService.getRegionalSettings).toHaveBeenCalled();
    });

    it('omits comparison block when compareWith is not set', async () => {
      const result = await service.getSalesAnalytics({
        dateRange: 'this_month' as any,
      } as any);

      expect(result.current).toBeDefined();
      expect(result.comparison).toBeUndefined();
    });
  });

  describe('SalesAnalyticsQueryDto validation', () => {
    it('accepts fulfillmentStatus=fulfilled without validation error', () => {
      const dto = new SalesAnalyticsQueryDto();
      dto.fulfillmentStatus = 'fulfilled';

      expect(dto.fulfillmentStatus).toBe('fulfilled');
    });

    it('accepts paymentStatus=unpaid without validation error', () => {
      const dto = new SalesAnalyticsQueryDto();
      dto.paymentStatus = 'unpaid';

      expect(dto.paymentStatus).toBe('unpaid');
    });

    it('accepts fulfillmentStatus=fulfilled as valid canonical value', async () => {
      const { plainToInstance } = await import('class-transformer');
      const { validate } = await import('class-validator');
      const dto = plainToInstance(SalesAnalyticsQueryDto, {
        fulfillmentStatus: 'fulfilled',
      });
      const errors = await validate(dto);

      expect(errors.filter((e) => e.property === 'fulfillmentStatus')).toHaveLength(0);
      expect(dto.fulfillmentStatus).toBe('fulfilled');
    });

    it('accepts paymentStatus=paid as valid canonical value', async () => {
      const { plainToInstance } = await import('class-transformer');
      const { validate } = await import('class-validator');
      const dto = plainToInstance(SalesAnalyticsQueryDto, {
        paymentStatus: 'paid',
      });
      const errors = await validate(dto);

      expect(errors.filter((e) => e.property === 'paymentStatus')).toHaveLength(0);
      expect(dto.paymentStatus).toBe('paid');
    });

    it('rejects paymentStatus=invalid', async () => {
      const { plainToInstance } = await import('class-transformer');
      const { validate } = await import('class-validator');
      const { SalesAnalyticsQueryDto } = await import('../dto/sales-analytics.dto');
      const dto = plainToInstance(SalesAnalyticsQueryDto, {
        paymentStatus: 'invalid',
      });
      const errors = await validate(dto);

      expect(errors.filter((e) => e.property === 'paymentStatus')).toHaveLength(1);
    });
  });

  describe('getPeriodData filter propagation', () => {
    function makeQbChain() {
      const qb: any = {};
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.leftJoin = jest.fn().mockReturnValue(qb);
      qb.select = jest.fn().mockReturnValue(qb);
      qb.groupBy = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.getRawMany = jest.fn().mockResolvedValue([]);
      return qb;
    }

    function makeCustomerQbChain() {
      const qb: any = {};
      qb.where = jest.fn().mockReturnValue(qb);
      qb.select = jest.fn().mockReturnValue(qb);
      qb.groupBy = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.getRawMany = jest.fn().mockResolvedValue([]);
      return qb;
    }

    const start = new Date('2026-03-01T00:00:00.000Z');
    const end = new Date('2026-03-31T23:59:59.999Z');

    it('applies customerId filter when provided', async () => {
      const qb = makeQbChain();
      const customerQb = makeCustomerQbChain();
      (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
      (service as any).customerRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(customerQb);

      await (service as any).getPeriodData(start, end, 'month', {
        customerId: 'cust-1',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('order.customerId = :customerId', {
        customerId: 'cust-1',
      });
    });

    it('applies salesRepId filter when provided', async () => {
      const qb = makeQbChain();
      const customerQb = makeCustomerQbChain();
      (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
      (service as any).customerRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(customerQb);

      await (service as any).getPeriodData(start, end, 'month', {
        salesRepId: 'rep-1',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('order.createdByUserId = :salesRepId', {
        salesRepId: 'rep-1',
      });
    });

    it('applies no extra andWhere calls when query has no filters', async () => {
      const qb = makeQbChain();
      const customerQb = makeCustomerQbChain();
      (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
      (service as any).customerRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(customerQb);

      await (service as any).getPeriodData(start, end, 'month', {});

      const andWhereCalls = qb.andWhere.mock.calls.map((c: any[]) => c[0] as string);
      expect(andWhereCalls).not.toContain(expect.stringContaining('customerId'));
      expect(andWhereCalls).not.toContain(expect.stringContaining('salesRepId'));
      expect(andWhereCalls).not.toContain(expect.stringContaining('paymentStatus'));
    });
  });

  describe('getTopCustomers filter propagation', () => {
    function makeQbChain() {
      const qb: any = {};
      qb.leftJoin = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.select = jest.fn().mockReturnValue(qb);
      qb.groupBy = jest.fn().mockReturnValue(qb);
      qb.addGroupBy = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockReturnValue(qb);
      qb.getRawMany = jest.fn().mockResolvedValue([]);
      return qb;
    }

    const start = new Date('2026-03-01T00:00:00.000Z');
    const end = new Date('2026-03-31T23:59:59.999Z');

    it('applies salesRepId filter when provided', async () => {
      const qb = makeQbChain();
      (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getTopCustomers(start, end, 10, {
        salesRepId: 'rep-1',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('order.createdByUserId = :salesRepId', {
        salesRepId: 'rep-1',
      });
    });

    it('does not add salesRepId andWhere when not provided', async () => {
      const qb = makeQbChain();
      (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getTopCustomers(start, end, 10, {});

      const andWhereCalls = qb.andWhere.mock.calls.map((c: any[]) => c[0] as string);
      expect(andWhereCalls).not.toContain(expect.stringContaining('salesRepId'));
    });
  });

  describe('getTopProducts filter propagation', () => {
    function makeQbChain() {
      const qb: any = {};
      qb.leftJoin = jest.fn().mockReturnValue(qb);
      qb.where = jest.fn().mockReturnValue(qb);
      qb.andWhere = jest.fn().mockReturnValue(qb);
      qb.select = jest.fn().mockReturnValue(qb);
      qb.groupBy = jest.fn().mockReturnValue(qb);
      qb.addGroupBy = jest.fn().mockReturnValue(qb);
      qb.orderBy = jest.fn().mockReturnValue(qb);
      qb.limit = jest.fn().mockReturnValue(qb);
      qb.getRawMany = jest.fn().mockResolvedValue([]);
      return qb;
    }

    const start = new Date('2026-03-01T00:00:00.000Z');
    const end = new Date('2026-03-31T23:59:59.999Z');

    it('applies customerId filter when provided', async () => {
      const qb = makeQbChain();
      (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getTopProducts(start, end, 10, {
        customerId: 'cust-1',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('order.customerId = :customerId', {
        customerId: 'cust-1',
      });
    });

    it('applies salesRepId filter when provided', async () => {
      const qb = makeQbChain();
      (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getTopProducts(start, end, 10, {
        salesRepId: 'rep-1',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('order.createdByUserId = :salesRepId', {
        salesRepId: 'rep-1',
      });
    });

    it('applies both customerId and salesRepId when both provided', async () => {
      const qb = makeQbChain();
      (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getTopProducts(start, end, 10, {
        customerId: 'cust-1',
        salesRepId: 'rep-1',
      });

      expect(qb.andWhere).toHaveBeenCalledWith('order.customerId = :customerId', {
        customerId: 'cust-1',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('order.createdByUserId = :salesRepId', {
        salesRepId: 'rep-1',
      });
    });

    it('applies no extra andWhere calls when query has no filters', async () => {
      const qb = makeQbChain();
      (service as any).salesOrderItemRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getTopProducts(start, end, 10, {});

      const andWhereCalls = qb.andWhere.mock.calls.map((c: any[]) => c[0] as string);
      expect(andWhereCalls).not.toContain(expect.stringContaining('customerId'));
      expect(andWhereCalls).not.toContain(expect.stringContaining('salesRepId'));
    });
  });

  describe('fillPeriodGaps', () => {
    const zero = {
      revenue: 0,
      orders: 0,
      newCustomers: 0,
      averageOrderValue: 0,
    };

    describe('day groupBy', () => {
      it('fills missing days with zeros', () => {
        const start = new Date('2026-03-01T00:00:00.000Z');
        const end = new Date('2026-03-05T23:59:59.999Z');
        const sparse = [
          {
            period: '2026-03-01',
            revenue: 100,
            orders: 2,
            newCustomers: 1,
            averageOrderValue: 50,
          },
          {
            period: '2026-03-05',
            revenue: 200,
            orders: 3,
            newCustomers: 0,
            averageOrderValue: 66.67,
          },
        ];

        const result = (service as any).fillPeriodGaps(sparse, start, end, 'day');

        expect(result).toHaveLength(5);
        expect(result[0]).toEqual({
          period: '2026-03-01',
          revenue: 100,
          orders: 2,
          newCustomers: 1,
          averageOrderValue: 50,
        });
        expect(result[1]).toEqual({ period: '2026-03-02', ...zero });
        expect(result[2]).toEqual({ period: '2026-03-03', ...zero });
        expect(result[3]).toEqual({ period: '2026-03-04', ...zero });
        expect(result[4]).toEqual({
          period: '2026-03-05',
          revenue: 200,
          orders: 3,
          newCustomers: 0,
          averageOrderValue: 66.67,
        });
      });

      it('handles empty DB result - all zeros', () => {
        const start = new Date('2026-03-01T00:00:00.000Z');
        const end = new Date('2026-03-03T23:59:59.999Z');

        const result = (service as any).fillPeriodGaps([], start, end, 'day');

        expect(result).toHaveLength(3);
        result.forEach((r: any) => expect(r).toMatchObject(zero));
      });

      it('handles single-day range with one order', () => {
        const start = new Date('2026-03-15T00:00:00.000Z');
        const end = new Date('2026-03-15T23:59:59.999Z');
        const sparse = [
          {
            period: '2026-03-15',
            revenue: 50,
            orders: 1,
            newCustomers: 0,
            averageOrderValue: 50,
          },
        ];

        const result = (service as any).fillPeriodGaps(sparse, start, end, 'day');

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          period: '2026-03-15',
          revenue: 50,
          orders: 1,
          newCustomers: 0,
          averageOrderValue: 50,
        });
      });
    });

    describe('week groupBy', () => {
      it('fills missing weeks with zeros', () => {
        const start = new Date('2026-03-02T00:00:00.000Z');
        const end = new Date('2026-03-22T23:59:59.999Z');
        const sparse = [
          {
            period: '2026-11',
            revenue: 100,
            orders: 2,
            newCustomers: 0,
            averageOrderValue: 50,
          },
        ];

        const result = (service as any).fillPeriodGaps(sparse, start, end, 'week');

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ period: '2026-10', ...zero });
        expect(result[1]).toEqual({
          period: '2026-11',
          revenue: 100,
          orders: 2,
          newCustomers: 0,
          averageOrderValue: 50,
        });
        expect(result[2]).toEqual({ period: '2026-12', ...zero });
      });
    });

    describe('month groupBy', () => {
      it('fills missing months with zeros', () => {
        const start = new Date('2026-01-01T00:00:00.000Z');
        const end = new Date('2026-03-31T23:59:59.999Z');
        const sparse = [
          {
            period: '2026-02',
            revenue: 500,
            orders: 5,
            newCustomers: 2,
            averageOrderValue: 100,
          },
        ];

        const result = (service as any).fillPeriodGaps(sparse, start, end, 'month');

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ period: '2026-01', ...zero });
        expect(result[1]).toEqual({
          period: '2026-02',
          revenue: 500,
          orders: 5,
          newCustomers: 2,
          averageOrderValue: 100,
        });
        expect(result[2]).toEqual({ period: '2026-03', ...zero });
      });
    });

    describe('quarter groupBy', () => {
      it('fills missing quarters with zeros', () => {
        const start = new Date('2026-01-01T00:00:00.000Z');
        const end = new Date('2026-06-30T23:59:59.999Z');
        const sparse = [
          {
            period: '2026-Q1',
            revenue: 1000,
            orders: 10,
            newCustomers: 3,
            averageOrderValue: 100,
          },
        ];

        const result = (service as any).fillPeriodGaps(sparse, start, end, 'quarter');

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          period: '2026-Q1',
          revenue: 1000,
          orders: 10,
          newCustomers: 3,
          averageOrderValue: 100,
        });
        expect(result[1]).toEqual({ period: '2026-Q2', ...zero });
      });
    });

    describe('year groupBy', () => {
      it('fills missing years with zeros', () => {
        const start = new Date('2025-01-01T00:00:00.000Z');
        const end = new Date('2026-12-31T23:59:59.999Z');
        const sparse = [
          {
            period: '2025',
            revenue: 5000,
            orders: 50,
            newCustomers: 10,
            averageOrderValue: 100,
          },
        ];

        const result = (service as any).fillPeriodGaps(sparse, start, end, 'year');

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          period: '2025',
          revenue: 5000,
          orders: 50,
          newCustomers: 10,
          averageOrderValue: 100,
        });
        expect(result[1]).toEqual({ period: '2026', ...zero });
      });
    });
  });

  describe('getSalesAnalytics filter propagation', () => {
    function makeChainMock(rawOne: object = {}, rawMany: object[] = []) {
      const chain: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalRevenue: '0',
          totalOrders: '0',
          averageOrderValue: '0',
          completedOrders: '0',
          confirmedOrders: '0',
          draftOrders: '0',
          paidInvoicesAmount: '0',
          pendingInvoicesAmount: '0',
          overdueInvoicesAmount: '0',
          ...rawOne,
        }),
        getRawMany: jest.fn().mockResolvedValue(rawMany),
        getCount: jest.fn().mockResolvedValue(0),
      };

      return chain;
    }

    it('applies fulfillmentStatus filter to orderQuery in calculateSalesMetrics', async () => {
      const orderChain = makeChainMock();
      const customerChain = makeChainMock();
      const paymentChain = makeChainMock();

      (service as any).salesOrderRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(orderChain);
      (service as any).customerRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(customerChain);
      (service as any).paymentRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(paymentChain);
      (service as any).salesOrderItemRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(makeChainMock({}, []));

      await service.getSalesAnalytics({
        fulfillmentStatus: 'fulfilled',
        dateRange: undefined,
      } as any);

      expect(orderChain.andWhere).toHaveBeenCalledWith('order.isFulfilled = :isFulfilled', {
        isFulfilled: true,
      });
    });

    it('applies fulfillmentStatus filter to getPeriodData orderQuery', async () => {
      const orderChain = makeChainMock({}, []);
      const customerChain = makeChainMock({}, []);
      const paymentChain = makeChainMock();

      (service as any).salesOrderRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(orderChain);
      (service as any).customerRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(customerChain);
      (service as any).paymentRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(paymentChain);
      (service as any).salesOrderItemRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(makeChainMock({}, []));

      await service.getSalesAnalytics({
        fulfillmentStatus: 'unfulfilled',
        dateRange: undefined,
      } as any);

      const calls = orderChain.andWhere.mock.calls.filter(
        (args: any[]) => args[0] === 'order.isFulfilled = :isFulfilled',
      );
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });

    it('applies fulfillmentStatus filter to getTopCustomers orderQuery', async () => {
      const orderChain = makeChainMock({}, []);
      const customerChain = makeChainMock({}, []);
      const paymentChain = makeChainMock();

      (service as any).salesOrderRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(orderChain);
      (service as any).customerRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(customerChain);
      (service as any).paymentRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(paymentChain);
      (service as any).salesOrderItemRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(makeChainMock({}, []));

      await service.getSalesAnalytics({
        fulfillmentStatus: 'fulfilled',
        dateRange: undefined,
      } as any);

      const orderCalls = orderChain.andWhere.mock.calls.filter(
        (args: any[]) => args[0] === 'order.isFulfilled = :isFulfilled',
      );
      expect(orderCalls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('paymentStatus filter', () => {
    const start = new Date('2026-03-01T00:00:00.000Z');
    const end = new Date('2026-03-31T23:59:59.999Z');

    it('applies the stored paymentStatus column in getPeriodData', async () => {
      const qb = makeChainableQb();
      (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
      (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getPeriodData(start, end, 'month', { paymentStatus: 'paid' });

      expect(qb.andWhere).toHaveBeenCalledWith('order.paymentStatus = :paymentStatus', {
        paymentStatus: 'PAID',
      });
    });

    it('applies paymentStatus in getTopCustomers', async () => {
      const qb = makeChainableQb();
      (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getTopCustomers(start, end, 10, { paymentStatus: 'paid' });

      expect(qb.andWhere).toHaveBeenCalledWith('order.paymentStatus = :paymentStatus', {
        paymentStatus: 'PAID',
      });
    });

    it('applies paymentStatus in getTopProducts', async () => {
      const qb = makeChainableQb();
      (service as any).salesOrderItemRepository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(qb);

      await (service as any).getTopProducts(start, end, 10, { paymentStatus: 'paid' });

      expect(qb.andWhere).toHaveBeenCalledWith('order.paymentStatus = :paymentStatus', {
        paymentStatus: 'PAID',
      });
    });

    it.each([
      ['unpaid', 'UNPAID'],
      ['partial', 'PARTIAL'],
      ['paid', 'PAID'],
      ['overpaid', 'OVERPAID'],
    ])('maps DTO value %s to enum %s', async (input, expected) => {
      const qb = makeChainableQb();
      (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
      (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getPeriodData(start, end, 'month', { paymentStatus: input });

      expect(qb.andWhere).toHaveBeenCalledWith('order.paymentStatus = :paymentStatus', {
        paymentStatus: expected,
      });
    });

    it('applies customerId in getTopCustomers (previously missing)', async () => {
      const qb = makeChainableQb();
      (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getTopCustomers(start, end, 10, { customerId: 'cust-1' });

      expect(qb.andWhere).toHaveBeenCalledWith('order.customerId = :customerId', {
        customerId: 'cust-1',
      });
    });

    it('emits no payment predicate when paymentStatus is absent', async () => {
      const qb = makeChainableQb();
      (service as any).salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);
      (service as any).customerRepository.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await (service as any).getPeriodData(start, end, 'month', { customerId: 'cust-1' });

      const calls = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
      expect(calls).not.toContain('order.paymentStatus = :paymentStatus');
    });
  });
});
