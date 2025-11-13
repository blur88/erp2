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

    // Payment status filter
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      queryBuilder.andWhere('po.paymentStatus = :paymentStatus', {
        paymentStatus: query.paymentStatus,
      });
    }

    // Order by date
    queryBuilder.orderBy('po.orderDate', 'DESC');
    queryBuilder.addOrderBy('po.orderNumber', 'ASC');

    const purchaseOrders = await queryBuilder.getMany();

    const data: PurchaseOrderSummaryItem[] = purchaseOrders.map((po) => {
      const supplier = po.supplier;
      const totalAmount = parseFloat(po.totalAmount?.toString() || '0');
      const paidAmount = 0; // TODO: Calculate from vendor payments when available
      const balance = totalAmount - paidAmount;

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
        paymentStatus: po.paymentStatus || 'unpaid',
        totalAmount: totalAmount,
        paidAmount: paidAmount,
        balance: balance,
        shippingAmount: parseFloat(po.shippingAmount?.toString() || '0'),
      };
    });

    return { data };
  }
}
