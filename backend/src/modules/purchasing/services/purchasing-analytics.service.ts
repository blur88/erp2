import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  Product,
} from '../../../database/entities';

interface PurchaseOrderSummaryQuery {
  dateFrom?: Date;
  dateTo?: Date;
  supplierId?: string;
  categoryId?: string;
  productIds?: string[];
  status?: string;
  paymentStatus?: string;
}

interface PurchaseOrderSummaryItem {
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

interface PurchaseOrderDetailsItem {
  orderNumber: string;
  orderDate: string;
  supplierName: string;
  productName: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
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
        detailsData.push({
          orderNumber: po.orderNumber,
          orderDate: orderDateStr,
          supplierName: po.supplier?.companyName || 'N/A',
          productName: item.product?.name || 'N/A',
          categoryName: item.product?.category?.name || 'N/A',
          quantity: parseFloat(item.quantity?.toString() || '0'),
          unitPrice: parseFloat(item.unitCost?.toString() || '0'),
          discountPercent: parseFloat(item.discountPercent?.toString() || '0'),
          discountAmount: parseFloat(item.discountAmount?.toString() || '0'),
          totalAmount: parseFloat(item.totalAmount?.toString() || '0'),
          status: po.isFullyReceived ? 'received' : 'pending',
          paymentStatus: paymentStatus,
        });
      }
    }

    return { data: detailsData };
  }
}
