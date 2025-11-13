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
  productName: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  status: string;
  paymentStatus: string;
  supplierPhone: string;
  supplierEmail: string;
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
    const queryBuilder = this.purchaseOrderItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.purchaseOrder', 'po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
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

    // Product IDs filter
    if (query.productIds && query.productIds.length > 0) {
      queryBuilder.andWhere('product.id IN (:...productIds)', {
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

    // Payment status filter
    if (query.paymentStatus && query.paymentStatus !== 'all') {
      queryBuilder.andWhere('po.paymentStatus = :paymentStatus', {
        paymentStatus: query.paymentStatus,
      });
    }

    // Order by date and product name
    queryBuilder.orderBy('po.orderDate', 'DESC');
    queryBuilder.addOrderBy('product.name', 'ASC');

    const items = await queryBuilder.getMany();

    const data: PurchaseOrderSummaryItem[] = items.map((item) => {
      const po = item.purchaseOrder;
      const supplier = po.supplier;
      const product = item.product;
      const category = product?.category;

      return {
        orderNumber: po.orderNumber,
        orderDate: po.orderDate.toISOString().split('T')[0],
        supplierName: supplier?.name || 'N/A',
        productName: product?.name || 'N/A',
        categoryName: category?.name || 'N/A',
        quantity: item.quantity,
        unitPrice: parseFloat(item.unitPrice.toString()),
        subtotal: parseFloat(item.subtotal.toString()),
        status: po.isFullyReceived ? 'received' : 'pending',
        paymentStatus: po.paymentStatus || 'unpaid',
        supplierPhone: supplier?.phone || '',
        supplierEmail: supplier?.email || '',
      };
    });

    return { data };
  }
}
