import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder } from '../../../database/entities';
import { differenceInCalendarDays, subDays, subMonths, subYears } from 'date-fns';
import { SettingsService } from '../../settings/settings.service';
import {
  PurchasingAnalyticsQueryDto,
  PurchasingAnalyticsResponseDto,
  PurchasingMetricsDto,
  PurchasingPeriodDataDto,
  PurchasingPeriodBlockDto,
  TopSupplierDto,
  RecentPurchaseOrderDto,
} from '../dto/purchasing-analytics.dto';
import { GroupByPeriod } from '@/common/dto/analytics.dto';
import { resolveDateRange } from '@/common/utils/date-range.util';

interface PurchasingAnalyticsFilters {
  supplierId?: string;
  status?: 'received' | 'pending';
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | 'overpaid';
}

function derivePaymentStatus(
  paidAmount: number,
  totalAmount: number,
): 'unpaid' | 'partial' | 'paid' | 'overpaid' {
  if (totalAmount <= 0) return 'unpaid';
  if (paidAmount > totalAmount) return 'overpaid';
  if (paidAmount === totalAmount) return 'paid';
  if (paidAmount > 0) return 'partial';
  return 'unpaid';
}

@Injectable()
export class PurchasingAnalyticsService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    private readonly settingsService: SettingsService,
  ) {}

  async getPurchasingAnalytics(
    query: PurchasingAnalyticsQueryDto,
  ): Promise<PurchasingAnalyticsResponseDto> {
    const { timezone } = await this.settingsService.getRegionalSettings();
    const { startDate, endDate } = resolveDateRange(
      timezone,
      query.dateRange,
      query.startDate,
      query.endDate,
    );
    const groupBy = query.groupBy ?? GroupByPeriod.MONTH;
    const comparePeriod = query.compareWith
      ? this.computePurchasingComparePeriod(startDate, endDate, query.compareWith)
      : null;

    const filters: PurchasingAnalyticsFilters = {
      supplierId: query.supplierId,
      status: query.status,
      paymentStatus: query.paymentStatus,
    };

    const [metrics, periodData, topSuppliers, recentOrders] = await Promise.all([
      this.calculatePurchasingMetrics(startDate, endDate, filters),
      this.getPurchasingPeriodData(startDate, endDate, groupBy, filters),
      this.getTopSuppliers(startDate, endDate, 5, filters),
      this.getRecentPurchaseOrders(5, filters),
    ]);

    const current: PurchasingPeriodBlockDto = {
      metrics,
      periodData,
      periodStart: startDate.toISOString().split('T')[0],
      periodEnd: endDate.toISOString().split('T')[0],
    };

    let comparison: PurchasingPeriodBlockDto | undefined;
    if (comparePeriod) {
      const [compareMetrics, comparePeriodData] = await Promise.all([
        this.calculatePurchasingMetrics(comparePeriod.compareStart, comparePeriod.compareEnd, filters),
        this.getPurchasingPeriodData(comparePeriod.compareStart, comparePeriod.compareEnd, groupBy, filters),
      ]);
      comparison = {
        metrics: compareMetrics,
        periodData: comparePeriodData,
        periodStart: comparePeriod.compareStart.toISOString().split('T')[0],
        periodEnd: comparePeriod.compareEnd.toISOString().split('T')[0],
      };
    }

    return { current, comparison, topSuppliers, recentOrders };
  }

  private async calculatePurchasingMetrics(
    startDate: Date,
    endDate: Date,
    filters: PurchasingAnalyticsFilters = {},
  ): Promise<PurchasingMetricsDto> {
    const baseQb = () =>
      this.purchaseOrderRepository
        .createQueryBuilder('po')
        .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('po.deletedAt IS NULL')
        .andWhere('po.isActive = :isActive', { isActive: true });

    const applyFilters = (qb: ReturnType<typeof baseQb>) => {
      if (filters.supplierId) {
        qb.andWhere('po.supplierId = :supplierId', { supplierId: filters.supplierId });
      }
      if (filters.status === 'received') {
        qb.andWhere(
          'NOT EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi."purchaseOrderId" = po.id AND poi."receivedQuantity" < poi.quantity AND poi."deletedAt" IS NULL)',
        );
      } else if (filters.status === 'pending') {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi."purchaseOrderId" = po.id AND poi."receivedQuantity" < poi.quantity AND poi."deletedAt" IS NULL)',
        );
      }
      return qb;
    };

    const [orderStats, supplierStats] = await Promise.all([
      applyFilters(baseQb())
        .select([
          'COALESCE(SUM(po.totalAmount), 0) as "totalSpent"',
          'COUNT(*) as "totalOrders"',
          'COALESCE(AVG(po.totalAmount), 0) as "averageOrderValue"',
        ])
        .getRawOne(),
      applyFilters(baseQb())
        .select('COUNT(DISTINCT po.supplierId) as "activeSuppliers"')
        .getRawOne(),
    ]);

    return {
      totalSpent: parseFloat(orderStats.totalSpent) || 0,
      totalOrders: parseInt(orderStats.totalOrders) || 0,
      averageOrderValue: parseFloat(orderStats.averageOrderValue) || 0,
      activeSuppliers: parseInt(supplierStats.activeSuppliers) || 0,
    };
  }

  private async getPurchasingPeriodData(
    startDate: Date,
    endDate: Date,
    groupBy: string,
    filters: PurchasingAnalyticsFilters = {},
  ): Promise<PurchasingPeriodDataDto[]> {
    const formatPeriodKey = (date: Date): string => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      switch (groupBy) {
        case 'day':
          return `${y}-${m}-${d}`;
        case 'week': {
          // ISO week: IYYY-IW
          const jan4 = new Date(y, 0, 4);
          const startOfWeek1 = new Date(jan4);
          startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
          const diffMs = date.getTime() - startOfWeek1.getTime();
          const isoWeek = Math.floor(diffMs / 604800000) + 1;
          const isoYear =
            isoWeek < 1
              ? y - 1
              : isoWeek > 52 && date < new Date(y + 1, 0, 4)
              ? y
              : y;
          return `${isoYear}-${String(isoWeek).padStart(2, '0')}`;
        }
        case 'quarter':
          return `${y}-Q${Math.ceil((date.getMonth() + 1) / 3)}`;
        case 'year':
          return `${y}`;
        default: // month
          return `${y}-${m}`;
      }
    };

    // When paymentStatus filter is active, payment status is a computed field (no DB column).
    // Load full orders with vendor payments, compute per-order, filter, then aggregate in-app.
    if (filters.paymentStatus) {
      const qb = this.purchaseOrderRepository
        .createQueryBuilder('po')
        .leftJoinAndSelect('po.vendorPayments', 'vendorPayments')
        .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('po.deletedAt IS NULL')
        .andWhere('po.isActive = :isActive', { isActive: true });

      if (filters.supplierId) {
        qb.andWhere('po.supplierId = :supplierId', { supplierId: filters.supplierId });
      }
      if (filters.status === 'received') {
        qb.andWhere(
          'NOT EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi."purchaseOrderId" = po.id AND poi."receivedQuantity" < poi.quantity AND poi."deletedAt" IS NULL)',
        );
      } else if (filters.status === 'pending') {
        qb.andWhere(
          'EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi."purchaseOrderId" = po.id AND poi."receivedQuantity" < poi.quantity AND poi."deletedAt" IS NULL)',
        );
      }

      const orders = await qb.getMany();

      const periodMap = new Map<string, { spent: number; orders: number }>();

      for (const po of orders) {
        const paidAmount = (po.vendorPayments || []).reduce(
          (sum, payment) => sum + parseFloat(payment.amount?.toString() || '0'),
          0,
        );
        const total = parseFloat(po.totalAmount?.toString() || '0');
        const computedStatus = derivePaymentStatus(paidAmount, total);

        if (computedStatus !== filters.paymentStatus) continue;

        const orderDate = po.orderDate instanceof Date ? po.orderDate : new Date(po.orderDate);
        const key = formatPeriodKey(orderDate);
        const existing = periodMap.get(key) ?? { spent: 0, orders: 0 };
        periodMap.set(key, { spent: existing.spent + total, orders: existing.orders + 1 });
      }

      return Array.from(periodMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, agg]) => ({ period, spent: agg.spent, orders: agg.orders }));
    }

    // Fast SQL aggregate path when no paymentStatus filter
    let dateFormat: string;
    switch (groupBy) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'IYYY-IW';
        break;
      case 'quarter':
        dateFormat = 'YYYY-"Q"Q';
        break;
      case 'year':
        dateFormat = 'YYYY';
        break;
      default: // month
        dateFormat = 'YYYY-MM';
        break;
    }

    const qb = this.purchaseOrderRepository
      .createQueryBuilder('po')
      .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('po.deletedAt IS NULL')
      .andWhere('po.isActive = :isActive', { isActive: true });

    if (filters.supplierId) {
      qb.andWhere('po.supplierId = :supplierId', { supplierId: filters.supplierId });
    }
    if (filters.status === 'received') {
      qb.andWhere(
        'NOT EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi."purchaseOrderId" = po.id AND poi."receivedQuantity" < poi.quantity AND poi."deletedAt" IS NULL)',
      );
    } else if (filters.status === 'pending') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi."purchaseOrderId" = po.id AND poi."receivedQuantity" < poi.quantity AND poi."deletedAt" IS NULL)',
      );
    }

    const data = await qb
      .select([
        `TO_CHAR(po.orderDate, '${dateFormat}') as period`,
        'COUNT(*) as orders',
        'COALESCE(SUM(po.totalAmount), 0) as spent',
      ])
      .groupBy(`TO_CHAR(po.orderDate, '${dateFormat}')`)
      .orderBy(`TO_CHAR(po.orderDate, '${dateFormat}')`, 'ASC')
      .getRawMany();

    return data.map((item) => ({
      period: item.period,
      spent: parseFloat(item.spent) || 0,
      orders: parseInt(item.orders) || 0,
    }));
  }

  private async getTopSuppliers(
    startDate: Date,
    endDate: Date,
    limit: number,
    filters: PurchasingAnalyticsFilters = {},
  ): Promise<TopSupplierDto[]> {
    const qb = this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoin('po.supplier', 'supplier')
      .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('po.deletedAt IS NULL')
      .andWhere('po.isActive = :isActive', { isActive: true });

    if (filters.supplierId) {
      qb.andWhere('po.supplierId = :supplierId', { supplierId: filters.supplierId });
    }
    if (filters.status === 'received') {
      qb.andWhere(
        'NOT EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi."purchaseOrderId" = po.id AND poi."receivedQuantity" < poi.quantity AND poi."deletedAt" IS NULL)',
      );
    } else if (filters.status === 'pending') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi."purchaseOrderId" = po.id AND poi."receivedQuantity" < poi.quantity AND poi."deletedAt" IS NULL)',
      );
    }

    const data = await qb
      .select([
        'supplier.id as "supplierId"',
        'supplier.companyName as "supplierName"',
        'COALESCE(SUM(po.totalAmount), 0) as "totalSpent"',
        'COUNT(*) as "orderCount"',
      ])
      .groupBy('supplier.id')
      .addGroupBy('supplier.companyName')
      .orderBy('"totalSpent"', 'DESC')
      .limit(limit)
      .getRawMany();

    return data.map((item) => ({
      supplierId: item.supplierId,
      supplierName: item.supplierName,
      totalSpent: parseFloat(item.totalSpent) || 0,
      orderCount: parseInt(item.orderCount) || 0,
    }));
  }

  private async getRecentPurchaseOrders(
    limit: number,
    filters: PurchasingAnalyticsFilters = {},
  ): Promise<RecentPurchaseOrderDto[]> {
    const qb = this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('po.vendorPayments', 'vendorPayments')
      .where('po.deletedAt IS NULL')
      .andWhere('po.isActive = :isActive', { isActive: true });

    if (filters.supplierId) {
      qb.andWhere('po.supplierId = :supplierId', { supplierId: filters.supplierId });
    }
    if (filters.status === 'received') {
      qb.andWhere(
        'NOT EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi."purchaseOrderId" = po.id AND poi."receivedQuantity" < poi.quantity AND poi."deletedAt" IS NULL)',
      );
    } else if (filters.status === 'pending') {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi."purchaseOrderId" = po.id AND poi."receivedQuantity" < poi.quantity AND poi."deletedAt" IS NULL)',
      );
    }

    const orders = await qb
      .orderBy('po.orderDate', 'DESC')
      .limit(filters.paymentStatus ? undefined : limit)
      .getMany();

    const mapped = orders.map((po) => {
      const date = po.orderDate instanceof Date ? po.orderDate : new Date(po.orderDate);
      const paidAmount = (po.vendorPayments ?? []).reduce(
        (sum, vp) => sum + parseFloat(vp.amount?.toString() || '0'),
        0,
      );
      const total = parseFloat(po.totalAmount?.toString() || '0');
      const computedPaymentStatus = derivePaymentStatus(paidAmount, total);
      const isReceived =
        typeof po.isFullyReceived === 'function'
          ? po.isFullyReceived()
          : Boolean(po.isFullyReceived);
      return {
        orderNumber: po.orderNumber,
        orderDate: date.toISOString().split('T')[0],
        supplierName: po.supplier?.companyName || 'N/A',
        totalAmount: total,
        status: (isReceived ? 'received' : 'pending') as 'received' | 'pending',
        computedPaymentStatus,
      };
    });

    const filtered = filters.paymentStatus
      ? mapped.filter((order) => order.computedPaymentStatus === filters.paymentStatus)
      : mapped;

    return filtered.slice(0, limit).map(({ computedPaymentStatus: _, ...rest }) => rest);
  }

  private computePurchasingComparePeriod(
    start: Date,
    end: Date,
    compareWith: 'previous_period' | 'last_month' | 'last_year',
  ): { compareStart: Date; compareEnd: Date } {
    if (compareWith === 'previous_period') {
      const dayCount = differenceInCalendarDays(end, start) + 1;
      const compareEnd = subDays(start, 1);
      const compareStart = subDays(compareEnd, dayCount - 1);
      return { compareStart, compareEnd };
    }
    if (compareWith === 'last_month') {
      return { compareStart: subMonths(start, 1), compareEnd: subMonths(end, 1) };
    }
    return { compareStart: subYears(start, 1), compareEnd: subYears(end, 1) };
  }
}
