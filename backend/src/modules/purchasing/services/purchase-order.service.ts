import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, HttpException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In, Between, DataSource, EntityManager } from 'typeorm';
import { applyPagination } from '@/common/pagination/apply-pagination';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPaymentStatus,
  PurchaseOrderStatus,
  Supplier,
  Product,
  VendorPayment,
  PaymentMethodEntity
} from '../../../database/entities';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  PurchaseOrderResponseDto,
  PurchaseOrderListResponseDto,
  PurchaseOrderSummaryDto,
} from '../dto';
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchPurchaseOrders } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_TRANSACTION,
  BOOST_EXACT_MATCH,
} from '../../search/search.constants';
import { SupplierService } from './supplier.service';
import { VendorPaymentService } from './vendor-payment.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { PurchaseOrderLifecycleService } from './purchase-order-lifecycle.service';
import { lockRowForUpdate, repoFor } from '../../../common/db/tx-helpers';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import { AccountingSourceType, PostingType } from '../../../common/accounting-posting/enums';
import {
  formatScale4,
  sumMinor,
  toMinorUnits,
} from '@/common/utils/money';

@Injectable()
export class PurchaseOrderService extends BaseCrudService<
  PurchaseOrder,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderQueryDto
> {
  private readonly logger = new Logger(PurchaseOrderService.name);

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
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
    private readonly supplierService: SupplierService,
    private readonly vendorPaymentService: VendorPaymentService,
    private readonly settingsService: SettingsService,
    auditLogService: AuditLogService,
    private readonly purchaseOrderLifecycleService: PurchaseOrderLifecycleService,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly accounting: AccountingPostingPort,
    private readonly dataSource: DataSource,
  ) {
    super(purchaseOrderRepository, auditLogService);
  }

  getEntityType(): string {
    return 'PurchaseOrder';
  }

  buildWhereClause(query: PurchaseOrderQueryDto): FindOptionsWhere<PurchaseOrder> {
    const where: FindOptionsWhere<PurchaseOrder> = {};

    if (query.supplierId) where.supplierId = query.supplierId;

    return where;
  }

  protected applyQueryBuilder(qb: any, query: PurchaseOrderQueryDto): any {
    qb = qb
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('po.vendorPayments', 'vendorPayments');

    if (query.supplierId) {
      qb = qb.andWhere('po.supplierId = :supplierId', { supplierId: query.supplierId });
    }
    if (query.orderDateFrom) {
      qb = qb.andWhere('po.orderDate >= :orderDateFrom', {
        orderDateFrom: new Date(query.orderDateFrom),
      });
    }
    if (query.orderDateTo) {
      qb = qb.andWhere('po.orderDate <= :orderDateTo', {
        orderDateTo: new Date(query.orderDateTo),
      });
    }

    switch ((query.paymentStatus ?? '').toUpperCase()) {
      case 'UNPAID':
        qb = qb.andWhere('(po.paidAmount = 0 OR po.paidAmount IS NULL)');
        break;
      case 'PARTIAL':
        qb = qb.andWhere('po.paidAmount > 0 AND po.paidAmount < po.totalAmount');
        break;
      case 'PAID':
        qb = qb.andWhere('po.paidAmount >= po.totalAmount AND po.paidAmount > 0');
        break;
      case 'OVERPAID':
        qb = qb.andWhere('po.paidAmount > po.totalAmount');
        break;
    }

    if (query.status) {
      qb = qb.andWhere('po.status = :status', { status: query.status });
    }

    return qb;
  }

  protected applySearch(qb: any, search: string, _alias: string): any {
    return qb.andWhere(
      '(po.orderNumber ILIKE :search OR supplier.companyName ILIKE :search OR po.notes ILIKE :search)',
      { search: `%${search}%` },
    );
  }

  protected get allowedSortFields(): string[] {
    return ['orderNumber', 'orderDate', 'status', 'priority', 'totalAmount', 'createdAt', 'deletedAt'];
  }

  private buildPurchaseOrderListQuery(
    query: PurchaseOrderQueryDto,
    options: { includeDeleted: boolean },
  ) {
    let queryBuilder = this.purchaseOrderRepository.createQueryBuilder('po');

    if (options.includeDeleted) {
      queryBuilder = queryBuilder.withDeleted().where('po.deletedAt IS NOT NULL');
    }

    if (query.search) {
      queryBuilder = this.applySearch(queryBuilder, query.search, 'po');
    }

    return this.applyQueryBuilder(queryBuilder, query);
  }

  private applyListOrdering(
    queryBuilder: any,
    query: PurchaseOrderQueryDto,
    defaultSortField: 'orderNumber' | 'orderDate' | 'deletedAt',
    options: { addSecondaryOrderNumber: boolean },
  ) {
    const sortField = this.allowedSortFields.includes(query.sortBy ?? '')
      ? query.sortBy!
      : defaultSortField;
    const sortOrder = query.sortOrder ?? 'DESC';

    queryBuilder.orderBy(`po.${sortField}`, sortOrder);

    if (options.addSecondaryOrderNumber && sortField !== 'orderNumber') {
      queryBuilder.addOrderBy('po.orderNumber', 'DESC');
    }
  }

  /**
   * Generate sequential purchase order number in format PO-000001
   * Checks both active and soft-deleted orders to ensure unique numbering
   */
  private async generateSequentialOrderNumber(): Promise<string> {
    // Use document number settings to generate order number
    try {
      const orderNumber = await this.settingsService.generateDocumentNumber('Purchase Orders');
      this.logger.log(`Generated purchase order number: ${orderNumber}`);
      return orderNumber;
    } catch (error) {
      this.logger.error(`Error generating order number: ${error.message}`);
      // Fallback to legacy method
      const orders = await this.purchaseOrderRepository.find({
        select: { orderNumber: true },
        withDeleted: true,
      });

      let maxNumber = 0;
      for (const order of orders) {
        const match = order.orderNumber.match(/^PO-(\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      }

      const nextNumber = maxNumber + 1;
      const fallbackNumber = `PO-${nextNumber.toString().padStart(6, '0')}`;
      this.logger.log(`Fallback purchase order number: ${fallbackNumber}`);
      return fallbackNumber;
    }
  }

  private derivePaymentStatus(
    paidAmount: bigint,
    totalAmount: bigint,
  ): PurchaseOrderPaymentStatus {
    if (paidAmount <= 0n) return PurchaseOrderPaymentStatus.UNPAID;
    if (paidAmount < totalAmount) return PurchaseOrderPaymentStatus.PARTIAL;
    if (paidAmount === totalAmount) return PurchaseOrderPaymentStatus.PAID;
    return PurchaseOrderPaymentStatus.OVERPAID;
  }

  /**
   * Create a new purchase order
   */
  async create(
    createPurchaseOrderDto: CreatePurchaseOrderDto,
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Creating purchase order for supplier: ${createPurchaseOrderDto.supplierId}`);

    // Validate supplier exists and is active
    const supplier = await this.supplierRepository.findOne({
      where: { id: createPurchaseOrderDto.supplierId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (!supplier.isActive) {
      throw new BadRequestException('Cannot create purchase order for inactive supplier');
    }

    try {
      // Generate sequential order number
      const orderNumber = await this.generateSequentialOrderNumber();

      // Create purchase order
      const purchaseOrder = this.purchaseOrderRepository.create({
        ...createPurchaseOrderDto,
        orderNumber,
        orderDate: new Date(createPurchaseOrderDto.orderDate),
      });

      // Create order items
      const orderItems: PurchaseOrderItem[] = [];
      let subtotal = 0;

      let lineNum = 1;
      for (const itemDto of createPurchaseOrderDto.items) {
        // Validate product
        const product = await this.productRepository.findOne({
          where: { id: itemDto.productId },
        });

        if (!product) {
          throw new BadRequestException(`Product with ID ${itemDto.productId} not found`);
        }

        const item = this.purchaseOrderItemRepository.create({
          productId: itemDto.productId,
          quantity: itemDto.quantity,
          unitCost: itemDto.unitPrice,
          discountType: itemDto.discountType || 'percentage',
          discountPercent: itemDto.discountPercent || 0,
          discountAmount: itemDto.discountAmount || 0,
          status: 'pending' as any,
          receivedQuantity: 0,
          lineNumber: lineNum,
        });

        // Calculate totals manually to get the amount before saving
        // Discount is applied to unit price first, then multiplied by quantity
        let unitDiscount = 0;
        if (item.discountType === 'percentage') {
          unitDiscount = item.discountPercent > 0
            ? (Number(item.unitCost) * Number(item.discountPercent)) / 100
            : 0;
        } else if (item.discountType === 'fixed_amount') {
          unitDiscount = Number(item.discountAmount) || 0;
        }
        const discountedUnitPrice = Number(item.unitCost) - unitDiscount;
        const totalAmount = discountedUnitPrice * Number(item.quantity);

        orderItems.push(item);
        subtotal += totalAmount;
        lineNum++;
      }

      // Set purchase order totals
      purchaseOrder.subtotal = subtotal;

      // Attach items to purchase order before calculating totals (needed for calculateTotals)
      purchaseOrder.items = orderItems;

      // Calculate totals after items are attached
      purchaseOrder.calculateTotals();
      purchaseOrder.status = PurchaseOrderStatus.DRAFT;
      purchaseOrder.paymentStatus = PurchaseOrderPaymentStatus.UNPAID;

      // Check supplier credit limit
      const canPurchase = await this.supplierService.canPurchase(
        supplier.id,
        Number(purchaseOrder.totalAmount)
      );

      if (!canPurchase) {
        throw new BadRequestException('Purchase amount exceeds supplier credit limit');
      }

      // Save purchase order with items (cascade will save items automatically)
      const savedPurchaseOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      // Update supplier metrics if this is a new order
      const isFirstOrder = supplier.totalOrders === 0;
      await this.supplierService.updatePurchaseMetrics(
        supplier.id,
        Number(savedPurchaseOrder.totalAmount),
        isFirstOrder
      );

      // Log audit trail for create
      await this.auditLogService.log(
        'CREATE',
        'PurchaseOrder',
        `Created purchase order: ${savedPurchaseOrder.orderNumber}`,
        {
          entityId: savedPurchaseOrder.id,
          userId: userId || 'system',
          username,
          newValues: {
            orderNumber: savedPurchaseOrder.orderNumber,
            supplierId: supplier.id,
            totalAmount: savedPurchaseOrder.totalAmount,
          },
        }
      );

      this.logger.log(`Purchase order created successfully: ${savedPurchaseOrder.orderNumber}`);
      return await this.findOne(savedPurchaseOrder.id);
    } catch (error) {
      this.logger.error(`Error creating purchase order: ${error.message}`, error.stack);

      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Failed to create purchase order');
    }
  }

  /**
   * Get all purchase orders with filtering and pagination
   */
  async findAll(query: PurchaseOrderQueryDto): Promise<PurchaseOrderListResponseDto> {
    this.logger.log(`Finding purchase orders with query: ${JSON.stringify(query)}`);

    const page = query.page || 1;
    const limit = query.limit;
    const queryBuilder = this.buildPurchaseOrderListQuery(query, { includeDeleted: false });

    this.applyListOrdering(queryBuilder, query, 'orderNumber', { addSecondaryOrderNumber: true });

    const total = await queryBuilder.getCount();

    // page is always defined (defaults to 1), so the helper paginates iff limit is present.
    applyPagination(queryBuilder, page, limit);

    const purchaseOrders = await queryBuilder.getMany();
    const orderDtos = purchaseOrders.map(order => this.mapToResponseDto(order));

    return {
      orders: orderDtos,
      total,
      page,
      limit: limit || total,
      totalPages: limit ? Math.ceil(total / limit) : 1,
      hasNext: limit ? page < Math.ceil(total / limit) : false,
      hasPrev: page ? page > 1 : false,
    };
  }

  async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
    if (!canSearchPurchaseOrders(user.role)) return [];

    const trimmed = query.trim();
    const q = trimmed.toLowerCase();
    const orders = await this.purchaseOrderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.supplier', 'supplier')
      .where('order.deletedAt IS NULL')
      .andWhere('(order.orderNumber ILIKE :q OR supplier.companyName ILIKE :q)', {
        q: `%${trimmed}%`,
      })
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    if (orders.length > 0) {
      return orders.map((order) => this.mapPurchaseOrder(order, q, false));
    }

    const fuzzyOrders = await this.purchaseOrderRepository
      .createQueryBuilder('order')
      .addSelect('similarity(order.orderNumber, :q)', 'sim')
      .leftJoinAndSelect('order.supplier', 'supplier')
      .where('order.deletedAt IS NULL')
      // Threshold is pg_trgm's similarity limit, default 0.3 — read it with
      // show_limit(). PostgreSQL 18 removed the pg_trgm.similarity_threshold
      // GUC name; the limit and its default are unchanged.
      .andWhere('order.orderNumber % :q')
      .orderBy('sim', 'DESC')
      .setParameter('q', trimmed)
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    return fuzzyOrders.map((order) => this.mapPurchaseOrder(order, q, true));
  }

  private mapPurchaseOrder(
    order: PurchaseOrder,
    q: string,
    fuzzy: boolean,
  ): GlobalSearchResultDto {
    const orderNumber = order.orderNumber?.toLowerCase() ?? '';
    const baseScore = fuzzy
      ? SCORE_FUZZY
      : orderNumber === q
        ? SCORE_EXACT_CODE
        : orderNumber.startsWith(q)
          ? SCORE_STARTSWITH_CODE
          : SCORE_CONTAINS;

    return {
      type: 'transaction',
      id: order.id,
      label: order.orderNumber,
      description: order.supplier?.companyName ?? '',
      route: `/purchasing/orders/${order.id}/edit`,
      score:
        baseScore +
        BOOST_TRANSACTION +
        (baseScore === SCORE_EXACT_CODE ? BOOST_EXACT_MATCH : 0),
    };
  }

  /**
   * Get purchase order by ID
   */
  async findOne(id: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Finding purchase order by ID: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('po.vendorPayments', 'vendorPayments')
      .where('po.id = :id', { id })
      .getOne();

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    return this.mapToResponseDto(purchaseOrder);
  }

  async findByOrderNumber(orderNumber: string): Promise<PurchaseOrderResponseDto> {
    const purchaseOrder = await this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('po.vendorPayments', 'vendorPayments')
      .where('po.orderNumber = :orderNumber', { orderNumber })
      .getOne();

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order '${orderNumber}' not found`);
    }

    return this.mapToResponseDto(purchaseOrder);
  }

  /**
   * Update purchase order
   */
  async update(
    id: string,
    updatePurchaseOrderDto: UpdatePurchaseOrderDto,
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Updating purchase order: ${id}`);
    try {
      const updatedPurchaseOrder = await this.dataSource.transaction(async (manager: EntityManager) => {
        const itemRepo = repoFor(manager, PurchaseOrderItem, this.purchaseOrderItemRepository);
        const productRepo = repoFor(manager, Product, this.productRepository);

        const purchaseOrder = await lockRowForUpdate(manager, PurchaseOrder, id, {
          notFoundMessage: `Purchase order with ID ${id} not found`,
        });

        PurchaseOrderLifecycleService.assertStatusEditable(purchaseOrder.status);

        const { items: _, ...updateFields } = updatePurchaseOrderDto;
        Object.assign(purchaseOrder, {
          ...updateFields,
          orderDate: updatePurchaseOrderDto.orderDate ? new Date(updatePurchaseOrderDto.orderDate) : purchaseOrder.orderDate,
        });

        if (updatePurchaseOrderDto.items) {
          await itemRepo.delete({ purchaseOrderId: id });

          const orderItems: PurchaseOrderItem[] = [];
          let subtotal = 0;
          let lineNum = 1;

          for (const itemDto of updatePurchaseOrderDto.items) {
            const product = await productRepo.findOne({ where: { id: itemDto.productId } });
            if (!product) {
              throw new BadRequestException(`Product with ID ${itemDto.productId} not found`);
            }

            const item = new PurchaseOrderItem();
            item.purchaseOrderId = id;
            item.productId = itemDto.productId;
            item.quantity = itemDto.quantity;
            item.unitCost = itemDto.unitPrice;
            item.discountType = itemDto.discountType || 'percentage';
            item.discountPercent = itemDto.discountPercent || 0;
            item.discountAmount = itemDto.discountAmount || 0;
            item.status = 'pending' as any;
            item.receivedQuantity = 0;
            item.lineNumber = lineNum;

            let unitDiscount = 0;
            if (item.discountType === 'percentage') {
              unitDiscount = item.discountPercent > 0 ? (Number(item.unitCost) * Number(item.discountPercent)) / 100 : 0;
            } else if (item.discountType === 'fixed_amount') {
              unitDiscount = Number(item.discountAmount) || 0;
            }
            const discountedUnitPrice = Number(item.unitCost) - unitDiscount;
            const totalAmount = discountedUnitPrice * Number(item.quantity);

            orderItems.push(item);
            subtotal += totalAmount;
            lineNum++;
          }

          await itemRepo.save(orderItems);
          purchaseOrder.subtotal = subtotal;
          purchaseOrder.items = orderItems;
        }

        purchaseOrder.calculateTotals();

        await this.reconcilePaymentState(purchaseOrder, manager);
        return purchaseOrder;
      });

      await this.auditLogService.log(
        'UPDATE',
        'PurchaseOrder',
        `Updated purchase order: ${updatedPurchaseOrder.orderNumber}`,
        {
          entityId: updatedPurchaseOrder.id,
          userId: userId || 'system',
          username,
          newValues: {
            orderNumber: updatedPurchaseOrder.orderNumber,
            totalAmount: updatedPurchaseOrder.totalAmount,
          },
        }
      );

      this.logger.log(`Purchase order updated successfully: ${updatedPurchaseOrder.orderNumber}`);
      return await this.findOne(updatedPurchaseOrder.id);
    } catch (error) {
      this.logger.error(`Error updating purchase order: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException('Failed to update purchase order');
    }
  }

  /**
   * Get purchase order summary
   */
  async getSummary(): Promise<PurchaseOrderSummaryDto> {
    this.logger.log('Getting purchase order summary');

    try {
      const [
        totalOrders,
        totalAmount,
        overdueOrders,
        topSuppliers,
      ] = await Promise.all([
        // Total orders count
        this.purchaseOrderRepository.count(),

        // Total amount
        this.purchaseOrderRepository
          .createQueryBuilder('po')
          .select('SUM(po.totalAmount)', 'total')
          .getRawOne()
          .then(result => parseFloat(result.total) || 0),

        // Overdue orders
        this.purchaseOrderRepository
          .createQueryBuilder('po')
          .where('1=0') // Always returns 0 since expectedDeliveryDate field was removed
          .getCount(),

        // Top suppliers by volume
        this.purchaseOrderRepository
          .createQueryBuilder('po')
          .leftJoinAndSelect('po.supplier', 'supplier')
          .select('supplier.id', 'supplierId')
          .addSelect('supplier.companyName', 'companyName')
          .addSelect('COUNT(*)', 'orderCount')
          .addSelect('SUM(po.totalAmount)', 'totalAmount')
          .groupBy('supplier.id')
          .addGroupBy('supplier.companyName')
          .orderBy('SUM(po.totalAmount)', 'DESC')
          .limit(5)
          .getRawMany()
          .then(results =>
            results.map(row => ({
              supplierId: row.supplierId,
              companyName: row.companyName,
              orderCount: parseInt(row.orderCount),
              totalAmount: parseFloat(row.totalAmount),
            }))
          ),
      ]);

      const averageOrderValue = totalOrders > 0 ? totalAmount / totalOrders : 0;

      return {
        totalOrders,
        totalAmount,
        averageOrderValue,
        overdueOrders,
        topSuppliers,
      };
    } catch (error) {
      this.logger.error(`Error getting purchase order summary: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to get purchase order summary');
    }
  }

  async cancel(id: string, userId?: string, username?: string): Promise<PurchaseOrderResponseDto> {
    const saved = await this.purchaseOrderLifecycleService.cancel(id, userId, username);
    return this.findOne(saved.id);
  }

  async uncancel(id: string, userId?: string, username?: string): Promise<PurchaseOrderResponseDto> {
    const saved = await this.purchaseOrderLifecycleService.uncancel(id, userId, username);
    return this.findOne(saved.id);
  }

  async receive(id: string, userId?: string, username?: string): Promise<PurchaseOrderResponseDto> {
    const saved = await this.purchaseOrderLifecycleService.receive(id, userId, username);
    return this.findOne(saved.id);
  }

  async return(id: string, userId?: string, username?: string): Promise<PurchaseOrderResponseDto> {
    const saved = await this.purchaseOrderLifecycleService.return(id, userId, username);
    return this.findOne(saved.id);
  }

  async getPayments(id: string): Promise<VendorPayment[]> {
    return this.vendorPaymentService.findAllByPurchaseOrder(id);
  }

  async recordVendorPayments(
    id: string,
    payments: { paymentMethodId: string; amount: string; reference?: string }[],
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    return this.recordOrderPayments(id, payments, userId, username);
  }

  async unpay(id: string, userId?: string, username?: string): Promise<PurchaseOrderResponseDto> {
    return this.markAsUnpaid(id, userId, username);
  }

  async duplicateOrder(id: string, userId: string): Promise<PurchaseOrderResponseDto> {
    const original = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: { items: true },
    });

    if (!original) {
      throw new NotFoundException('Purchase order not found');
    }

    const duplicateData: CreatePurchaseOrderDto = {
      supplierId: original.supplierId,
      orderDate: new Date().toISOString().split('T')[0],
      notes: original.notes,
      shippingAmount: Number(original.shippingAmount || 0),
      items: (original.items ?? []).map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitCost),
        // Copy the full discount shape — a fixed_amount discount has
        // discountPercent = 0, so omitting discountType + discountAmount
        // would silently drop it.
        discountType: item.discountType,
        discountPercent: Number(item.discountPercent ?? 0),
        discountAmount: Number(item.discountAmount ?? 0),
      })),
    };

    return this.create(duplicateData, userId);
  }

  async recordRefunds(
    orderId: string,
    refunds: { paymentMethodId: string; amount: string; reference?: string }[],
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    const actor = userId || 'system';

    if (refunds.length === 0) {
      throw new BadRequestException('At least one refund line is required');
    }
    for (const line of refunds) {
      if (toMinorUnits(line.amount) <= 0n) {
        throw new BadRequestException('Each refund amount must be greater than zero');
      }
    }
    const methodMap = new Map<string, PaymentMethodEntity>();
    for (const line of refunds) {
      if (methodMap.has(line.paymentMethodId)) continue;
      const method = await this.paymentMethodRepository.findOne({
        where: { id: line.paymentMethodId, isActive: true },
      });
      if (!method) {
        throw new BadRequestException(`Payment method ${line.paymentMethodId} not found or inactive`);
      }
      methodMap.set(line.paymentMethodId, method);
    }

    const savedRefundRows: { id: string; paymentMethodId: string; accountingChannel: 'CASH' | 'BANK' }[] = [];

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const purchaseOrder = await lockRowForUpdate(manager, PurchaseOrder, orderId, {
        notFoundMessage: 'Purchase order not found',
      });
      if (
        purchaseOrder.status === PurchaseOrderStatus.CANCELLED ||
        purchaseOrder.status === PurchaseOrderStatus.RECEIVED
      ) {
        throw new BadRequestException(`Cannot refund a ${purchaseOrder.status} purchase order.`);
      }

      const repo = manager.getRepository(VendorPayment);

      const existing = await repo.find({ where: { purchaseOrderId: orderId, isActive: true } });
      const netPaidMinor = sumMinor(existing.map((r) => r.amount));
      const totalRefundMinor = sumMinor(refunds.map((l) => l.amount));
      if (totalRefundMinor > netPaidMinor) {
        throw new BadRequestException(
          `Total refund amount (${formatScale4(totalRefundMinor)}) exceeds net paid (${formatScale4(netPaidMinor)})`,
        );
      }

      for (const line of refunds) {
        const refundRow = repo.create({
          supplierId: purchaseOrder.supplierId,
          purchaseOrderId: orderId,
          paymentMethodId: line.paymentMethodId,
          paymentDate: new Date(),
          amount: formatScale4(-toMinorUnits(line.amount)),
          referenceNumber: line.reference,
          status: 'completed',
        } as any);
        const saved = await repo.save(refundRow);
        const method = methodMap.get(line.paymentMethodId)!;
        await this.accounting.postPurchaseRefund({
          purchaseOrderId: orderId,
          sourceRef: purchaseOrder.orderNumber,
          refundRowId: (saved as any).id,
          channel: method.accountingChannel,
          amount: formatScale4(toMinorUnits(line.amount)),
          entryDate: new Date().toISOString().slice(0, 10),
          createdBy: username,
        }, manager);
        savedRefundRows.push({
          id: (saved as any).id,
          paymentMethodId: line.paymentMethodId,
          accountingChannel: method.accountingChannel,
        });
      }

      await this.reconcilePaymentState(purchaseOrder, manager);
    });

    for (const row of savedRefundRows) {
      await this.auditLogService.log(
        'CREATE',
        'VendorPayment',
        `Recorded refund for purchase order ${orderId}`,
        {
          entityId: row.id,
          userId: actor,
          username,
          newValues: { refundVendorPaymentId: row.id, paymentMethodId: row.paymentMethodId, refund: true },
        },
      );
    }

    return this.findOne(orderId);
  }

  /**
   * Record multiple payment lines for a purchase order
   * Each line creates a separate VendorPayment with journal posting
   */
  async recordOrderPayments(
    id: string,
    payments: { paymentMethodId: string; amount: string; reference?: string }[],
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Recording ${payments.length} payment lines for purchase order: ${id}`);

    const actor = userId || 'system';

    const methodMap = new Map<string, PaymentMethodEntity>();
    for (const line of payments) {
      if (methodMap.has(line.paymentMethodId)) continue;
      const method = await this.paymentMethodRepository.findOne({
        where: { id: line.paymentMethodId, isActive: true },
      });
      if (!method) throw new BadRequestException(`Payment method ${line.paymentMethodId} not found or inactive`);
      methodMap.set(line.paymentMethodId, method);
    }

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const purchaseOrder = await lockRowForUpdate(manager, PurchaseOrder, id, {
        notFoundMessage: 'Purchase order not found',
      });

      if (
        purchaseOrder.status === PurchaseOrderStatus.CANCELLED ||
        purchaseOrder.status === PurchaseOrderStatus.RECEIVED
      ) {
        throw new BadRequestException(
          `Cannot record payments for a ${purchaseOrder.status} purchase order.`,
        );
      }

      if (!payments || payments.length === 0) {
        throw new BadRequestException('At least one payment line is required');
      }

      if (payments.some((p) => toMinorUnits(p.amount) <= 0n)) {
        throw new BadRequestException('Each payment line amount must be greater than zero');
      }

      // Check for a previously soft-deleted payment for this PO (from a prior unpay)
      const vpRepo = repoFor(manager, VendorPayment, this.vendorPaymentRepository);
      const previousPayment = await vpRepo.findOne({
        where: { purchaseOrderId: id },
        withDeleted: true,
        order: { deletedAt: 'DESC' } as any,
      });

      if (previousPayment?.deletedAt) {
        // Restore the soft-deleted payment and update with first line details.
        const firstLine = payments[0];
        await vpRepo.restore(previousPayment.id);
        await vpRepo.update(previousPayment.id, {
          isActive: true,
          paymentMethodId: firstLine.paymentMethodId,
          amount: firstLine.amount,
          referenceNumber: firstLine.reference || previousPayment.referenceNumber,
          paymentDate: new Date() as any,
        });
        const restoredPayment = await vpRepo.findOne({
          where: { id: previousPayment.id },
        });
        this.logger.log(`Restored vendor payment ${restoredPayment.id} for PO ${purchaseOrder.orderNumber}`);

        const method = methodMap.get(firstLine.paymentMethodId)!;
        await this.accounting.postPurchasePayment({
          purchaseOrderId: id,
          sourceRef: purchaseOrder.orderNumber,
          paymentRowId: restoredPayment.id,
          channel: method.accountingChannel,
          amount: formatScale4(toMinorUnits(firstLine.amount)),
          entryDate: new Date().toISOString().slice(0, 10),
          createdBy: username,
        }, manager);

        // Create new payments for remaining lines.
        for (const line of payments.slice(1)) {
          const savedPayment = await this.vendorPaymentService.create(
            {
              supplierId: purchaseOrder.supplierId,
              purchaseOrderId: id,
              amount: line.amount,
              paymentDate: new Date().toISOString().split('T')[0],
              paymentMethodId: line.paymentMethodId,
              status: 'completed',
              referenceNumber: line.reference || undefined,
            },
            actor,
            username,
            manager,
          );
          const m = methodMap.get(line.paymentMethodId)!;
          await this.accounting.postPurchasePayment({
            purchaseOrderId: id,
            sourceRef: purchaseOrder.orderNumber,
            paymentRowId: savedPayment.id,
            channel: m.accountingChannel,
            amount: formatScale4(toMinorUnits(line.amount)),
            entryDate: new Date().toISOString().slice(0, 10),
            createdBy: username,
          }, manager);
        }
      } else {
        // No previous payment — create a vendor payment for each line.
        for (const line of payments) {
          const savedPayment = await this.vendorPaymentService.create(
            {
              supplierId: purchaseOrder.supplierId,
              purchaseOrderId: id,
              amount: line.amount,
              paymentDate: new Date().toISOString().split('T')[0],
              paymentMethodId: line.paymentMethodId,
              status: 'completed',
              referenceNumber: line.reference || undefined,
            },
            actor,
            username,
            manager,
          );
          const method = methodMap.get(line.paymentMethodId)!;
          await this.accounting.postPurchasePayment({
            purchaseOrderId: id,
            sourceRef: purchaseOrder.orderNumber,
            paymentRowId: savedPayment.id,
            channel: method.accountingChannel,
            amount: formatScale4(toMinorUnits(line.amount)),
            entryDate: new Date().toISOString().slice(0, 10),
            createdBy: username,
          }, manager);
        }
      }

      await this.reconcilePaymentState(purchaseOrder, manager);
    });

    return this.findOne(id);
  }

  /**
   * Recompute paidAmount, paymentStatus and the DRAFT<->READY band from the
   * actual persisted active vendor payments — the single source of truth — and
   * persist them on the order. Using the DB sum (rather than an in-memory
   * accumulator) keeps the order consistent even if a multi-line batch was only
   * partially applied. Only the DRAFT<->READY band is auto-managed here;
   * RECEIVED/CANCELLED orders never reach this method.
   */
  private async reconcilePaymentState(purchaseOrder: PurchaseOrder, manager?: EntityManager): Promise<void> {
    const activePayments = await this.vendorPaymentService.findAllByPurchaseOrder(purchaseOrder.id, manager);
    const paidAmountMinor = sumMinor(activePayments.map((p) => p.amount || '0'));
    const totalMinor = toMinorUnits(purchaseOrder.totalAmount);

    purchaseOrder.paidAmount = formatScale4(paidAmountMinor);
    purchaseOrder.paymentStatus = this.derivePaymentStatus(paidAmountMinor, totalMinor);

    // OVERPAID is not fulfillable. Only exact payment (PAID) promotes to READY,
    // matching the sales-order rule in sales-order-payment.service.ts.
    const fullyPaid = purchaseOrder.paymentStatus === PurchaseOrderPaymentStatus.PAID;

    // Move DRAFT -> READY when fully paid; revert READY -> DRAFT when no longer
    // fully paid. Never touch RECEIVED/CANCELLED (unreachable here).
    if (fullyPaid && purchaseOrder.status === PurchaseOrderStatus.DRAFT) {
      purchaseOrder.status = PurchaseOrderStatus.READY;
    } else if (!fullyPaid && purchaseOrder.status === PurchaseOrderStatus.READY) {
      purchaseOrder.status = PurchaseOrderStatus.DRAFT;
    }
    await repoFor(manager, PurchaseOrder, this.purchaseOrderRepository).save(purchaseOrder);
  }

  /**
   * Mark purchase order as unpaid by soft-deleting the vendor payment
   */
  async markAsUnpaid(id: string, userId?: string, username?: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Marking purchase order as unpaid: ${id}`);

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const purchaseOrder = await lockRowForUpdate(manager, PurchaseOrder, id, {
        notFoundMessage: 'Purchase order not found',
      });

      if (purchaseOrder.status === PurchaseOrderStatus.RECEIVED) {
        throw new BadRequestException(
          'Cannot unpay purchase order with received goods. Please return goods first.'
        );
      }

      const existingPayments = await this.vendorPaymentService.findAllByPurchaseOrder(id, manager);
      if (!existingPayments || existingPayments.length === 0) {
        throw new NotFoundException('No payment found for this purchase order');
      }

      for (const payment of existingPayments) {
        await this.vendorPaymentService.softDeleteForUnpay(payment.id, manager);
      }

      const now = new Date();
      const entryDate = now.toISOString().slice(0, 10);
      purchaseOrder.paidAmount = '0.0000';
      purchaseOrder.paymentStatus = PurchaseOrderPaymentStatus.UNPAID;
      purchaseOrder.status = PurchaseOrderStatus.DRAFT;
      await manager.getRepository(PurchaseOrder).save(purchaseOrder);

      await this.accounting.reverseEntriesForDocument(
        AccountingSourceType.PURCHASE_ORDER,
        id,
        [PostingType.PURCHASE_PAYMENT, PostingType.PURCHASE_REFUND],
        entryDate,
        manager,
        username,
      );
    });

    return this.findOne(id);
  }


  /**
   * Map purchase order entity to response DTO
   */
  private mapToResponseDto(purchaseOrder: PurchaseOrder): PurchaseOrderResponseDto {
    return {
      id: purchaseOrder.id,
      orderNumber: purchaseOrder.orderNumber,
      supplier: purchaseOrder.supplier ? {
        id: purchaseOrder.supplier.id,
        slug: purchaseOrder.supplier.slug,
        supplierCode: purchaseOrder.supplier.id.slice(0, 8).toUpperCase(),
        companyName: purchaseOrder.supplier.companyName,
        contactPerson: purchaseOrder.supplier.contactPerson,
        phone: purchaseOrder.supplier.phone,
        address: purchaseOrder.supplier.billingStreetAddress,
        city: purchaseOrder.supplier.billingCity,
        state: purchaseOrder.supplier.billingState,
        postalCode: purchaseOrder.supplier.billingPostalCode,
        country: purchaseOrder.supplier.billingCountry,
      } : undefined,
      orderDate: purchaseOrder.orderDate,
      receivedDate: purchaseOrder.receivedDate,
      subtotal: Number(purchaseOrder.subtotal),
      discountPercent: Number(purchaseOrder.discountPercent),
      discountAmount: Number(purchaseOrder.discountAmount),
      shippingAmount: Number(purchaseOrder.shippingAmount),
      totalAmount: Number(purchaseOrder.totalAmount),
      paidAmount: Number(purchaseOrder.paidAmount || 0),
      status: purchaseOrder.status,
      paymentStatus: purchaseOrder.paymentStatus,
      notes: purchaseOrder.notes,
      isFullyReceived: purchaseOrder.isFullyReceived(),
      totalReceivedQuantity: purchaseOrder.getTotalReceivedQuantity(),
      totalOrderedQuantity: purchaseOrder.getTotalOrderedQuantity(),
      items: purchaseOrder.items?.map(item => ({
        id: item.id,
        product: item.product ? {
          id: item.product.id,
          sku: item.product.barcode || item.product.id.substring(0, 8).toUpperCase(),
          name: item.product.name,
        } : undefined,
        description: item.product?.name || 'Unknown Product',
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitCost),
        discountType: item.discountType,
        discountPercent: Number(item.discountPercent),
        discountAmount: Number(item.discountAmount),
        taxPercent: 0,
        taxAmount: 0,
        totalAmount: Number(item.totalAmount),
        receivedQuantity: Number(item.receivedQuantity),
        rejectedQuantity: 0,
        isFullyReceived: item.isFullyReceived,
        status: item.status,
      })) || [],
      vendorPayments: purchaseOrder.vendorPayments?.map(payment => ({
        id: payment.id,
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
        paymentMethodId: payment.paymentMethodId,
        status: payment.status,
      })) || [],
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt,
      deletedAt: purchaseOrder.deletedAt,
    };
  }

}
