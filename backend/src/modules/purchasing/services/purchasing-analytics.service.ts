import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  Product,
  VendorPayment,
} from '../../../database/entities';
import { differenceInCalendarDays, subDays, subMonths, subYears } from 'date-fns';
import {
  PurchasingAnalyticsQueryDto,
  PurchasingAnalyticsResponseDto,
  PurchasingMetricsDto,
  PurchasingPeriodDataDto,
  PurchasingPeriodBlockDto,
  TopSupplierDto,
  RecentPurchaseOrderDto,
} from '../dto/purchasing-analytics.dto';
import { DateRange, GroupByPeriod } from '@/common/dto/analytics.dto';

interface PurchaseOrderSummaryQuery {
  dateFrom?: Date;
  dateTo?: Date;
  supplierId?: string;
  categoryId?: string;
  productIds?: string[];
  status?: string;
  paymentStatus?: string;
}

export interface PurchaseOrderSummaryItem {
  orderNumber: string;
  orderDate: string;
  supplierName: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  shippingAmount: number;
}

export interface PurchaseOrderDetailsItem {
  orderNumber: string;
  orderDate: string;
  supplierName: string;
  productName: string;
  categoryName: string;
  quantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
}

export interface VendorPaymentDetailsItem {
  paymentNumber: string;
  paymentDate: string;
  supplierName: string;
  orderNumber: string;
  orderDate: string | null;
  grnNumber: string | null;
  paymentAmount: number;
  paymentMethodId: string | null;
  referenceNumber: string | null;
  status: string;
  notes: string;
}

export interface VendorProductListItem {
  supplierName: string;
  productName: string;
  categoryName: string;
  orderNumber: string;
  orderDate: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  retailPrice: number;
  wholesalePrice: number;
  specialPrice: number;
}

