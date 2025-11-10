import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { SalesOrder, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { Invoice, InvoiceStatus } from '../../../database/entities/invoice.entity';
import { Payment, PaymentStatus } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Product } from '../../../database/entities/product.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { PurchaseOrderItem } from '../../../database/entities/purchase-order-item.entity';
import {
  SalesAnalyticsQueryDto,
  SalesAnalyticsResponseDto,
  SalesMetricsDto,
  PeriodMetricDto,
  TopCustomerDto,
  TopProductDto,
  DateRange,
  SalesPipelineQueryDto,
  SalesPipelineResponseDto,
  PipelineStageDto,
  CustomerAnalyticsQueryDto,
  CustomerMetricsDto,
  RevenueReportQueryDto,
  RevenueReportResponseDto,
  RevenueDataDto,
} from '../dto/sales-analytics.dto';

@Injectable()
export class SalesAnalyticsService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepository: Repository<SalesOrderItem>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemRepository: Repository<PurchaseOrderItem>,
  ) {}

  async getSalesAnalytics(query: SalesAnalyticsQueryDto): Promise<SalesAnalyticsResponseDto> {
    const { startDate, endDate } = this.parseDateRange(query.dateRange, query.startDate, query.endDate);

    // Get metrics in parallel
    const [
      metrics,
      periodData,
      topCustomers,
      topProducts,
    ] = await Promise.all([
      this.calculateSalesMetrics(startDate, endDate, query),
      this.getPeriodData(startDate, endDate, query.groupBy || 'month'),
      this.getTopCustomers(startDate, endDate, 10),
      this.getTopProducts(startDate, endDate, 10),
    ]);

    return {
      metrics,
      periodData,
      topCustomers,
      topProducts,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  async getSalesPipeline(query: SalesPipelineQueryDto): Promise<SalesPipelineResponseDto> {
    const { startDate, endDate } = this.parseDateRange(query.dateRange, query.startDate, query.endDate);

    let queryBuilder = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (query.customerId) {
      queryBuilder = queryBuilder.andWhere('order.customerId = :customerId', { customerId: query.customerId });
    }

    if (query.salesRepId) {
      queryBuilder = queryBuilder.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
    }

    // Get pipeline stages
    const stagesData = await queryBuilder
      .select([
        'order.status',
        'COUNT(*) as orderCount',
        'COALESCE(SUM(order.totalAmount), 0) as totalValue',
        'COALESCE(AVG(order.totalAmount), 0) as averageValue',
      ])
      .groupBy('order.status')
      .getRawMany();

    const totalOrders = stagesData.reduce((sum, stage) => sum + parseInt(stage.orderCount), 0);
    const totalValue = stagesData.reduce((sum, stage) => sum + parseFloat(stage.totalValue), 0);

    const stages: PipelineStageDto[] = stagesData.map(stage => ({
      status: stage.order_status,
      statusLabel: this.formatStatusLabel(stage.order_status),
      orderCount: parseInt(stage.orderCount),
      totalValue: parseFloat(stage.totalValue),
      averageValue: parseFloat(stage.averageValue),
      percentage: totalOrders > 0 ? (parseInt(stage.orderCount) / totalOrders) * 100 : 0,
    }));

    // Calculate conversion rate (completed orders / total orders)
    const completedOrders = stagesData
      .filter(stage => stage.order_status === SalesOrderStatus.COMPLETED)
      .reduce((sum, stage) => sum + parseInt(stage.orderCount), 0);

    const conversionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

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

    const { startDate, endDate } = this.parseDateRange(query.dateRange, query.startDate, query.endDate);

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
      .andWhere('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    const [orderStats, paymentStats] = await Promise.all([
      ordersQuery
        .select([
          'COUNT(*) as totalOrders',
          'COALESCE(SUM(order.totalAmount), 0) as totalRevenue',
          'COALESCE(AVG(order.totalAmount), 0) as averageOrderValue',
          'MIN(order.orderDate) as firstOrderDate',
          'MAX(order.orderDate) as lastOrderDate',
        ])
        .getRawOne(),
      
      this.paymentRepository
        .createQueryBuilder('payment')
        .where('payment.customerId = :customerId', { customerId: query.customerId })
        .andWhere('payment.paymentDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('payment.status = :status', { status: PaymentStatus.COMPLETED })
        .select('COALESCE(AVG(EXTRACT(DAY FROM (payment.paymentDate - invoice.invoiceDate))), 0)', 'avgPaymentDays')
        .leftJoin('payment.invoice', 'invoice')
        .getRawOne(),
    ]);

    const daysSinceLastOrder = customer.lastPurchaseDate 
      ? Math.floor((Date.now() - customer.lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    // Calculate payment score based on payment history
    const avgPaymentDays = parseFloat(paymentStats.avgPaymentDays) || 30;
    const standardPaymentTerms = 30; // Default payment terms
    let paymentScore = 100;
    if (avgPaymentDays > standardPaymentTerms) {
      paymentScore = Math.max(0, 100 - ((avgPaymentDays - standardPaymentTerms) * 2));
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

  async getRevenueReport(query: RevenueReportQueryDto): Promise<RevenueReportResponseDto> {
    const { startDate, endDate } = this.parseDateRange(query.period, query.startDate, query.endDate);
    const groupBy = query.groupBy || 'month';

    // Get current period data
    const currentPeriodData = await this.getRevenueDataByPeriod(startDate, endDate, groupBy);

    let previousPeriodData: RevenueDataDto[] = [];
    let previousPeriodTotals = { totalRevenue: 0, totalOrders: 0 };

    if (query.includeComparison) {
      const periodDuration = endDate.getTime() - startDate.getTime();
      const previousStartDate = new Date(startDate.getTime() - periodDuration);
      const previousEndDate = new Date(startDate.getTime() - 1);

      previousPeriodData = await this.getRevenueDataByPeriod(previousStartDate, previousEndDate, groupBy);
      
      const previousStats = await this.invoiceRepository
        .createQueryBuilder('invoice')
        .where('invoice.invoiceDate BETWEEN :startDate AND :endDate', {
          startDate: previousStartDate,
          endDate: previousEndDate,
        })
        // All invoice statuses are valid (no cancelled status anymore)
        .select([
          'COALESCE(SUM(invoice.paidAmount), 0) as totalRevenue',
          'COUNT(*) as totalOrders',
        ])
        .getRawOne();

      previousPeriodTotals = {
        totalRevenue: parseFloat(previousStats.totalRevenue) || 0,
        totalOrders: parseInt(previousStats.totalOrders) || 0,
      };
    }

    // Calculate current period totals
    const currentPeriodTotals = currentPeriodData.reduce(
      (acc, item) => ({
        totalRevenue: acc.totalRevenue + item.revenue,
        totalOrders: acc.totalOrders + item.orders,
      }),
      { totalRevenue: 0, totalOrders: 0 },
    );

    // Add comparison data to current period data
    const dataWithComparison = currentPeriodData.map((current, index) => {
      const previous = previousPeriodData[index];
      return {
        ...current,
        previousPeriodRevenue: previous?.revenue,
        growthPercentage: previous?.revenue 
          ? ((current.revenue - previous.revenue) / previous.revenue) * 100 
          : undefined,
      };
    });

    const growthPercentage = previousPeriodTotals.totalRevenue > 0
      ? ((currentPeriodTotals.totalRevenue - previousPeriodTotals.totalRevenue) / previousPeriodTotals.totalRevenue) * 100
      : 0;

    return {
      data: dataWithComparison,
      totalRevenue: currentPeriodTotals.totalRevenue,
      totalOrders: currentPeriodTotals.totalOrders,
      averageOrderValue: currentPeriodTotals.totalOrders > 0 
        ? currentPeriodTotals.totalRevenue / currentPeriodTotals.totalOrders 
        : 0,
      previousPeriodRevenue: previousPeriodTotals.totalRevenue,
      growthPercentage,
      periodStart: startDate,
      periodEnd: endDate,
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
    let orderQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    let invoiceQuery = this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.invoiceDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (query?.customerId) {
      orderQuery = orderQuery.andWhere('order.customerId = :customerId', { customerId: query.customerId });
      invoiceQuery = invoiceQuery.andWhere('invoice.customerId = :customerId', { customerId: query.customerId });
    }

    if (query?.salesRepId) {
      orderQuery = orderQuery.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
    }

    const [orderStats, invoiceStats, customerStats, paymentStats] = await Promise.all([
      // Order statistics
      orderQuery
        .select([
          'COALESCE(SUM(order.totalAmount), 0) as totalRevenue',
          'COUNT(*) as totalOrders',
          'COALESCE(AVG(order.totalAmount), 0) as averageOrderValue',
          'COUNT(CASE WHEN order.status = :completed THEN 1 END) as completedOrders',
          'COUNT(CASE WHEN order.status = :confirmed THEN 1 END) as confirmedOrders',
          'COUNT(CASE WHEN order.status = :draft THEN 1 END) as draftOrders',
        ])
        .setParameters({
          completed: SalesOrderStatus.COMPLETED,
          confirmed: SalesOrderStatus.CONFIRMED,
          draft: SalesOrderStatus.DRAFT,
        })
        .getRawOne(),

      // Invoice statistics
      invoiceQuery
        .select([
          'COALESCE(SUM(CASE WHEN invoice.status = :paid THEN invoice.totalAmount ELSE 0 END), 0) as paidInvoicesAmount',
          'COALESCE(SUM(CASE WHEN invoice.status IN (:...pending) THEN invoice.balanceDue ELSE 0 END), 0) as pendingInvoicesAmount',
          // Overdue calculation removed as it depends on dueDate
          '0 as overdueInvoicesAmount',
        ])
        .setParameters({
          paid: InvoiceStatus.PAID,
          pending: [InvoiceStatus.DRAFT, InvoiceStatus.PARTIAL_PAID],
        })
        .getRawOne(),

      // New customers in period
      this.customerRepository
        .createQueryBuilder('customer')
        .where('customer.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
        .getCount(),

      // Payment statistics for conversion rate
      this.paymentRepository
        .createQueryBuilder('payment')
        .where('payment.paymentDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('payment.status = :completed', { completed: PaymentStatus.COMPLETED })
        .getCount(),
    ]);

    // Calculate conversion rate based on completed orders vs total orders
    const conversionRate = parseInt(orderStats.totalOrders) > 0 
      ? (parseInt(orderStats.completedOrders) / parseInt(orderStats.totalOrders)) * 100 
      : 0;

    return {
      totalRevenue: parseFloat(orderStats.totalRevenue) || 0,
      totalOrders: parseInt(orderStats.totalOrders) || 0,
      newCustomers: customerStats || 0,
      averageOrderValue: parseFloat(orderStats.averageOrderValue) || 0,
      conversionRate,
      paidInvoicesAmount: parseFloat(invoiceStats.paidInvoicesAmount) || 0,
      pendingInvoicesAmount: parseFloat(invoiceStats.pendingInvoicesAmount) || 0,
      overdueInvoicesAmount: parseFloat(invoiceStats.overdueInvoicesAmount) || 0,
      completedOrders: parseInt(orderStats.completedOrders) || 0,
      confirmedOrders: parseInt(orderStats.confirmedOrders) || 0,
      draftOrders: parseInt(orderStats.draftOrders) || 0,
    };
  }

  private async getPeriodData(startDate: Date, endDate: Date, groupBy: string): Promise<PeriodMetricDto[]> {
    let dateFormat: string;
    let dateInterval: string;

    switch (groupBy) {
      case 'day':
        dateFormat = '%Y-%m-%d';
        dateInterval = '1 day';
        break;
      case 'week':
        dateFormat = '%Y-%u';
        dateInterval = '1 week';
        break;
      case 'quarter':
        dateFormat = '%Y-Q%q';
        dateInterval = '3 months';
        break;
      case 'year':
        dateFormat = '%Y';
        dateInterval = '1 year';
        break;
      default: // month
        dateFormat = '%Y-%m';
        dateInterval = '1 month';
        break;
    }

    const data = await this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .select([
        `DATE_FORMAT(order.orderDate, '${dateFormat}') as period`,
        'COUNT(*) as orders',
        'COALESCE(SUM(order.totalAmount), 0) as revenue',
        'COALESCE(AVG(order.totalAmount), 0) as averageOrderValue',
      ])
      .groupBy('period')
      .orderBy('period', 'ASC')
      .getRawMany();

    // Also get new customers for each period
    const customerData = await this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate })
      .select([
        `DATE_FORMAT(customer.createdAt, '${dateFormat}') as period`,
        'COUNT(*) as newCustomers',
      ])
      .groupBy('period')
      .orderBy('period', 'ASC')
      .getRawMany();

    const customerMap = new Map(customerData.map(item => [item.period, parseInt(item.newCustomers)]));

    return data.map(item => ({
      period: item.period,
      revenue: parseFloat(item.revenue) || 0,
      orders: parseInt(item.orders) || 0,
      newCustomers: customerMap.get(item.period) || 0,
      averageOrderValue: parseFloat(item.averageOrderValue) || 0,
    }));
  }

  private async getTopCustomers(startDate: Date, endDate: Date, limit: number): Promise<TopCustomerDto[]> {
    const data = await this.salesOrderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .where('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .select([
        'customer.id as customerId',
        'customer.name as customerName',
        'customer.phone as customerEmail',
        'COUNT(*) as totalOrders',
        'COALESCE(SUM(order.totalAmount), 0) as totalRevenue',
        'COALESCE(AVG(order.totalAmount), 0) as averageOrderValue',
        'MAX(order.orderDate) as lastOrderDate',
      ])
      .groupBy('customer.id')
      .orderBy('totalRevenue', 'DESC')
      .limit(limit)
      .getRawMany();

    return data.map(item => ({
      customerId: item.customerId,
      customerName: item.customerName,
      customerEmail: item.customerEmail,
      totalRevenue: parseFloat(item.totalRevenue) || 0,
      totalOrders: parseInt(item.totalOrders) || 0,
      averageOrderValue: parseFloat(item.averageOrderValue) || 0,
      lastOrderDate: item.lastOrderDate,
    }));
  }

  private async getTopProducts(startDate: Date, endDate: Date, limit: number): Promise<TopProductDto[]> {
    const data = await this.salesOrderItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.salesOrder', 'order')
      .where('order.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .select([
        'product.id as productId',
        'product.barcode as productSku',
        'product.name as productName',
        'SUM(item.quantity) as quantitySold',
        'COALESCE(SUM(item.totalAmount), 0) as totalRevenue',
        'COALESCE(AVG(item.unitPrice), 0) as averagePrice',
        'COUNT(DISTINCT order.id) as orderCount',
      ])
      .groupBy('product.id')
      .orderBy('quantitySold', 'DESC')
      .limit(limit)
      .getRawMany();

    return data.map(item => ({
      productId: item.productId,
      productSku: item.productSku,
      productName: item.productName,
      quantitySold: parseInt(item.quantitySold) || 0,
      totalRevenue: parseFloat(item.totalRevenue) || 0,
      averagePrice: parseFloat(item.averagePrice) || 0,
      orderCount: parseInt(item.orderCount) || 0,
    }));
  }

  private async getRevenueDataByPeriod(
    startDate: Date,
    endDate: Date,
    groupBy: string,
  ): Promise<RevenueDataDto[]> {
    let dateFormat: string;

    switch (groupBy) {
      case 'day':
        dateFormat = '%Y-%m-%d';
        break;
      case 'week':
        dateFormat = '%Y-%u';
        break;
      default: // month
        dateFormat = '%Y-%m';
        break;
    }

    const data = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.invoiceDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .select([
        `DATE_FORMAT(invoice.invoiceDate, '${dateFormat}') as period`,
        'COALESCE(SUM(invoice.paidAmount), 0) as revenue',
        'COUNT(*) as orders',
        'COALESCE(AVG(invoice.totalAmount), 0) as averageOrderValue',
      ])
      .groupBy('period')
      .orderBy('period', 'ASC')
      .getRawMany();

    return data.map(item => ({
      period: item.period,
      revenue: parseFloat(item.revenue) || 0,
      orders: parseInt(item.orders) || 0,
      averageOrderValue: parseFloat(item.averageOrderValue) || 0,
    }));
  }

  private parseDateRange(
    dateRange?: DateRange,
    customStartDate?: Date,
    customEndDate?: Date,
  ): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now.setHours(23, 59, 59, 999));

    if (dateRange === DateRange.CUSTOM && customStartDate && customEndDate) {
      return {
        startDate: new Date(customStartDate),
        endDate: new Date(customEndDate),
      };
    }

    switch (dateRange) {
      case DateRange.TODAY:
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case DateRange.THIS_WEEK:
        startDate = new Date(now.setDate(now.getDate() - now.getDay()));
        startDate.setHours(0, 0, 0, 0);
        break;
      case DateRange.THIS_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case DateRange.THIS_QUARTER:
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case DateRange.THIS_YEAR:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case DateRange.LAST_WEEK:
        startDate = new Date(now.setDate(now.getDate() - now.getDay() - 7));
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now.setDate(now.getDate() - now.getDay() - 1));
        endDate.setHours(23, 59, 59, 999);
        break;
      case DateRange.LAST_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case DateRange.LAST_QUARTER:
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const quarterStart = lastQuarter < 0 ? 3 : lastQuarter;
        startDate = new Date(year, quarterStart * 3, 1);
        endDate = new Date(year, quarterStart * 3 + 3, 0, 23, 59, 59, 999);
        break;
      case DateRange.LAST_YEAR:
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      default: // THIS_MONTH
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    return { startDate, endDate };
  }

  private formatStatusLabel(status: SalesOrderStatus): string {
    switch (status) {
      case SalesOrderStatus.DRAFT:
        return 'Draft';
      case SalesOrderStatus.CONFIRMED:
        return 'Confirmed';
      case SalesOrderStatus.COMPLETED:
        return 'Completed';
      case SalesOrderStatus.CANCELLED:
        return 'Cancelled';
      default:
        return status;
    }
  }

  async getProductSummary(query: {
    dateFrom?: Date;
    dateTo?: Date;
    categoryId?: string;
    productIds?: string[];
  }) {
    // Build WHERE conditions for products
    const productWhere: any = { isActive: true };

    if (query.categoryId) {
      productWhere.categoryId = query.categoryId;
    }

    if (query.productIds && query.productIds.length > 0) {
      productWhere.id = In(query.productIds);
    }

    // Get all products matching the filter
    const products = await this.productRepository.find({
      where: productWhere,
      relations: ['category'],
    });

    // Build date range for sales and purchase orders
    const dateWhere: any = {};
    if (query.dateFrom && query.dateTo) {
      dateWhere.orderDate = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      dateWhere.orderDate = Between(query.dateFrom, new Date());
    } else if (query.dateTo) {
      dateWhere.orderDate = Between(new Date('2000-01-01'), query.dateTo);
    }

    // Get sales data for each product
    const productSummaries = await Promise.all(
      products.map(async (product) => {
        // Get sales order items for this product
        const salesItemsQuery = this.salesOrderItemRepository
          .createQueryBuilder('item')
          .leftJoinAndSelect('item.salesOrder', 'order')
          .where('item.productId = :productId', { productId: product.id })
          .andWhere('order.status NOT IN (:...excludedStatuses)', {
            excludedStatuses: [SalesOrderStatus.CANCELLED, SalesOrderStatus.DRAFT],
          });

        if (query.dateFrom) {
          salesItemsQuery.andWhere('order.orderDate >= :dateFrom', { dateFrom: query.dateFrom });
        }
        if (query.dateTo) {
          salesItemsQuery.andWhere('order.orderDate <= :dateTo', { dateTo: query.dateTo });
        }

        const salesItems = await salesItemsQuery.getMany();

        // Calculate sales metrics
        const soldQty = salesItems.reduce((sum, item) => sum + Number(item.quantity), 0);
        const totalSales = salesItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);

        // Calculate COGS using actual unitCost from sales order items
        // This represents the cost of goods that were actually SOLD
        const cost = salesItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitCost || 0)), 0);

        // Get purchase order items for this product
        const purchaseItemsQuery = this.purchaseOrderItemRepository
          .createQueryBuilder('item')
          .leftJoinAndSelect('item.purchaseOrder', 'po')
          .where('item.productId = :productId', { productId: product.id });

        if (query.dateFrom) {
          purchaseItemsQuery.andWhere('po.orderDate >= :dateFrom', { dateFrom: query.dateFrom });
        }
        if (query.dateTo) {
          purchaseItemsQuery.andWhere('po.orderDate <= :dateTo', { dateTo: query.dateTo });
        }

        const purchaseItems = await purchaseItemsQuery.getMany();

        // Calculate purchase metrics
        const purchaseQty = purchaseItems.reduce((sum, item) => sum + Number(item.quantity), 0);
        const purchaseSubtotal = purchaseItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitCost)), 0);

        // Sales Profit = Revenue - COGS (profitability view)
        const salesProfit = totalSales - cost;

        // Total Profit = Revenue - Total Purchases (cash flow view)
        // This shows the net cash impact considering inventory purchases
        const totalProfit = totalSales - purchaseSubtotal;

        return {
          productId: product.id,
          productName: product.name,
          category: product.category?.name || 'Uncategorized',
          soldQty,
          totalSales,
          cost,
          salesProfit,
          purchaseQty,
          purchaseSubtotal,
          totalProfit,
        };
      })
    );

    return {
      data: productSummaries,
    };
  }

  async getProductDetails(query: {
    dateFrom?: Date;
    dateTo?: Date;
    categoryId?: string;
    productIds?: string[];
  }) {
    // Build WHERE conditions for products
    const productWhere: any = { isActive: true };

    if (query.categoryId) {
      productWhere.categoryId = query.categoryId;
    }

    if (query.productIds && query.productIds.length > 0) {
      productWhere.id = In(query.productIds);
    }

    // Get all products matching the filter
    const products = await this.productRepository.find({
      where: productWhere,
      relations: ['category'],
    });

    // Get all transaction details for each product
    const productDetails: any[] = [];

    for (const product of products) {
      // Get sales order items for this product
      const salesItemsQuery = this.salesOrderItemRepository
        .createQueryBuilder('item')
        .leftJoinAndSelect('item.salesOrder', 'order')
        .leftJoinAndSelect('order.customer', 'customer')
        .leftJoin('order.invoices', 'invoice')
        .where('item.productId = :productId', { productId: product.id })
        .andWhere('order.status NOT IN (:...excludedStatuses)', {
          excludedStatuses: [SalesOrderStatus.CANCELLED, SalesOrderStatus.DRAFT],
        });

      if (query.dateFrom) {
        salesItemsQuery.andWhere('invoice.invoiceDate >= :dateFrom', { dateFrom: query.dateFrom });
      }
      if (query.dateTo) {
        salesItemsQuery.andWhere('invoice.invoiceDate <= :dateTo', { dateTo: query.dateTo });
      }

      const salesItems = await salesItemsQuery
        .orderBy('order.orderDate', 'DESC')
        .getMany();

      // Transform sales items to detail records
      for (const item of salesItems) {
        const order = item.salesOrder;
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        const unitCost = Number(item.unitCost || 0); // Use cost from sales order item
        const totalAmount = quantity * unitPrice;
        const totalCost = quantity * unitCost;
        const profit = totalAmount - totalCost;

        // Determine price level from customer or default to retail
        let priceLevel = 'Retail';
        if (order.customer?.priceLevel) {
          const level = order.customer.priceLevel;
          priceLevel = level.charAt(0).toUpperCase() + level.slice(1);
        }

        productDetails.push({
          transactionType: 'Sale',
          transactionDate: order.orderDate,
          documentNumber: order.orderNumber,
          customerSupplier: order.customer?.name || 'Unknown',
          productId: product.id,
          productName: product.name,
          category: product.category?.name || 'Uncategorized',
          quantity: quantity,
          unitPrice: unitPrice,
          priceLevel: priceLevel,
          totalAmount: totalAmount,
          cost: totalCost,
          profit: profit,
        });
      }
    }

    // Sort by transaction date descending
    productDetails.sort((a, b) => {
      const dateA = new Date(a.transactionDate).getTime();
      const dateB = new Date(b.transactionDate).getTime();
      return dateB - dateA;
    });

    return {
      data: productDetails,
    };
  }

  async getSalesOrderProfitReport(query: {
    dateFrom?: Date;
    dateTo?: Date;
    customerId?: string;
    status?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for sales orders
    const orderWhere: any = {};

    if (query.customerId) {
      orderWhere.customerId = query.customerId;
    }

    // Filter by fulfillment status if specified
    if (query.status && query.status !== 'all') {
      if (query.status === 'fulfilled') {
        orderWhere.isFulfilled = true;
      } else if (query.status === 'unfulfilled') {
        orderWhere.isFulfilled = false;
      }
    }

    // Build date range for orders
    if (query.dateFrom && query.dateTo) {
      orderWhere.orderDate = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      orderWhere.orderDate = Between(query.dateFrom, new Date());
    } else if (query.dateTo) {
      orderWhere.orderDate = Between(new Date('2000-01-01'), query.dateTo);
    }

    // Get all sales orders with items and invoices for payment status
    const orders = await this.salesOrderRepository.find({
      where: orderWhere,
      relations: ['customer', 'items', 'items.product', 'invoices', 'invoices.payments'],
      order: { orderNumber: 'ASC' },
    });

    // Calculate profit for each order and filter by payment status if needed
    let profitReports = orders.map((order) => {
      const items = order.items || [];

      // Calculate totals from items
      const totalRevenue = items.reduce((sum, item) => {
        return sum + Number(item.totalAmount || 0);
      }, 0);

      const totalCost = items.reduce((sum, item) => {
        const quantity = Number(item.quantity || 0);
        const unitCost = Number(item.unitCost || 0);
        return sum + (quantity * unitCost);
      }, 0);

      const grossProfit = totalRevenue - totalCost;

      // Calculate payment status from invoices
      const invoices = order.invoices || [];
      const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
      const totalPaid = invoices.reduce((sum, inv) => {
        const payments = inv.payments || [];
        return sum + payments.reduce((pSum, p) => pSum + Number(p.amount || 0), 0);
      }, 0);

      let paymentStatus = 'unpaid';
      if (totalPaid >= totalInvoiced && totalInvoiced > 0) {
        paymentStatus = totalPaid > totalInvoiced ? 'overpaid' : 'paid';
      } else if (totalPaid > 0) {
        paymentStatus = 'partial';
      }

      return {
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        customerName: order.customer?.name || 'Unknown',
        inventoryStatus: order.isFulfilled ? 'fulfilled' : 'unfulfilled',
        paymentStatus,
        totalRevenue,
        totalCost,
        grossProfit,
      };
    });

    // Filter by payment status if specified
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      profitReports = profitReports.filter(report => report.paymentStatus === query.paymentStatus);
    }

    // Sort by order number (extract numeric part for proper sorting)
    profitReports.sort((a, b) => {
      const numA = parseInt(a.orderNumber.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.orderNumber.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return {
      data: profitReports,
    };
  }

  async getCustomerPaymentSummary(query: {
    dateFrom?: Date;
    dateTo?: Date;
    customerId?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for sales orders
    const orderWhere: any = {};

    if (query.customerId) {
      orderWhere.customerId = query.customerId;
    }

    // Build date range for orders
    if (query.dateFrom && query.dateTo) {
      orderWhere.orderDate = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      orderWhere.orderDate = Between(query.dateFrom, new Date());
    } else if (query.dateTo) {
      orderWhere.orderDate = Between(new Date('2000-01-01'), query.dateTo);
    }

    // Get all sales orders with invoices and payments
    const orders = await this.salesOrderRepository.find({
      where: orderWhere,
      relations: ['customer', 'invoices', 'invoices.payments'],
      order: { orderDate: 'DESC' },
    });

    // Group by customer and calculate payment status
    const customerPaymentMap = new Map<string, {
      customerId: string;
      customerName: string;
      customerPhone: string;
      totalInvoiced: number;
      totalPaid: number;
      totalPayments: number;
      paymentCount: number;
      lastPaymentDate: Date | null;
      firstPaymentDate: Date | null;
      lastOrderDate: Date | null;
      invoicesPaid: number;
      averagePaymentAmount: number;
      paymentStatus: string;
      orderCount: number;
    }>();

    orders.forEach((order) => {
      const customerId = order.customer?.id;
      const customerName = order.customer?.name || 'Unknown';
      const customerPhone = order.customer?.phone || '';

      if (!customerId) return;

      if (!customerPaymentMap.has(customerId)) {
        customerPaymentMap.set(customerId, {
          customerId,
          customerName,
          customerPhone,
          totalInvoiced: 0,
          totalPaid: 0,
          totalPayments: 0,
          paymentCount: 0,
          lastPaymentDate: null,
          firstPaymentDate: null,
          lastOrderDate: null,
          invoicesPaid: 0,
          averagePaymentAmount: 0,
          paymentStatus: 'unpaid',
          orderCount: 0,
        });
      }

      const customerData = customerPaymentMap.get(customerId)!;
      customerData.orderCount += 1;

      // Track last order date
      const orderDate = new Date(order.orderDate);
      if (!customerData.lastOrderDate || orderDate > customerData.lastOrderDate) {
        customerData.lastOrderDate = orderDate;
      }

      // Process invoices and payments
      const invoices = order.invoices || [];
      invoices.forEach((invoice) => {
        customerData.totalInvoiced += Number(invoice.totalAmount || 0);

        const payments = invoice.payments || [];
        payments.forEach((payment) => {
          const paymentAmount = Number(payment.amount || 0);
          customerData.totalPaid += paymentAmount;
          customerData.totalPayments += paymentAmount;
          customerData.paymentCount += 1;

          const paymentDate = new Date(payment.paymentDate);

          // Track date ranges
          if (!customerData.lastPaymentDate || paymentDate > customerData.lastPaymentDate) {
            customerData.lastPaymentDate = paymentDate;
          }
          if (!customerData.firstPaymentDate || paymentDate < customerData.firstPaymentDate) {
            customerData.firstPaymentDate = paymentDate;
          }
        });

        // Count invoices that have payments
        if (payments.length > 0) {
          customerData.invoicesPaid += 1;
        }
      });
    });

    // Calculate payment status and averages for each customer
    const customerSummaries = Array.from(customerPaymentMap.values()).map(customer => {
      // Calculate payment status based on total invoiced vs total paid
      if (customer.totalPaid >= customer.totalInvoiced && customer.totalInvoiced > 0) {
        customer.paymentStatus = customer.totalPaid > customer.totalInvoiced ? 'overpaid' : 'paid';
      } else if (customer.totalPaid > 0) {
        customer.paymentStatus = 'partial';
      } else {
        customer.paymentStatus = 'unpaid';
      }

      // Calculate average payment amount
      customer.averagePaymentAmount = customer.paymentCount > 0
        ? customer.totalPayments / customer.paymentCount
        : 0;

      return customer;
    });

    // Filter by payment status if specified
    let filteredSummaries = customerSummaries;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredSummaries = customerSummaries.filter(
        customer => customer.paymentStatus === query.paymentStatus
      );
    }

    // Sort by total payments descending
    filteredSummaries.sort((a, b) => b.totalPayments - a.totalPayments);

    return {
      data: filteredSummaries,
    };
  }

  async getCustomerPaymentByOrder(query: {
    dateFrom?: Date;
    dateTo?: Date;
    customerId?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for sales orders
    const orderWhere: any = {};

    if (query.customerId) {
      orderWhere.customerId = query.customerId;
    }

    // Build date range for orders
    if (query.dateFrom && query.dateTo) {
      orderWhere.orderDate = Between(query.dateFrom, query.dateTo);
    } else if (query.dateFrom) {
      orderWhere.orderDate = Between(query.dateFrom, new Date());
    } else if (query.dateTo) {
      orderWhere.orderDate = Between(new Date('2000-01-01'), query.dateTo);
    }

    // Get all sales orders with invoices and payments
    const orders = await this.salesOrderRepository.find({
      where: orderWhere,
      relations: ['customer', 'invoices', 'invoices.payments'],
      order: { orderNumber: 'ASC' },
    });

    // Transform to payment by order report format
    const paymentByOrderData: any[] = [];

    orders.forEach((order) => {
      const invoices = order.invoices || [];

      invoices.forEach((invoice) => {
        const payments = invoice.payments || [];

        // Calculate payment totals for this invoice
        const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalAmount = Number(invoice.totalAmount || 0);
        const balance = totalAmount - totalPaid;

        // Determine payment status
        let paymentStatus = 'unpaid';
        if (totalPaid >= totalAmount && totalAmount > 0) {
          paymentStatus = totalPaid > totalAmount ? 'overpaid' : 'paid';
        } else if (totalPaid > 0) {
          paymentStatus = 'partial';
        }

        // Find last payment date for this invoice
        let lastPaymentDate: Date | null = null;
        if (payments.length > 0) {
          lastPaymentDate = payments.reduce((latest, p) => {
            const pDate = new Date(p.paymentDate);
            return !latest || pDate > latest ? pDate : latest;
          }, null as Date | null);
        }

        paymentByOrderData.push({
          customerId: order.customer?.id || '',
          customerName: order.customer?.name || 'Unknown',
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate,
          inventoryStatus: order.isFulfilled ? 'fulfilled' : 'unfulfilled',
          totalAmount,
          paidAmount: totalPaid,
          balance,
          paymentStatus,
          lastPaymentDate,
        });
      });
    });

    // Filter by payment status if specified
    let filteredData = paymentByOrderData;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredData = paymentByOrderData.filter(
        item => item.paymentStatus === query.paymentStatus
      );
    }

    // Sort by order number (extract numeric part for proper sorting)
    filteredData.sort((a, b) => {
      const numA = parseInt(a.orderNumber.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.orderNumber.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    return {
      data: filteredData,
    };
  }

  async getCustomerPaymentDetails(query: {
    dateFrom?: Date;
    dateTo?: Date;
    customerId?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for payments
    let paymentQuery = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.invoice', 'invoice')
      .leftJoinAndSelect('invoice.salesOrder', 'salesOrder')
      .leftJoinAndSelect('salesOrder.customer', 'customer');

    // Apply date range filter on payment date
    if (query.dateFrom && query.dateTo) {
      paymentQuery = paymentQuery.andWhere('payment.paymentDate BETWEEN :dateFrom AND :dateTo', {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });
    } else if (query.dateFrom) {
      paymentQuery = paymentQuery.andWhere('payment.paymentDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    } else if (query.dateTo) {
      paymentQuery = paymentQuery.andWhere('payment.paymentDate <= :dateTo', {
        dateTo: query.dateTo,
      });
    }

    // Apply customer filter
    if (query.customerId) {
      paymentQuery = paymentQuery.andWhere('customer.id = :customerId', {
        customerId: query.customerId,
      });
    }

    // Get all payments
    const payments = await paymentQuery
      .orderBy('payment.paymentDate', 'DESC')
      .addOrderBy('payment.paymentNumber', 'DESC')
      .getMany();

    // Transform to payment details format
    const paymentDetailsData = payments.map((payment) => {
      const invoice = payment.invoice;
      const salesOrder = invoice?.salesOrder;
      const customer = salesOrder?.customer;

      // Calculate payment status for the invoice
      const totalAmount = Number(invoice?.totalAmount || 0);
      const paidAmount = Number(invoice?.paidAmount || 0);
      const balance = totalAmount - paidAmount;

      let paymentStatus = 'unpaid';
      if (paidAmount >= totalAmount && totalAmount > 0) {
        paymentStatus = paidAmount > totalAmount ? 'overpaid' : 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      }

      return {
        paymentId: payment.id,
        paymentNumber: payment.paymentNumber,
        paymentDate: payment.paymentDate,
        paymentAmount: Number(payment.amount || 0),
        paymentMethod: payment.paymentMethod || 'cash',
        customerId: customer?.id || '',
        customerName: customer?.name || 'Unknown',
        orderNumber: salesOrder?.orderNumber || '',
        orderDate: salesOrder?.orderDate || null,
        invoiceNumber: invoice?.invoiceNumber || '',
        invoiceDate: invoice?.invoiceDate || null,
        invoiceTotal: totalAmount,
        invoicePaid: paidAmount,
        invoiceBalance: balance,
        paymentStatus,
        inventoryStatus: salesOrder?.isFulfilled ? 'fulfilled' : 'unfulfilled',
        notes: payment.notes || '',
      };
    });

    // Filter by payment status if specified
    let filteredData = paymentDetailsData;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredData = paymentDetailsData.filter(
        item => item.paymentStatus === query.paymentStatus
      );
    }

    return {
      data: filteredData,
    };
  }

  async getCustomerOrderHistory(query: {
    dateFrom?: Date;
    dateTo?: Date;
    customerId?: string;
    categoryId?: string;
    productIds?: string[];
    inventoryStatus?: string;
    paymentStatus?: string;
  }) {
    // Build WHERE conditions for sales orders
    let orderQuery = this.salesOrderRepository
      .createQueryBuilder('salesOrder')
      .leftJoinAndSelect('salesOrder.customer', 'customer')
      .leftJoinAndSelect('salesOrder.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('salesOrder.invoices', 'invoices')
      .leftJoinAndSelect('invoices.payments', 'payments');

    // Apply date range filter on order date
    if (query.dateFrom && query.dateTo) {
      orderQuery = orderQuery.andWhere('salesOrder.orderDate BETWEEN :dateFrom AND :dateTo', {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });
    } else if (query.dateFrom) {
      orderQuery = orderQuery.andWhere('salesOrder.orderDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    } else if (query.dateTo) {
      orderQuery = orderQuery.andWhere('salesOrder.orderDate <= :dateTo', {
        dateTo: query.dateTo,
      });
    }

    // Apply customer filter
    if (query.customerId) {
      orderQuery = orderQuery.andWhere('customer.id = :customerId', {
        customerId: query.customerId,
      });
    }

    // Apply category filter
    if (query.categoryId) {
      orderQuery = orderQuery.andWhere('category.id = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    // Apply product filter
    if (query.productIds && query.productIds.length > 0) {
      orderQuery = orderQuery.andWhere('product.id IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Apply inventory status filter
    if (query.inventoryStatus && query.inventoryStatus !== 'all') {
      if (query.inventoryStatus === 'fulfilled') {
        orderQuery = orderQuery.andWhere('salesOrder.isFulfilled = :isFulfilled', {
          isFulfilled: true,
        });
      } else if (query.inventoryStatus === 'unfulfilled') {
        orderQuery = orderQuery.andWhere('salesOrder.isFulfilled = :isFulfilled', {
          isFulfilled: false,
        });
      }
    }

    // Get all orders
    const orders = await orderQuery
      .orderBy('salesOrder.orderDate', 'DESC')
      .addOrderBy('salesOrder.orderNumber', 'DESC')
      .getMany();

    // Remove duplicates if filtering by products (since one order can have multiple products)
    const uniqueOrders = Array.from(
      new Map(orders.map(order => [order.id, order])).values()
    );

    // Transform to order history format - return individual line items
    const orderHistoryData: any[] = [];

    uniqueOrders.forEach((order) => {
      const customer = order.customer;
      const items = order.items || [];
      const invoices = order.invoices || [];

      // Calculate total amount from items
      const totalAmount = items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

      // Calculate paid amount from all payments
      const paidAmount = invoices.reduce((sum, invoice) => {
        const payments = invoice.payments || [];
        return sum + payments.reduce((pSum, payment) => pSum + Number(payment.amount || 0), 0);
      }, 0);

      // Determine payment status
      let paymentStatus = 'unpaid';
      if (paidAmount >= totalAmount && totalAmount > 0) {
        paymentStatus = paidAmount > totalAmount ? 'overpaid' : 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      }

      // Create a row for each line item
      items.forEach((item) => {
        const product = item.product;
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unitPrice || 0);
        const amount = Number(item.totalAmount || 0);
        const unitCost = Number(product?.baseCost || 0);
        const cost = unitCost * quantity;
        const profit = amount - cost;

        orderHistoryData.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate,
          customerId: customer?.id || '',
          customerName: customer?.name || 'Unknown',
          productId: product?.id || '',
          productName: product?.name || 'Unknown Product',
          categoryName: product?.category?.name || '-',
          quantity,
          amount,
          cost,
          profit,
          paymentStatus,
          inventoryStatus: order.isFulfilled ? 'fulfilled' : 'unfulfilled',
        });
      });
    });

    // Filter by payment status if specified
    let filteredData = orderHistoryData;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredData = orderHistoryData.filter(
        item => item.paymentStatus === query.paymentStatus
      );
    }

    return {
      data: filteredData,
    };
  }
}