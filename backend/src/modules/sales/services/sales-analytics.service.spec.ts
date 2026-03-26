import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SalesAnalyticsService } from './sales-analytics.service';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { SalesAnalyticsReportService } from './sales-analytics-report.service';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function makeRepoMock() {
  return {
    createQueryBuilder: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
  };
}

describe('SalesAnalyticsService', () => {
  let service: SalesAnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesAnalyticsService,
        { provide: getRepositoryToken(SalesOrder), useValue: makeRepoMock() },
        { provide: getRepositoryToken(Invoice), useValue: makeRepoMock() },
        { provide: getRepositoryToken(Payment), useValue: makeRepoMock() },
        { provide: getRepositoryToken(Customer), useValue: makeRepoMock() },
        { provide: getRepositoryToken(SalesOrderItem), useValue: makeRepoMock() },
        { provide: SalesAnalyticsReportService, useValue: { getProductSummary: jest.fn() } },
      ],
    }).compile();

    service = module.get<SalesAnalyticsService>(SalesAnalyticsService);
  });

  describe('computeComparePeriod', () => {
    describe('previous_period', () => {
      it('returns window of same day count ending day before start', () => {
        const result = (service as any).computeComparePeriod(d('2026-03-01'), d('2026-03-31'), 'previous_period');
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-01-29');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-02-28');
      });

      it('handles 28-day window (non-leap Feb)', () => {
        const result = (service as any).computeComparePeriod(d('2026-02-01'), d('2026-02-28'), 'previous_period');
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-01-04');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-01-31');
      });

      it('handles single-day window', () => {
        const result = (service as any).computeComparePeriod(d('2026-03-15'), d('2026-03-15'), 'previous_period');
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-03-14');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-03-14');
      });
    });

    describe('last_month', () => {
      it('subtracts one calendar month from start and end independently', () => {
        const result = (service as any).computeComparePeriod(d('2026-03-01'), d('2026-03-31'), 'last_month');
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-02-01');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-02-28');
      });

      it('handles range spanning a month boundary', () => {
        const result = (service as any).computeComparePeriod(d('2026-01-28'), d('2026-02-03'), 'last_month');
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2025-12-28');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-01-03');
      });
    });

    describe('last_year', () => {
      it('returns same date one year back', () => {
        const result = (service as any).computeComparePeriod(d('2026-03-01'), d('2026-03-31'), 'last_year');
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2025-03-01');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2025-03-31');
      });

      it('clamps Feb 29 to Feb 28 in non-leap year', () => {
        const result = (service as any).computeComparePeriod(d('2024-02-01'), d('2024-02-29'), 'last_year');
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2023-02-28');
      });
    });
  });

  describe('getSalesAnalytics', () => {
    beforeEach(() => {
      jest.spyOn(service as any, 'parseDateRange').mockReturnValue({
        startDate: d('2026-03-01'),
        endDate: d('2026-03-31'),
      });
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
    });

    it('omits comparison block when compareWith is not set', async () => {
      const result = await service.getSalesAnalytics({
        dateRange: 'this_month' as any,
      } as any);

      expect(result.current).toBeDefined();
      expect(result.comparison).toBeUndefined();
    });
  });
});
