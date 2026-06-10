import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In, Between } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPaymentStatus,
  PurchaseOrderStatus,
  Supplier,
  Product,
  VendorPayment
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
import { AccountingService } from '../../accounting/services/accounting.service';
import { PurchaseOrderLifecycleService } from './purchase-order-lifecycle.service';

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
    private readonly supplierService: SupplierService,
    private readonly vendorPaymentService: VendorPaymentService,
    private readonly settingsService: SettingsService,
    auditLogService: AuditLogService,
    private readonly accountingService: AccountingService,
    private readonly purchaseOrderLifecycleService: PurchaseOrderLifecycleService,
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
    defaultSortField: 'orderDate' | 'deletedAt',
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
    paidAmount: number,
    totalAmount: number,
  ): PurchaseOrderPaymentStatus {
    const paid = Number(paidAmount || 0);
    const total = Number(totalAmount || 0);

    if (paid <= 0) return PurchaseOrderPaymentStatus.UNPAID;
    if (paid < total) return PurchaseOrderPaymentStatus.PARTIAL;
    if (paid === total) return PurchaseOrderPaymentStatus.PAID;
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
    const skip = limit ? (page - 1) * limit : 0;
    const queryBuilder = this.buildPurchaseOrderListQuery(query, { includeDeleted: false });

    this.applyListOrdering(queryBuilder, query, 'orderDate', { addSecondaryOrderNumber: true });

    const total = await queryBuilder.getCount();

    if (limit) {
      queryBuilder.skip(skip).take(limit);
    }

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
      .andWhere('similarity(order.orderNumber, :q) > 0.3')
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

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      // Don't load items relation to avoid cascade issues when we manually save them
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    await this.purchaseOrderLifecycleService.assertEditAllowed(id);

    // Check if order can be modified
    try {
      // Update basic fields (exclude items as they're handled separately)
      const { items: _, ...updateFields } = updatePurchaseOrderDto;
      Object.assign(purchaseOrder, {
        ...updateFields,
        orderDate: updatePurchaseOrderDto.orderDate ?
          new Date(updatePurchaseOrderDto.orderDate) : purchaseOrder.orderDate,
      });

      // Update items if provided
      if (updatePurchaseOrderDto.items) {
        // Remove existing items
        await this.purchaseOrderItemRepository.delete({ purchaseOrderId: id });

        // Create new items
        const orderItems: PurchaseOrderItem[] = [];
        let subtotal = 0;
        let lineNum = 1;

        for (const itemDto of updatePurchaseOrderDto.items) {
          let product: Product | undefined;

          if (itemDto.productId) {
            product = await this.productRepository.findOne({
              where: { id: itemDto.productId },
            });
          }

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

        try {
          await this.purchaseOrderItemRepository.save(orderItems);
        } catch (saveError) {
          this.logger.error(`Failed to save purchase order items: ${saveError.message}`);
          throw saveError;
        }

        purchaseOrder.subtotal = subtotal;
        // Attach items to purchase order before calculating totals
        purchaseOrder.items = orderItems;
        purchaseOrder.calculateTotals();
      }

      const updatedPurchaseOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      // Log audit trail for update
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
    payments: { paymentMethodId: string; amount: number; reference?: string }[],
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    return this.recordOrderPayments(id, payments, userId, username);
  }

  async unpay(id: string, userId?: string, username?: string): Promise<PurchaseOrderResponseDto> {
    return this.markAsUnpaid(id, userId, username);
  }

  /**
   * Record multiple payment lines for a purchase order
   * Each line creates a separate VendorPayment with journal posting
   */
  async recordOrderPayments(
    id: string,
    payments: { paymentMethodId: string; amount: number; reference?: string }[],
    userId?: string,
    username?: string,
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Recording ${payments.length} payment lines for purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: { supplier: true },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

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

    if (payments.some((p) => !(Number(p.amount) > 0))) {
      throw new BadRequestException('Each payment line amount must be greater than zero');
    }

    const actor = userId || 'system';

    // NOTE: vendor-payment creation and GL posting are not yet bound to a shared
    // transaction manager (see #719), so this method cannot be made fully atomic.
    // To stay robust against a partially-applied batch, the order's paidAmount and
    // statuses are NOT accumulated in memory — they are recomputed from the actual
    // persisted active vendor payments at the end via reconcilePaymentState().

    // Check for a previously soft-deleted payment for this PO (from a prior unpay)
    const previousPayment = await this.vendorPaymentRepository.findOne({
      where: { purchaseOrderId: id },
      withDeleted: true,
      order: { deletedAt: 'DESC' } as any,
    });

    if (previousPayment?.deletedAt) {
      // Restore previous vendor payment and update it with first payment line details.
      const firstLine = payments[0];
      await this.vendorPaymentRepository.restore(previousPayment.id);
      // Reload from DB after restore so deletedAt is null on the in-memory object.
      // Without this, save() would overwrite the restored deletedAt=null back to the old date.
      // Use update() (direct SQL) instead of save() to guarantee the new paymentMethodId
      // is written — save() can skip dirty fields due to the identity map after restore().
      await this.vendorPaymentRepository.update(previousPayment.id, {
        isActive: true,
        paymentMethodId: firstLine.paymentMethodId,
        amount: firstLine.amount,
        notes: firstLine.reference || previousPayment.notes,
        paymentDate: new Date() as any,
      });
      const restoredPayment = await this.vendorPaymentRepository.findOne({
        where: { id: previousPayment.id },
      });

      // Re-post accounting entry for restored payment.
      const fullPayment = await this.vendorPaymentService.findOne(restoredPayment.id);
      await this.accountingService.postVendorPaymentEntry(fullPayment, actor, username);

      // Create additional vendor payments for remaining lines.
      for (const line of payments.slice(1)) {
        await this.vendorPaymentService.create(
          {
            supplierId: purchaseOrder.supplierId,
            purchaseOrderId: id,
            amount: line.amount,
            paymentDate: new Date().toISOString().split('T')[0],
            paymentMethodId: line.paymentMethodId,
            status: 'completed',
            notes: line.reference || undefined,
          },
          actor,
          username,
        );
      }

      await this.reconcilePaymentState(purchaseOrder);
      this.logger.log(`Restored vendor payment ${restoredPayment.paymentNumber} for PO ${purchaseOrder.orderNumber}`);
      return this.findOne(id);
    }

    // No previous payment - create a vendor payment for each line.
    for (const line of payments) {
      await this.vendorPaymentService.create(
        {
          supplierId: purchaseOrder.supplierId,
          purchaseOrderId: id,
          amount: line.amount,
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethodId: line.paymentMethodId,
          status: 'completed',
          notes: line.reference || undefined,
        },
        actor,
        username,
      );
    }

    await this.reconcilePaymentState(purchaseOrder);
    this.logger.log(
      `Purchase order ${purchaseOrder.orderNumber} paid amount updated to ${purchaseOrder.paidAmount}`,
    );

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
  private async reconcilePaymentState(purchaseOrder: PurchaseOrder): Promise<void> {
    const activePayments = await this.vendorPaymentService.findAllByPurchaseOrder(purchaseOrder.id);
    const paidAmount = activePayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const total = Number(purchaseOrder.totalAmount);

    purchaseOrder.paidAmount = paidAmount;
    purchaseOrder.paymentStatus = this.derivePaymentStatus(paidAmount, total);

    const fullyPaid =
      purchaseOrder.paymentStatus === PurchaseOrderPaymentStatus.PAID ||
      purchaseOrder.paymentStatus === PurchaseOrderPaymentStatus.OVERPAID;

    // Move DRAFT -> READY when fully paid; revert READY -> DRAFT when no longer
    // fully paid. Never touch RECEIVED/CANCELLED (unreachable here).
    if (fullyPaid && purchaseOrder.status === PurchaseOrderStatus.DRAFT) {
      purchaseOrder.status = PurchaseOrderStatus.READY;
    } else if (!fullyPaid && purchaseOrder.status === PurchaseOrderStatus.READY) {
      purchaseOrder.status = PurchaseOrderStatus.DRAFT;
    }

    await this.purchaseOrderRepository.save(purchaseOrder);
  }

  /**
   * Mark purchase order as unpaid by soft-deleting the vendor payment
   */
  async markAsUnpaid(id: string, userId?: string, username?: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Marking purchase order as unpaid: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    // Check if PO has received goods - must return before unpaying
    if (purchaseOrder.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException(
        'Cannot unpay purchase order with received goods. Please return goods first.'
      );
    }

    const actor = userId || 'system';

    // Find all existing payments
    const existingPayments = await this.vendorPaymentService.findAllByPurchaseOrder(id);
    if (!existingPayments || existingPayments.length === 0) {
      throw new NotFoundException('No payment found for this purchase order');
    }

    // Reverse accounting entries and soft-delete each vendor payment
    for (const payment of existingPayments) {
      try {
        await this.accountingService.reverseSourceEntries('vendor_payment', payment.id, actor);
      } catch (error) {
        this.logger.error(`Failed to reverse accounting for vendor payment ${payment.id}: ${error.message}`);
      }
      await this.vendorPaymentService.softDeleteForUnpay(payment.id);
    }

    // Reset paidAmount to 0
    purchaseOrder.paidAmount = 0;
    purchaseOrder.paymentStatus = PurchaseOrderPaymentStatus.UNPAID;
    purchaseOrder.status = PurchaseOrderStatus.DRAFT;
    await this.purchaseOrderRepository.save(purchaseOrder);

    // Get updated order
    const updatedOrder = await this.findOne(id);

    this.logger.log(`Purchase order ${purchaseOrder.orderNumber} marked as unpaid - payment deleted`);
    return updatedOrder;
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
        paymentNumber: payment.paymentNumber,
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