@Injectable()
export class PurchasingAnalyticsService {
  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemRepository: Repository<PurchaseOrderItem>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(VendorPayment)
    private readonly vendorPaymentRepository: Repository<VendorPayment>,
  ) {}

  async getPurchaseOrderSummary(
    query: PurchaseOrderSummaryQuery,
  ): Promise<{ data: PurchaseOrderSummaryItem[] }> {
    const queryBuilder = this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.vendorPayments', 'vendorPayments')
      .where('po.isActive = :isActive', { isActive: true })
      .andWhere('po.deletedAt IS NULL');

    // Date filters
    if (query.dateFrom) {
      queryBuilder.andWhere('po.orderDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    }

    if (query.dateTo) {
      queryBuilder.andWhere('po.orderDate <= :dateTo', {
        dateTo: query.dateTo,
      });
    }

    // Supplier filter
    if (query.supplierId) {
      queryBuilder.andWhere('po.supplierId = :supplierId', {
        supplierId: query.supplierId,
      });
    }

    // Status filter
    if (query.status && query.status !== 'all') {
      if (query.status === 'received') {
        queryBuilder.andWhere('po.isFullyReceived = :isFullyReceived', {
          isFullyReceived: true,
        });
      } else if (query.status === 'pending') {
        queryBuilder.andWhere('po.isFullyReceived = :isFullyReceived', {
          isFullyReceived: false,
        });
      }
    }

    // Order by date
    queryBuilder.orderBy('po.orderDate', 'DESC');
    queryBuilder.addOrderBy('po.orderNumber', 'ASC');

    const purchaseOrders = await queryBuilder.getMany();

    // Filter by payment status after loading vendor payments
    let filteredOrders = purchaseOrders;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredOrders = purchaseOrders.filter((po) => {
        const totalAmount = parseFloat(po.totalAmount?.toString() || '0');
        const paidAmount = (po.vendorPayments || []).reduce(
          (sum, payment) => sum + parseFloat(payment.amount?.toString() || '0'),
          0,
        );

        let paymentStatus = 'unpaid';
        if (paidAmount >= totalAmount && totalAmount > 0) {
          paymentStatus = 'paid';
        } else if (paidAmount > 0) {
          paymentStatus = 'partial';
        }

        return paymentStatus === query.paymentStatus;
      });
    }

    const data: PurchaseOrderSummaryItem[] = filteredOrders.map((po) => {
      const supplier = po.supplier;
      const totalAmount = parseFloat(po.totalAmount?.toString() || '0');

      // Calculate paid amount from vendor payments
      const paidAmount = (po.vendorPayments || []).reduce(
        (sum, payment) => sum + parseFloat(payment.amount?.toString() || '0'),
        0,
      );

      const balance = totalAmount - paidAmount;

      // Determine payment status
      let paymentStatus = 'unpaid';
      if (paidAmount >= totalAmount && totalAmount > 0) {
        paymentStatus = 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      }

      // Safely handle orderDate conversion
      let orderDateStr = '';
      if (po.orderDate) {
        const date = po.orderDate instanceof Date ? po.orderDate : new Date(po.orderDate);
        orderDateStr = date.toISOString().split('T')[0];
      }

      return {
        orderNumber: po.orderNumber,
        orderDate: orderDateStr,
        supplierName: supplier?.companyName || 'N/A',
        status: po.isFullyReceived ? 'received' : 'pending',
        paymentStatus: paymentStatus,
        totalAmount: totalAmount,
        paidAmount: paidAmount,
        balance: balance,
        shippingAmount: parseFloat(po.shippingAmount?.toString() || '0'),
      };
    });

    return { data };
  }

  async getPurchaseOrderDetails(
    query: PurchaseOrderSummaryQuery,
  ): Promise<{ data: PurchaseOrderDetailsItem[] }> {
    const queryBuilder = this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('po.vendorPayments', 'vendorPayments')
      .where('po.isActive = :isActive', { isActive: true })
      .andWhere('po.deletedAt IS NULL');

    // Date filters
    if (query.dateFrom) {
      queryBuilder.andWhere('po.orderDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    }

    if (query.dateTo) {
      queryBuilder.andWhere('po.orderDate <= :dateTo', {
        dateTo: query.dateTo,
      });
    }

    // Supplier filter
    if (query.supplierId) {
      queryBuilder.andWhere('po.supplierId = :supplierId', {
        supplierId: query.supplierId,
      });
    }

    // Category filter
    if (query.categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    // Product filter
    if (query.productIds && query.productIds.length > 0) {
      queryBuilder.andWhere('items.productId IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Status filter
    if (query.status && query.status !== 'all') {
      if (query.status === 'received') {
        queryBuilder.andWhere('po.isFullyReceived = :isFullyReceived', {
          isFullyReceived: true,
        });
      } else if (query.status === 'pending') {
        queryBuilder.andWhere('po.isFullyReceived = :isFullyReceived', {
          isFullyReceived: false,
        });
      }
    }

    // Order by date
    queryBuilder.orderBy('po.orderDate', 'DESC');
    queryBuilder.addOrderBy('po.orderNumber', 'ASC');
    queryBuilder.addOrderBy('product.name', 'ASC');

    const purchaseOrders = await queryBuilder.getMany();

    // Filter by payment status and flatten items
    const detailsData: PurchaseOrderDetailsItem[] = [];

    for (const po of purchaseOrders) {
      const totalAmount = parseFloat(po.totalAmount?.toString() || '0');
      const paidAmount = (po.vendorPayments || []).reduce(
        (sum, payment) => sum + parseFloat(payment.amount?.toString() || '0'),
        0,
      );

      let paymentStatus = 'unpaid';
      if (paidAmount >= totalAmount && totalAmount > 0) {
        paymentStatus = 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      }

      // Check payment status filter
      if (query.paymentStatus && query.paymentStatus !== 'all' && paymentStatus !== query.paymentStatus) {
        continue;
      }

      // Safely handle orderDate conversion
      let orderDateStr = '';
      if (po.orderDate) {
        const date = po.orderDate instanceof Date ? po.orderDate : new Date(po.orderDate);
        orderDateStr = date.toISOString().split('T')[0];
      }

      // Create a detail row for each item
      for (const item of po.items || []) {
        const orderedQty = parseFloat(item.quantity?.toString() || '0');
        const receivedQty = parseFloat(item.receivedQuantity?.toString() || '0');
        const remainingQty = orderedQty - receivedQty;

        // Calculate item-level status based on received vs ordered quantity
        const itemStatus = receivedQty >= orderedQty ? 'received' : 'pending';

        detailsData.push({
          orderNumber: po.orderNumber,
          orderDate: orderDateStr,
          supplierName: po.supplier?.companyName || 'N/A',
          productName: item.product?.name || 'N/A',
          categoryName: item.product?.category?.name || 'N/A',
          quantity: orderedQty,
          receivedQuantity: receivedQty,
          remainingQuantity: remainingQty,
          unitPrice: parseFloat(item.unitCost?.toString() || '0'),
          discountPercent: parseFloat(item.discountPercent?.toString() || '0'),
          discountAmount: parseFloat(item.discountAmount?.toString() || '0'),
          totalAmount: parseFloat(item.totalAmount?.toString() || '0'),
          status: itemStatus,
          paymentStatus: paymentStatus,
        });
      }
    }

    return { data: detailsData };
  }

  async getVendorPaymentDetails(
    query: PurchaseOrderSummaryQuery,
  ): Promise<{ data: VendorPaymentDetailsItem[] }> {
    const queryBuilder = this.vendorPaymentRepository
      .createQueryBuilder('vp')
      .leftJoinAndSelect('vp.supplier', 'supplier')
      .leftJoinAndSelect('vp.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('vp.grn', 'grn')
      .where('vp.isActive = :isActive', { isActive: true })
      .andWhere('vp.deletedAt IS NULL');

    // Date filters - filter by payment date
    if (query.dateFrom) {
      queryBuilder.andWhere('vp.paymentDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    }

    if (query.dateTo) {
      queryBuilder.andWhere('vp.paymentDate <= :dateTo', {
        dateTo: query.dateTo,
      });
    }

    // Supplier filter
    if (query.supplierId) {
      queryBuilder.andWhere('vp.supplierId = :supplierId', {
        supplierId: query.supplierId,
      });
    }

    // Status filter
    if (query.status && query.status !== 'all') {
      queryBuilder.andWhere('vp.status = :status', {
        status: query.status,
      });
    }

    // Order by payment date and payment number
    queryBuilder.orderBy('vp.paymentDate', 'DESC');
    queryBuilder.addOrderBy('vp.paymentNumber', 'ASC');

    const vendorPayments = await queryBuilder.getMany();

    const data: VendorPaymentDetailsItem[] = vendorPayments.map((vp) => {
      // Safely handle paymentDate conversion
      let paymentDateStr = '';
      if (vp.paymentDate) {
        const date = vp.paymentDate instanceof Date ? vp.paymentDate : new Date(vp.paymentDate);
        paymentDateStr = date.toISOString().split('T')[0];
      }

      // Safely handle orderDate conversion
      let orderDateStr: string | null = null;
      if (vp.purchaseOrder?.orderDate) {
        const date = vp.purchaseOrder.orderDate instanceof Date ? vp.purchaseOrder.orderDate : new Date(vp.purchaseOrder.orderDate);
        orderDateStr = date.toISOString().split('T')[0];
      }

      return {
        paymentNumber: vp.paymentNumber,
        paymentDate: paymentDateStr,
        supplierName: vp.supplier?.companyName || 'N/A',
        orderNumber: vp.purchaseOrder?.orderNumber || '',
        orderDate: orderDateStr,
        grnNumber: vp.grn?.grnNumber || null,
        paymentAmount: parseFloat(vp.amount?.toString() || '0'),
        paymentMethodId: vp.paymentMethodId || null,
        referenceNumber: vp.referenceNumber || null,
        status: vp.status,
        notes: vp.notes || '',
      };
    });

    return { data };
  }

  async getVendorProductList(
    query: PurchaseOrderSummaryQuery,
  ): Promise<{ data: VendorProductListItem[] }> {
    const queryBuilder = this.purchaseOrderItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.purchaseOrder', 'purchaseOrder')
      .leftJoinAndSelect('purchaseOrder.supplier', 'supplier')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .where('purchaseOrder.isActive = :isActive', { isActive: true })
      .andWhere('purchaseOrder.deletedAt IS NULL');

    // Date filters - filter by order date
    if (query.dateFrom) {
      queryBuilder.andWhere('purchaseOrder.orderDate >= :dateFrom', {
        dateFrom: query.dateFrom,
      });
    }

    if (query.dateTo) {
      queryBuilder.andWhere('purchaseOrder.orderDate <= :dateTo', {
        dateTo: query.dateTo,
      });
    }

    // Supplier filter
    if (query.supplierId) {
      queryBuilder.andWhere('purchaseOrder.supplierId = :supplierId', {
        supplierId: query.supplierId,
      });
    }

    // Product filter
    if (query.productIds && query.productIds.length > 0) {
      queryBuilder.andWhere('item.productId IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Category filter
    if (query.categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    // Status filter (inventory status) - use isFullyReceived field
    if (query.status && query.status !== 'all') {
      if (query.status === 'received') {
        queryBuilder.andWhere('purchaseOrder.isFullyReceived = :isFullyReceived', {
          isFullyReceived: true,
        });
      } else if (query.status === 'pending') {
        queryBuilder.andWhere('purchaseOrder.isFullyReceived = :isFullyReceived', {
          isFullyReceived: false,
        });
      }
    }

    const items = await queryBuilder.getMany();

    // Filter by payment status after loading (calculated from paidAmount vs totalAmount)
    let filteredItems = items;
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      filteredItems = items.filter((item) => {
        const totalAmount = parseFloat(item.purchaseOrder?.totalAmount?.toString() || '0');
        const paidAmount = parseFloat(item.purchaseOrder?.paidAmount?.toString() || '0');

        let paymentStatus = 'unpaid';
        if (paidAmount >= totalAmount && totalAmount > 0) {
          paymentStatus = 'paid';
        } else if (paidAmount > 0) {
          paymentStatus = 'partial';
        }

        return paymentStatus === query.paymentStatus;
      });
    }

    // Group by product and supplier to get unique product-supplier combinations
    const productMap = new Map<string, VendorProductListItem>();

    for (const item of filteredItems) {
      if (!item.product) continue;

      const key = `${item.product.id}-${item.purchaseOrder?.supplier?.id || 'no-supplier'}`;

      if (!productMap.has(key)) {
        // First time seeing this product-supplier combination
        let orderDateStr = '';
        if (item.purchaseOrder?.orderDate) {
          const date = item.purchaseOrder.orderDate instanceof Date ? item.purchaseOrder.orderDate : new Date(item.purchaseOrder.orderDate);
          orderDateStr = date.toISOString().split('T')[0];
        }

        // Calculate item-level status
        const orderedQty = parseFloat(item.quantity?.toString() || '0');
        const receivedQty = parseFloat(item.receivedQuantity?.toString() || '0');
        const itemStatus = receivedQty >= orderedQty ? 'received' : 'pending';

        // Calculate payment status for the PO
        const totalAmount = parseFloat(item.purchaseOrder?.totalAmount?.toString() || '0');
        const paidAmount = parseFloat(item.purchaseOrder?.paidAmount?.toString() || '0');
        let poPaymentStatus = 'unpaid';
        if (paidAmount >= totalAmount && totalAmount > 0) {
          poPaymentStatus = 'paid';
        } else if (paidAmount > 0) {
          poPaymentStatus = 'partial';
        }

        // Note: Product pricing has been migrated to PriceList system
        // Setting pricing fields to 0 as they are no longer stored on Product entity
        productMap.set(key, {
          supplierName: item.purchaseOrder?.supplier?.companyName || 'N/A',
          productName: item.product.name || 'N/A',
          categoryName: item.product.category?.name || 'N/A',
          orderNumber: item.purchaseOrder?.orderNumber || '',
          orderDate: orderDateStr,
          quantity: orderedQty,
          receivedQuantity: receivedQty,
          unitPrice: parseFloat(item.unitCost?.toString() || '0'),
          totalAmount: parseFloat(item.totalAmount?.toString() || '0'),
          status: itemStatus,
          paymentStatus: poPaymentStatus,
          retailPrice: 0,
          wholesalePrice: 0,
          specialPrice: 0,
        });
      } else {
        // Aggregate quantities and amounts for this product-supplier combination
        const existing = productMap.get(key)!;
        existing.quantity += parseFloat(item.quantity?.toString() || '0');
        existing.receivedQuantity += parseFloat(item.receivedQuantity?.toString() || '0');
        existing.totalAmount += parseFloat(item.totalAmount?.toString() || '0');

        // Keep the most recent order info
        if (item.purchaseOrder?.orderDate) {
          const date = item.purchaseOrder.orderDate instanceof Date ? item.purchaseOrder.orderDate : new Date(item.purchaseOrder.orderDate);
          const existingDate = existing.orderDate ? new Date(existing.orderDate) : new Date(0);
          if (date > existingDate) {
            existing.orderNumber = item.purchaseOrder.orderNumber || '';
            existing.orderDate = date.toISOString().split('T')[0];
          }
        }
      }
    }

    // Convert map to array, calculate weighted average prices, and sort by product name
    const data = Array.from(productMap.values()).map((item) => {
      // Calculate weighted average unit price: totalAmount / totalQuantity
      if (item.quantity > 0) {
        item.unitPrice = item.totalAmount / item.quantity;
      }
      return item;
    }).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    );

    return { data };
  }

  async getPurchasingAnalytics(
    query: PurchasingAnalyticsQueryDto,
  ): Promise<PurchasingAnalyticsResponseDto> {
    const { startDate, endDate } = this.parsePurchasingDateRange(
      query.dateRange,
      query.startDate,
      query.endDate,
    );
    const groupBy = query.groupBy ?? GroupByPeriod.MONTH;
    const comparePeriod = query.compareWith
      ? this.computePurchasingComparePeriod(startDate, endDate, query.compareWith)
      : null;

    const [metrics, periodData, topSuppliers, recentOrders] = await Promise.all([
      this.calculatePurchasingMetrics(startDate, endDate),
      this.getPurchasingPeriodData(startDate, endDate, groupBy),
      this.getTopSuppliers(startDate, endDate, 5),
      this.getRecentPurchaseOrders(5),
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
        this.calculatePurchasingMetrics(comparePeriod.compareStart, comparePeriod.compareEnd),
        this.getPurchasingPeriodData(comparePeriod.compareStart, comparePeriod.compareEnd, groupBy),
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
  ): Promise<PurchasingMetricsDto> {
    const [orderStats, supplierStats] = await Promise.all([
      this.purchaseOrderRepository
        .createQueryBuilder('po')
        .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('po.deletedAt IS NULL')
        .andWhere('po.isActive = :isActive', { isActive: true })
        .select([
          'COALESCE(SUM(po.totalAmount), 0) as "totalSpent"',
          'COUNT(*) as "totalOrders"',
          'COALESCE(AVG(po.totalAmount), 0) as "averageOrderValue"',
        ])
        .getRawOne(),
      this.purchaseOrderRepository
        .createQueryBuilder('po')
        .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
        .andWhere('po.deletedAt IS NULL')
        .andWhere('po.isActive = :isActive', { isActive: true })
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
  ): Promise<PurchasingPeriodDataDto[]> {
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

    const data = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('po.deletedAt IS NULL')
      .andWhere('po.isActive = :isActive', { isActive: true })
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
  ): Promise<TopSupplierDto[]> {
    const data = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoin('po.supplier', 'supplier')
      .where('po.orderDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .andWhere('po.deletedAt IS NULL')
      .andWhere('po.isActive = :isActive', { isActive: true })
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

  private async getRecentPurchaseOrders(limit: number): Promise<RecentPurchaseOrderDto[]> {
    const orders = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .where('po.deletedAt IS NULL')
      .andWhere('po.isActive = :isActive', { isActive: true })
      .orderBy('po.orderDate', 'DESC')
      .limit(limit)
      .getMany();

    return orders.map((po) => {
      const date = po.orderDate instanceof Date ? po.orderDate : new Date(po.orderDate);
      return {
        orderNumber: po.orderNumber,
        orderDate: date.toISOString().split('T')[0],
        supplierName: po.supplier?.companyName || 'N/A',
        totalAmount: parseFloat(po.totalAmount?.toString() || '0'),
        status: po.isFullyReceived ? 'received' : 'pending',
      };
    });
  }

  private parsePurchasingDateRange(
    dateRange?: DateRange,
    customStartDate?: Date,
    customEndDate?: Date,
  ): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(new Date().setHours(23, 59, 59, 999));

    if (customStartDate && customEndDate) {
      const normalizedStartDate = new Date(customStartDate);
      normalizedStartDate.setUTCHours(0, 0, 0, 0);
      const normalizedEndDate = new Date(customEndDate);
      normalizedEndDate.setUTCHours(23, 59, 59, 999);
      return { startDate: normalizedStartDate, endDate: normalizedEndDate };
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
      case DateRange.THIS_QUARTER: {
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      }
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
      case DateRange.LAST_QUARTER: {
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const quarterStart = lastQuarter < 0 ? 3 : lastQuarter;
        startDate = new Date(year, quarterStart * 3, 1);
        endDate = new Date(year, quarterStart * 3 + 3, 0, 23, 59, 59, 999);
        break;
      }
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
