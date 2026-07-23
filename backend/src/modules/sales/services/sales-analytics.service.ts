import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  getISOWeek,
  getISOWeekYear,
  subDays,
  subMonths,
  subYears,
} from 'date-fns';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { SalesOrder, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { Payment, PaymentStatus } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import {
  SalesAnalyticsQueryDto,
  SalesAnalyticsResponseDto,
  SalesMetricsDto,
  PeriodMetricDto,
  TopCustomerDto,
  TopProductDto,
  SalesPipelineQueryDto,
  SalesPipelineResponseDto,
  PipelineStageDto,
  CustomerAnalyticsQueryDto,
  CustomerMetricsDto,
  GroupByPeriod,
  SalesAnalyticsPeriodBlockDto,
} from '../dto/sales-analytics.dto';
import { SettingsService } from '../../settings/settings.service';
import { resolveDateRange } from '@/common/utils/date-range.util';

/**
 * Applies the sales-order-level dashboard filters to a query builder.
 *
 * Extracted so every sales-order-derived aggregate applies the identical set.
 * These blocks were previously copy-pasted per aggregate, which is how the
 * paymentStatus filter came to be declared, validated by @IsIn, documented via
 * @ApiQuery, and then silently ignored by this service (issue #935) — and how
 * getTopCustomers came to be missing the customerId filter the others had.
 *
 * paymentStatus filters the stored, indexed SalesOrder.paymentStatus column
 * rather than re-deriving status from paidAmount/totalAmount. Do not change
 * this to an amount comparison: re-deriving would disagree with Sales'
 * tolerance-based payment logic and make the dashboard contradict the Orders
 * page. The DTO union is lowercase; the DB enum is uppercase, hence the
 * toUpperCase() bridge (matching sales-order-query.service.ts).
 */
function applySalesOrderFilters<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  query: SalesAnalyticsQueryDto,
  alias: string,
): void {
  if (query.customerId) {
    qb.andWhere(`${alias}.customerId = :customerId`, { customerId: query.customerId });
  }

  if (query.salesRepId) {
    qb.andWhere(`${alias}.createdByUserId = :salesRepId`, { salesRepId: query.salesRepId });
  }

  if (query.fulfillmentStatus !== undefined) {
    qb.andWhere(`${alias}.isFulfilled = :isFulfilled`, {
      isFulfilled: query.fulfillmentStatus === 'fulfilled',
    });
  }

  if (query.paymentStatus) {
    qb.andWhere(`${alias}.paymentStatus = :paymentStatus`, {
      paymentStatus: query.paymentStatus.toUpperCase(),
    });
  }
}

@Injectable()
export class SalesAnalyticsService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepository: Repository<SalesOrderItem>,
    private readonly settingsService: SettingsService,
  ) {}

  async getSalesAnalytics(query: SalesAnalyticsQueryDto): Promise<SalesAnalyticsResponseDto> {
    const { timezone } = await this.settingsService.getRegionalSettings();
    const { startDate, endDate } = resolveDateRange(
      timezone,
      query.dateRange,
      query.startDate,
      query.endDate,
    );
    const groupBy = query.groupBy ?? GroupByPeriod.MONTH;
    const comparePeriod = query.compareWith
      ? this.computeComparePeriod(startDate, endDate, query.compareWith)
      : null;

    const [metrics, periodData, topCustomers, topProducts] = await Promise.all([
      this.calculateSalesMetrics(startDate, endDate, query),
      this.getPeriodData(startDate, endDate, groupBy, query),
      this.getTopCustomers(startDate, endDate, 10, query),
      this.getTopProducts(startDate, endDate, 10, query),
    ]);

    const current: SalesAnalyticsPeriodBlockDto = {
      metrics,
      periodData,
      periodStart: startDate as unknown as string,
      periodEnd: endDate as unknown as string,
    };

    let comparison: SalesAnalyticsPeriodBlockDto | undefined;
    if (comparePeriod) {
      const [compareMetrics, comparePeriodData] = await Promise.all([
        this.calculateSalesMetrics(comparePeriod.compareStart, comparePeriod.compareEnd, query),
        this.getPeriodData(comparePeriod.compareStart, comparePeriod.compareEnd, groupBy, query),
      ]);

      comparison = {
        metrics: compareMetrics,
        periodData: comparePeriodData,
        periodStart: comparePeriod.compareStart as unknown as string,
        periodEnd: comparePeriod.compareEnd as unknown as string,
      };
    }

    return {
      current,
      comparison,
      topCustomers,
      topProducts,
    };
  }

  async getSalesPipeline(query: SalesPipelineQueryDto): Promise<SalesPipelineResponseDto> {
    const { timezone } = await this.settingsService.getRegionalSettings();
    const { startDate, endDate } = resolveDateRange(
      timezone,
      query.dateRange,
      query.startDate,
      query.endDate,
    );

    let queryBuilder = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    if (query.customerId) {
      queryBuilder = queryBuilder.andWhere('order.customerId = :customerId', {
        customerId: query.customerId,
      });
    }

    if (query.salesRepId) {
      queryBuilder = queryBuilder.andWhere('order.createdByUserId = :salesRepId', {
        salesRepId: query.salesRepId,
      });
    }

    // Get pipeline data (status column removed, so we show fulfillment status instead)
    const stagesData = await queryBuilder
      .select([
        'order.isFulfilled',
        'COUNT(*) as orderCount',
        'COALESCE(SUM(order.totalAmount), 0) as totalValue',
        'COALESCE(AVG(order.totalAmount), 0) as averageValue',
      ])
      .groupBy('order.isFulfilled')
      .getRawMany();

    const totalOrders = stagesData.reduce((sum, stage) => sum + parseInt(stage.orderCount), 0);
    const totalValue = stagesData.reduce((sum, stage) => sum + parseFloat(stage.totalValue), 0);

    const stages: PipelineStageDto[] = stagesData.map((stage) => ({
      status: stage.order_isFulfilled ? 'fulfilled' : 'pending',
      statusLabel: stage.order_isFulfilled ? 'Fulfilled' : 'Pending Fulfillment',
      orderCount: parseInt(stage.orderCount),
      totalValue: parseFloat(stage.totalValue),
      averageValue: parseFloat(stage.averageValue),
      percentage: totalOrders > 0 ? (parseInt(stage.orderCount) / totalOrders) * 100 : 0,
    }));

    // Calculate conversion rate (fulfilled orders / total orders)
    const fulfilledOrders = stagesData
      .filter((stage) => stage.order_isFulfilled === true)
      .reduce((sum, stage) => sum + parseInt(stage.orderCount), 0);

    const conversionRate = totalOrders > 0 ? (fulfilledOrders / totalOrders) * 100 : 0;

    return {
      stages,
      totalOrders,
      totalValue,
      averageOrderValue: totalOrders > 0 ? totalValue / totalOrders : 0,
      conversionRate,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  async getCustomerAnalytics(query: CustomerAnalyticsQueryDto): Promise<CustomerMetricsDto> {
    if (!query.customerId) {
      throw new Error('Customer ID is required');
    }

    const { timezone } = await this.settingsService.getRegionalSettings();
    const { startDate, endDate } = resolveDateRange(
      timezone,
      query.dateRange,
      query.startDate,
      query.endDate,
    );

    const customer = await this.customerRepository.findOne({
      where: { id: query.customerId },
    });

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get customer orders within period
    const ordersQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.customerId = :customerId', { customerId: query.customerId })
      .andWhere('order.orderDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    const orderStats = await ordersQuery
      .select([
        'COUNT(*) as "totalOrders"',
        'COALESCE(SUM(order.totalAmount), 0) as "totalRevenue"',
        'COALESCE(AVG(order.totalAmount), 0) as "averageOrderValue"',
        'MIN(order.orderDate) as "firstOrderDate"',
        'MAX(order.orderDate) as "lastOrderDate"',
      ])
      .getRawOne();

    const daysSinceLastOrder = customer.lastPurchaseDate
      ? Math.floor((Date.now() - customer.lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Calculate payment score based on payment history (default 30 days, removed invoice-based computation)
    const avgPaymentDays = 30;
    const standardPaymentTerms = 30; // Default payment terms
    let paymentScore = 100;
    if (avgPaymentDays > standardPaymentTerms) {
      paymentScore = Math.max(0, 100 - (avgPaymentDays - standardPaymentTerms) * 2);
    }

    return {
      customerId: query.customerId,
      customerName: customer.name,
      totalRevenue: parseFloat(orderStats.totalRevenue) || 0,
      totalOrders: parseInt(orderStats.totalOrders) || 0,
      averageOrderValue: parseFloat(orderStats.averageOrderValue) || 0,
      lastOrderDate: orderStats.lastOrderDate || customer.lastPurchaseDate,
      firstOrderDate: orderStats.firstOrderDate || customer.firstPurchaseDate,
      paymentScore,
      daysSinceLastOrder,
    };
  }

  

  async getDashboardMetrics(): Promise<{
    today: SalesMetricsDto;
    thisMonth: SalesMetricsDto;
    thisYear: SalesMetricsDto;
  }> {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const endOfYear = new Date(today.getFullYear(), 11, 31, 23, 59, 59, 999);

    const [todayMetrics, thisMonthMetrics, thisYearMetrics] = await Promise.all([
      this.calculateSalesMetrics(startOfDay, endOfDay),
      this.calculateSalesMetrics(startOfMonth, endOfMonth),
      this.calculateSalesMetrics(startOfYear, endOfYear),
    ]);

    return {
      today: todayMetrics,
      thisMonth: thisMonthMetrics,
      thisYear: thisYearMetrics,
    };
  }

  // Private helper methods

  private async calculateSalesMetrics(
    startDate: Date,
    endDate: Date,
    query?: SalesAnalyticsQueryDto,
  ): Promise<SalesMetricsDto> {
    const orderQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    if (query) {
      applySalesOrderFilters(orderQuery, query, 'order');
    }

    const fulfilledQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('order.status = :status', {
        status: SalesOrderStatus.FULFILLED,
      });

    if (query) {
      applySalesOrderFilters(fulfilledQuery, query, 'order');
    }

    const [orderStats, fulfilledStats, customerStats, paymentStats] = await Promise.all([
      // Order statistics (status column removed, using fulfillment status)
      orderQuery
        .select([
          'COALESCE(SUM(order.totalAmount), 0) as "totalRevenue"',
          'COUNT(*) as "totalOrders"',
          'COALESCE(AVG(order.totalAmount), 0) as "averageOrderValue"',
          'COUNT(CASE WHEN order.isFulfilled = true THEN 1 END) as "completedOrders"',
          'COUNT(CASE WHEN order.isFulfilled = false THEN 1 END) as "confirmedOrders"',
          '0 as "draftOrders"',
        ])
        .getRawOne(),

      // Fulfilled order statistics (replaces old invoice-based revenue)
      fulfilledQuery
        .select([
          'COALESCE(SUM(order.totalAmount + order.shippingAmount), 0) as "paidInvoicesAmount"',
          'COALESCE(SUM(CASE WHEN order.status = :status2 THEN order.balanceDue ELSE 0 END), 0) as "pendingInvoicesAmount"',
          '0 as "overdueInvoicesAmount"',
        ])
        .setParameter('status2', SalesOrderStatus.FULFILLED)
        .getRawOne(),

      // New customers in period
      this.customerRepository
        .createQueryBuilder('customer')
        .where('customer.createdAt BETWEEN :startDate AND :endDate', {
          startDate,
          endDate,
        })
        .getCount(),

      // Payment statistics for conversion rate
      this.paymentRepository
        .createQueryBuilder('payment')
        .where('payment.paymentDate BETWEEN :startDate AND :endDate', {
          startDate,
          endDate,
        })
        .andWhere('payment.status = :completed', {
          completed: PaymentStatus.COMPLETED,
        })
        .getCount(),
    ]);

    // Calculate conversion rate based on completed orders vs total orders
    const conversionRate =
      parseInt(orderStats.totalOrders) > 0
        ? (parseInt(orderStats.completedOrders) / parseInt(orderStats.totalOrders)) * 100
        : 0;

    return {
      totalRevenue: parseFloat(orderStats.totalRevenue) || 0,
      totalOrders: parseInt(orderStats.totalOrders) || 0,
      newCustomers: customerStats || 0,
      averageOrderValue: parseFloat(orderStats.averageOrderValue) || 0,
      conversionRate,
      paidInvoicesAmount: parseFloat(fulfilledStats.paidInvoicesAmount) || 0,
      pendingInvoicesAmount: parseFloat(fulfilledStats.pendingInvoicesAmount) || 0,
      overdueInvoicesAmount: parseFloat(fulfilledStats.overdueInvoicesAmount) || 0,
      completedOrders: parseInt(orderStats.completedOrders) || 0,
      confirmedOrders: parseInt(orderStats.confirmedOrders) || 0,
      draftOrders: parseInt(orderStats.draftOrders) || 0,
    };
  }

  private async getPeriodData(
    startDate: Date,
    endDate: Date,
    groupBy: string,
    query?: SalesAnalyticsQueryDto,
  ): Promise<PeriodMetricDto[]> {
    let dateFormat: string;
    let dateInterval: string;

    switch (groupBy) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        dateInterval = '1 day';
        break;
      case 'week':
        dateFormat = 'IYYY-IW';
        dateInterval = '1 week';
        break;
      case 'quarter':
        dateFormat = 'YYYY-"Q"Q';
        dateInterval = '3 months';
        break;
      case 'year':
        dateFormat = 'YYYY';
        dateInterval = '1 year';
        break;
      default: // month
        dateFormat = 'YYYY-MM';
        dateInterval = '1 month';
        break;
    }

    const periodQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    if (query) {
      applySalesOrderFilters(periodQuery, query, 'order');
    }

    const data = await periodQuery
      .select([
        `TO_CHAR(order.orderDate, '${dateFormat}') as period`,
        'COUNT(*) as orders',
        'COALESCE(SUM(order.totalAmount), 0) as revenue',
        'COALESCE(AVG(order.totalAmount), 0) as "averageOrderValue"',
      ])
      .groupBy(`TO_CHAR(order.orderDate, '${dateFormat}')`)
      .orderBy(`TO_CHAR(order.orderDate, '${dateFormat}')`, 'ASC')
      .getRawMany();

    // Also get new customers for each period
    const customerData = await this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .select([
        `TO_CHAR(customer.createdAt, '${dateFormat}') as period`,
        'COUNT(*) as "newCustomers"',
      ])
      .groupBy(`TO_CHAR(customer.createdAt, '${dateFormat}')`)
      .orderBy(`TO_CHAR(customer.createdAt, '${dateFormat}')`, 'ASC')
      .getRawMany();

    const customerMap = new Map(
      customerData.map((item) => [item.period, parseInt(item.newCustomers)]),
    );

    const mapped = data.map((item) => ({
      period: item.period,
      revenue: parseFloat(item.revenue) || 0,
      orders: parseInt(item.orders) || 0,
      newCustomers: customerMap.get(item.period) || 0,
      averageOrderValue: parseFloat(item.averageOrderValue) || 0,
    }));

    return this.fillPeriodGaps(mapped, startDate, endDate, groupBy);
  }

  private async getTopCustomers(
    startDate: Date,
    endDate: Date,
    limit: number,
    query?: SalesAnalyticsQueryDto,
  ): Promise<TopCustomerDto[]> {
    const topCustomersQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .leftJoin('order.customer', 'customer')
      .where('order.orderDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    if (query) {
      applySalesOrderFilters(topCustomersQuery, query, 'order');
    }

    const data = await topCustomersQuery
      .select([
        'customer.id as "customerId"',
        'customer.name as "customerName"',
        'customer.phone as "customerEmail"',
        'COUNT(*) as "totalOrders"',
        'COALESCE(SUM(order.totalAmount), 0) as "totalRevenue"',
        'COALESCE(AVG(order.totalAmount), 0) as "averageOrderValue"',
        'MAX(order.orderDate) as "lastOrderDate"',
      ])
      .groupBy('customer.id')
      .addGroupBy('customer.name')
      .addGroupBy('customer.phone')
      .orderBy('"totalRevenue"', 'DESC')
      .limit(limit)
      .getRawMany();

    return data.map((item) => ({
      customerId: item.customerId,
      customerName: item.customerName,
      customerEmail: item.customerEmail,
      totalRevenue: parseFloat(item.totalRevenue) || 0,
      totalOrders: parseInt(item.totalOrders) || 0,
      averageOrderValue: parseFloat(item.averageOrderValue) || 0,
      lastOrderDate: item.lastOrderDate,
    }));
  }

  private async getTopProducts(
    startDate: Date,
    endDate: Date,
    limit: number,
    query?: SalesAnalyticsQueryDto,
  ): Promise<TopProductDto[]> {
    const topProductsQuery = this.salesOrderItemRepository
      .createQueryBuilder('item')
      .leftJoin('item.product', 'product')
      .leftJoin('item.salesOrder', 'order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    if (query) {
      applySalesOrderFilters(topProductsQuery, query, 'order');
    }

    const data = await topProductsQuery
      .select([
        'product.id as "productId"',
        'product.barcode as "productSku"',
        'product.name as "productName"',
        'SUM(item.quantity) as "quantitySold"',
        'COALESCE(SUM(item.totalAmount), 0) as "totalRevenue"',
        'COALESCE(AVG(item.unitPrice), 0) as "averagePrice"',
        'COUNT(DISTINCT order.id) as "orderCount"',
      ])
      .groupBy('product.id')
      .addGroupBy('product.barcode')
      .addGroupBy('product.name')
      .orderBy('"quantitySold"', 'DESC')
      .limit(limit)
      .getRawMany();

    return data.map((item) => ({
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      quantitySold: parseInt(item.quantitySold) || 0,
      totalRevenue: parseFloat(item.totalRevenue) || 0,
      averagePrice: parseFloat(item.averagePrice) || 0,
      orderCount: parseInt(item.orderCount) || 0,
    }));
  }

  

  private fillPeriodGaps(
    data: PeriodMetricDto[],
    startDate: Date,
    endDate: Date,
    groupBy: string,
  ): PeriodMetricDto[] {
    const dataMap = new Map(data.map((item) => [item.period, item]));
    const labels: string[] = [];
    let cursor = new Date(startDate);

    while (cursor <= endDate) {
      let label: string;

      switch (groupBy) {
        case 'day':
          label = format(cursor, 'yyyy-MM-dd');
          cursor = addDays(cursor, 1);
          break;
        case 'week': {
          const isoYear = getISOWeekYear(cursor);
          const isoWeek = String(getISOWeek(cursor)).padStart(2, '0');
          label = `${isoYear}-${isoWeek}`;
          cursor = addWeeks(cursor, 1);
          break;
        }
        case 'quarter': {
          const q = Math.floor(cursor.getMonth() / 3) + 1;
          label = `${cursor.getFullYear()}-Q${q}`;
          cursor = addMonths(cursor, 3);
          break;
        }
        case 'year':
          label = String(cursor.getFullYear());
          cursor = addYears(cursor, 1);
          break;
        default:
          label = format(cursor, 'yyyy-MM');
          cursor = addMonths(cursor, 1);
          break;
      }

      labels.push(label);
    }

    return labels.map(
      (label) =>
        dataMap.get(label) ?? {
          period: label,
          revenue: 0,
          orders: 0,
          newCustomers: 0,
          averageOrderValue: 0,
        },
    );
  }

  private computeComparePeriod(
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
      return {
        compareStart: subMonths(start, 1),
        compareEnd: subMonths(end, 1),
      };
    }

    return {
      compareStart: subYears(start, 1),
      compareEnd: subYears(end, 1),
    };
  }
}

  
