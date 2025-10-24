import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In, Between } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  User,
  Product,
  GoodsReceivedNote,
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
import { SupplierService } from './supplier.service';
import { GoodsReceivedNoteService } from './goods-received-note.service';
import { VendorPaymentService } from './vendor-payment.service';
import { GrnStatus } from '../../../database/entities/goods-received-note.entity';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';

@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger(PurchaseOrderService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemRepository: Repository<PurchaseOrderItem>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(GoodsReceivedNote)
    private readonly grnRepository: Repository<GoodsReceivedNote>,
    @InjectRepository(VendorPayment)
    private readonly vendorPaymentRepository: Repository<VendorPayment>,
    private readonly supplierService: SupplierService,
    private readonly grnService: GoodsReceivedNoteService,
    private readonly vendorPaymentService: VendorPaymentService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
  ) {}

  /**
   * Generate sequential purchase order number in format PO-000001
   * Checks both active and soft-deleted orders to ensure unique numbering
   */
  private async generateSequentialOrderNumber(): Promise<string> {
    // Get all existing order numbers that match the sequential format
    // Include soft-deleted records to avoid number collision
    const orders = await this.purchaseOrderRepository.find({
      select: ['orderNumber'],
      withDeleted: true, // Include soft-deleted records
    });

    let maxNumber = 0;
    for (const order of orders) {
      // Extract number from format PO-000001 (only sequential format)
      const match = order.orderNumber.match(/^PO-(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // Next sequential number
    const nextNumber = maxNumber + 1;

    // Format with leading zeros (6 digits)
    return `PO-${nextNumber.toString().padStart(6, '0')}`;
  }

  /**
   * Create a new purchase order
   */
  async create(
    createPurchaseOrderDto: CreatePurchaseOrderDto,
    userId: string = 'system'
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

    // Validate user exists (skip for system user after auth removal)
    let validUserId: string | null = null;
    if (userId !== 'system') {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      validUserId = userId;
    }

    try {
      // Generate sequential order number
      const orderNumber = await this.generateSequentialOrderNumber();

      // Create purchase order
      const purchaseOrder = this.purchaseOrderRepository.create({
        ...createPurchaseOrderDto,
        orderNumber,
        orderDate: new Date(createPurchaseOrderDto.orderDate),
        createdByUserId: validUserId,
        paymentTermsDays: createPurchaseOrderDto.paymentTermsDays || 30,
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
          acceptedQuantity: 0,
          lineNumber: lineNum,
        });

        this.logger.debug(`Created item with lineNumber: ${item.lineNumber}, lineNum variable: ${lineNum}`);

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

        this.logger.debug(`After manual calculation, lineNumber: ${item.lineNumber}, totalAmount: ${totalAmount}`);

        orderItems.push(item);
        subtotal += totalAmount;
        lineNum++;
      }

      this.logger.debug(`Total items created: ${orderItems.length}, checking lineNumbers: ${orderItems.map(i => i.lineNumber).join(', ')}`);

      // Set purchase order totals
      purchaseOrder.subtotal = subtotal;

      // Attach items to purchase order before calculating totals (needed for calculateTotals)
      purchaseOrder.items = orderItems;

      // Calculate totals after items are attached
      purchaseOrder.calculateTotals();

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

      // Auto-create GRN in draft status
      await this.createDraftGrn(savedPurchaseOrder);

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

    const {
      page = 1,
      limit = 10,
      search,
      supplierId,
      createdByUserId,
      orderDateFrom,
      orderDateTo,
      isOverdue,
      sortBy = 'orderDate',
      sortOrder = 'DESC',
    } = query;

    const skip = (page - 1) * limit;
    const queryBuilder = this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.createdByUser', 'createdByUser')
      .leftJoinAndSelect('po.approvedByUser', 'approvedByUser')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('po.goodsReceivedNotes', 'grns')
      .leftJoinAndSelect('po.vendorPayments', 'vendorPayments');

    // Apply search filter
    if (search) {
      queryBuilder.andWhere(
        '(po.orderNumber ILIKE :search OR supplier.companyName ILIKE :search OR po.notes ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Apply filters
    if (supplierId) {
      queryBuilder.andWhere('po.supplierId = :supplierId', { supplierId });
    }

    if (createdByUserId) {
      queryBuilder.andWhere('po.createdByUserId = :createdByUserId', { createdByUserId });
    }

    if (orderDateFrom) {
      queryBuilder.andWhere('po.orderDate >= :orderDateFrom', { 
        orderDateFrom: new Date(orderDateFrom) 
      });
    }

    if (orderDateTo) {
      queryBuilder.andWhere('po.orderDate <= :orderDateTo', { 
        orderDateTo: new Date(orderDateTo) 
      });
    }

    if (isOverdue) {
      queryBuilder.andWhere('po.expectedDeliveryDate < :now', { now: new Date() });
      queryBuilder.andWhere('po.status NOT IN (:...completedStatuses)', {
        completedStatuses: ['received', 'completed', 'cancelled']
      });
    }

    // Apply sorting
    const validSortFields = [
      'orderNumber', 'orderDate', 'status', 'priority',
      'totalAmount', 'createdAt'
    ];

    if (validSortFields.includes(sortBy)) {
      queryBuilder.orderBy(`po.${sortBy}`, sortOrder);
    } else {
      queryBuilder.orderBy('po.orderDate', 'DESC');
    }

    // Add secondary sort by orderNumber if not primary sort
    if (sortBy !== 'orderNumber') {
      queryBuilder.addOrderBy('po.orderNumber', 'DESC');
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    const purchaseOrders = await queryBuilder.getMany();
    const orderDtos = purchaseOrders.map(order => this.mapToResponseDto(order));

    return {
      orders: orderDtos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
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
      .leftJoinAndSelect('po.createdByUser', 'createdByUser')
      .leftJoinAndSelect('po.approvedByUser', 'approvedByUser')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('po.goodsReceivedNotes', 'grns')
      .leftJoinAndSelect('po.vendorPayments', 'vendorPayments')
      .where('po.id = :id', { id })
      .getOne();

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    return this.mapToResponseDto(purchaseOrder);
  }

  /**
   * Update purchase order
   */
  async update(
    id: string,
    updatePurchaseOrderDto: UpdatePurchaseOrderDto
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Updating purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      // Don't load items relation to avoid cascade issues when we manually save them
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    // Check if PO has received goods - must return before editing
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
    });

    if (grn && grn.status === GrnStatus.RECEIVED) {
      throw new BadRequestException(
        'Cannot edit purchase order with received goods. Please return goods first.'
      );
    }

    // Check if PO has been paid - must unpay before editing
    const payment = await this.vendorPaymentService.findByPurchaseOrder(id);
    if (payment) {
      throw new BadRequestException(
        'Cannot edit purchase order that has been paid. Please unpay first.'
      );
    }

    // Check if order can be modified
    try {
      // Track if orderDate is being changed
      const orderDateChanged = updatePurchaseOrderDto.orderDate &&
        new Date(updatePurchaseOrderDto.orderDate).getTime() !== new Date(purchaseOrder.orderDate).getTime();

      // Update basic fields (exclude items as they're handled separately)
      const { items: _, ...updateFields } = updatePurchaseOrderDto;
      Object.assign(purchaseOrder, {
        ...updateFields,
        orderDate: updatePurchaseOrderDto.orderDate ?
          new Date(updatePurchaseOrderDto.orderDate) : purchaseOrder.orderDate,
        expectedDeliveryDate: updatePurchaseOrderDto.expectedDeliveryDate ?
          new Date(updatePurchaseOrderDto.expectedDeliveryDate) : purchaseOrder.expectedDeliveryDate,
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
          item.acceptedQuantity = 0;
          item.lineNumber = lineNum;

          this.logger.debug(`Item before push - lineNumber: ${item.lineNumber}, productId: ${item.productId}, quantity: ${item.quantity}`);

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

        this.logger.debug(`About to save ${orderItems.length} items. LineNumbers: ${orderItems.map(i => `${i.lineNumber}`).join(', ')}`);

        try {
          const savedItems = await this.purchaseOrderItemRepository.save(orderItems);
          this.logger.debug(`Saved ${savedItems.length} items successfully`);
        } catch (saveError) {
          this.logger.error(`Failed to save items: ${saveError.message}`);
          this.logger.debug(`Item details before save attempt: ${JSON.stringify(orderItems.map(i => ({ lineNumber: i.lineNumber, productId: i.productId, quantity: i.quantity })))}`);
          throw saveError;
        }

        purchaseOrder.subtotal = subtotal;
        // Attach items to purchase order before calculating totals
        purchaseOrder.items = orderItems;
        purchaseOrder.calculateTotals();
      }

      const updatedPurchaseOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      // Sync GRN if it exists and is in draft status
      if (updatePurchaseOrderDto.items) {
        await this.syncDraftGrn(updatedPurchaseOrder.id);
      }

      // Sync GRN date if PO order date changed
      if (orderDateChanged) {
        await this.syncGrnDate(updatedPurchaseOrder.id, new Date(updatePurchaseOrderDto.orderDate));
      }

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
          .where('po.expectedDeliveryDate < :now', { now: new Date() })
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

  /**
   * Get deleted purchase orders
   */
  async findDeleted(query: PurchaseOrderQueryDto): Promise<PurchaseOrderListResponseDto> {
    this.logger.log('Getting deleted purchase orders');

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.items', 'items')
      .leftJoinAndSelect('items.product', 'product')
      .leftJoinAndSelect('po.createdByUser', 'createdByUser')
      .leftJoinAndSelect('po.approvedByUser', 'approvedByUser')
      .withDeleted() // Include soft-deleted records
      .where('po.deletedAt IS NOT NULL'); // Only get deleted ones

    // Apply search filter
    if (query.search) {
      queryBuilder.andWhere(
        '(po.orderNumber ILIKE :search OR supplier.companyName ILIKE :search OR po.notes ILIKE :search)',
        { search: `%${query.search}%` }
      );
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply sorting
    const sortBy = query.sortBy || 'deletedAt';
    const sortOrder = query.sortOrder || 'DESC';
    queryBuilder.orderBy(`po.${sortBy}`, sortOrder as 'ASC' | 'DESC');

    // Apply pagination
    queryBuilder.skip(skip).take(limit);

    const purchaseOrders = await queryBuilder.getMany();

    return {
      orders: purchaseOrders.map(po => this.mapToResponseDto(po)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1,
    };
  }

  /**
   * Restore a deleted purchase order and its associated GRN (sets deletedAt to null for both)
   */
  async restore(id: string, userId: string = 'system'): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Restoring purchase order: ${id}`);

    // Check if the order exists in deleted records
    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      withDeleted: true,
      relations: ['supplier', 'items', 'items.product', 'createdByUser', 'approvedByUser'],
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    if (!purchaseOrder.deletedAt) {
      throw new BadRequestException('Purchase order is not deleted');
    }

    // Find and restore associated GRN (set deletedAt to null)
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
      withDeleted: true,
    });

    if (grn && grn.deletedAt) {
      await this.grnRepository
        .createQueryBuilder()
        .update()
        .set({ deletedAt: null })
        .where('id = :id', { id: grn.id })
        .execute();
      this.logger.log(`Associated GRN ${grn.grnNumber} restored (deletedAt set to null)`);
    }

    // Restore PO (set deletedAt to null)
    await this.purchaseOrderRepository
      .createQueryBuilder()
      .update()
      .set({ deletedAt: null })
      .where('id = :id', { id })
      .execute();

    // Fetch the restored order
    const restoredOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: ['supplier', 'items', 'items.product', 'createdByUser', 'approvedByUser'],
    });

    this.logger.log(`Purchase order ${purchaseOrder.orderNumber} restored successfully (deletedAt set to null)`);
    return this.mapToResponseDto(restoredOrder);
  }

  /**
   * Bulk restore deleted purchase orders
   */
  async bulkRestore(orderIds: string[], userId: string = 'system'): Promise<{ restoredCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk restoring ${orderIds.length} purchase orders`);

    const failedIds: string[] = [];
    let successCount = 0;

    for (const orderId of orderIds) {
      try {
        await this.restore(orderId, userId);
        successCount++;
      } catch (error) {
        this.logger.error(`Failed to restore purchase order ${orderId}: ${error.message}`);
        failedIds.push(orderId);
      }
    }

    this.logger.log(`Bulk restore completed: ${successCount} restored, ${failedIds.length} failed`);
    return { restoredCount: successCount, failedIds };
  }

  /**
   * Permanently delete a purchase order and its associated GRN
   */
  async permanentDelete(id: string): Promise<void> {
    this.logger.log(`Permanently deleting purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    // Find and permanently delete associated GRN (including soft-deleted)
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
      withDeleted: true,
    });

    if (grn) {
      await this.grnRepository.remove(grn);
      this.logger.log(`Associated GRN ${grn.grnNumber} permanently deleted`);
    }

    // Hard delete - remove from database completely
    await this.purchaseOrderRepository.remove(purchaseOrder);

    this.logger.log(`Purchase order ${purchaseOrder.orderNumber} permanently deleted`);
  }

  /**
   * Bulk permanently delete purchase orders
   */
  async bulkPermanentDelete(orderIds: string[]): Promise<{ deletedCount: number; failedIds: string[] }> {
    this.logger.log(`Bulk permanently deleting ${orderIds.length} purchase orders`);

    const failedIds: string[] = [];
    let successCount = 0;

    for (const orderId of orderIds) {
      try {
        await this.permanentDelete(orderId);
        successCount++;
      } catch (error) {
        this.logger.error(`Failed to permanently delete purchase order ${orderId}: ${error.message}`);
        failedIds.push(orderId);
      }
    }

    this.logger.log(`Bulk permanent delete completed: ${successCount} deleted, ${failedIds.length} failed`);
    return { deletedCount: successCount, failedIds };
  }

  /**
   * Soft delete a purchase order and its associated GRN with same deletedAt timestamp
   */
  async remove(id: string): Promise<void> {
    this.logger.log(`Soft deleting purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    // Check if PO has received goods - must return before deleting
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
    });

    if (grn && grn.status === GrnStatus.RECEIVED) {
      throw new BadRequestException(
        'Cannot delete purchase order with received goods. Please return goods first.'
      );
    }

    // Check if PO has been paid - must unpay before deleting
    const payment = await this.vendorPaymentService.findByPurchaseOrder(id);
    if (payment) {
      throw new BadRequestException(
        'Cannot delete purchase order that has been paid. Please unpay first.'
      );
    }

    // Use the same deletedAt timestamp for both PO and GRN
    const deletedAt = new Date();

    // Soft delete associated GRN with same timestamp (reuse the grn variable from above)
    if (grn) {
      await this.grnRepository
        .createQueryBuilder()
        .update()
        .set({ deletedAt })
        .where('id = :id', { id: grn.id })
        .execute();
      this.logger.log(`Associated GRN ${grn.grnNumber} soft deleted with timestamp ${deletedAt.toISOString()}`);
    }

    // Soft delete PO with same timestamp
    await this.purchaseOrderRepository
      .createQueryBuilder()
      .update()
      .set({ deletedAt })
      .where('id = :id', { id })
      .execute();

    this.logger.log(`Purchase order ${purchaseOrder.orderNumber} soft deleted with timestamp ${deletedAt.toISOString()}`);
  }

  /**
   * Sync draft GRN with updated PO items
   * Only syncs if GRN is in DRAFT status
   */
  private async syncDraftGrn(purchaseOrderId: string): Promise<void> {
    try {
      // Find GRN associated with this PO
      const grn = await this.grnRepository.findOne({
        where: { purchaseOrderId },
        relations: ['items'],
      });

      if (!grn) {
        this.logger.debug(`No GRN found for PO ${purchaseOrderId}`);
        return;
      }

      // Only sync if GRN is in DRAFT status
      if (grn.status !== GrnStatus.DRAFT) {
        this.logger.debug(`GRN ${grn.grnNumber} is in ${grn.status} status, skipping sync`);
        return;
      }

      // Fetch full PO with relations
      const fullPO = await this.purchaseOrderRepository.findOne({
        where: { id: purchaseOrderId },
        relations: ['supplier', 'items', 'items.product'],
      });

      if (!fullPO) {
        this.logger.warn(`PO ${purchaseOrderId} not found during GRN sync`);
        return;
      }

      this.logger.log(`Syncing GRN ${grn.grnNumber} with updated PO ${fullPO.orderNumber}`);

      // Remove existing GRN items (since PO items were updated)
      if (grn.items && grn.items.length > 0) {
        this.logger.debug(`Removing ${grn.items.length} existing GRN items`);
        await this.grnService.removeGrnItems(grn.id);
      }

      // Recreate GRN items from updated PO items
      const grnItems: any[] = [];
      let lineNumber = 1;

      for (const poItem of fullPO.items || []) {
        const grnItem = {
          grnId: grn.id,
          lineNumber: lineNumber++,
          productId: poItem.product.id,
          orderedQuantity: Number(poItem.quantity),
          receivedQuantity: 0, // Reset to 0 for draft
          purchaseOrderItemId: poItem.id,
        };

        grnItems.push(grnItem);
        this.logger.debug(`Created GRN item for product: ${poItem.product.name}, ordered: ${grnItem.orderedQuantity}`);
      }

      this.logger.debug(`Saving ${grnItems.length} new GRN items`);
      // Save updated GRN items
      await this.grnService.updateGrnItems(grn.id, grnItems);

      // Reload GRN with fresh items from database
      this.logger.debug(`Reloading GRN ${grn.id} with items`);
      const updatedGrn = await this.grnRepository.findOne({
        where: { id: grn.id },
        relations: ['items'],
      });

      if (updatedGrn) {
        this.logger.debug(`Reloaded GRN has ${updatedGrn.items?.length || 0} items`);
        // Update GRN totals with fresh data
        updatedGrn.calculateTotals();
        await this.grnRepository.save(updatedGrn);
        this.logger.log(`GRN ${grn.grnNumber} synced successfully with ${grnItems.length} items`);
      } else {
        this.logger.warn(`Failed to reload GRN ${grn.id} after sync`);
      }
    } catch (error) {
      this.logger.error(`Error syncing draft GRN: ${error.message}`, error.stack);
      // Don't throw - GRN sync failure shouldn't block PO update
    }
  }

  /**
   * Sync GRN receivedDate with PO orderDate when PO date is changed
   */
  private async syncGrnDate(purchaseOrderId: string, newOrderDate: Date): Promise<void> {
    try {
      // Find GRN associated with this PO
      const grn = await this.grnRepository.findOne({
        where: { purchaseOrderId },
      });

      if (!grn) {
        this.logger.debug(`No GRN found for PO ${purchaseOrderId}`);
        return;
      }

      // Update GRN receivedDate to match PO orderDate
      grn.receivedDate = newOrderDate;
      await this.grnRepository.save(grn);

      this.logger.log(`GRN ${grn.grnNumber} date synced to ${newOrderDate.toISOString()}`);
    } catch (error) {
      this.logger.error(`Error syncing GRN date: ${error.message}`, error.stack);
      // Don't throw - GRN date sync failure shouldn't block PO update
    }
  }

  /**
   * Create a draft GRN for a new purchase order
   */
  private async createDraftGrn(purchaseOrder: PurchaseOrder): Promise<void> {
    try {
      // Generate sequential GRN number
      const grns = await this.grnRepository.find({
        select: ['grnNumber'],
        withDeleted: true,
      });

      let maxNumber = 0;
      for (const grn of grns) {
        const match = grn.grnNumber.match(/^GRN-(\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      }
      const grnNumber = `GRN-${(maxNumber + 1).toString().padStart(6, '0')}`;

      // Fetch full PO with relations for GRN creation
      const fullPO = await this.purchaseOrderRepository.findOne({
        where: { id: purchaseOrder.id },
        relations: ['supplier', 'items', 'items.product'],
      });

      if (!fullPO) {
        throw new NotFoundException('Purchase order not found');
      }

      // Create GRN with draft status
      const grn = this.grnRepository.create({
        grnNumber,
        purchaseOrderId: fullPO.id,
        supplierId: fullPO.supplier.id,
        receivedDate: new Date(),
        status: GrnStatus.DRAFT,
        totalQuantityReceived: 0,
      });

      const savedGrn = await this.grnRepository.save(grn);

      // Create GRN items using relational table
      const grnItems: any[] = [];
      let lineNumber = 1;

      for (const poItem of fullPO.items || []) {
        const grnItem = {
          grnId: savedGrn.id,
          lineNumber: lineNumber++,
          productId: poItem.product.id,
          orderedQuantity: Number(poItem.quantity),
          receivedQuantity: 0, // Set to 0 for draft status
          purchaseOrderItemId: poItem.id,
        };

        grnItems.push(grnItem);
      }

      // Save GRN items only if we have items to save
      if (grnItems.length > 0) {
        await this.grnService.updateGrnItems(savedGrn.id, grnItems);
      }

      // Update GRN totals based on relational items
      savedGrn.items = grnItems as any;
      savedGrn.calculateTotals();
      await this.grnRepository.save(savedGrn);

      this.logger.log(`Draft GRN ${grnNumber} created for PO ${fullPO.orderNumber} with ${grnItems.length} items`);
    } catch (error) {
      this.logger.error(`Error creating draft GRN: ${error.message}`, error.stack);
      // Log detailed error but don't throw - GRN creation failure shouldn't block PO creation
      // However, we should clean up the partial GRN if it was created
      this.logger.warn(`Draft GRN creation failed for PO ${purchaseOrder.orderNumber}. User will need to manually create or receive GRN.`);
    }
  }

  /**
   * Receive goods - change GRN status to received and update product quantities
   */
  async receiveGoods(id: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Receiving goods for purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: ['items', 'items.product', 'supplier'],
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    // Find the GRN linked to this PO with relational items
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
      relations: ['items'],
    });

    if (!grn) {
      throw new NotFoundException('Goods Received Note not found for this purchase order');
    }

    if (grn.status !== GrnStatus.DRAFT) {
      throw new BadRequestException('GRN must be in draft status to receive goods');
    }

    try {
      // Update GRN items to set received quantities
      if (grn.items && grn.items.length > 0) {
        await this.grnService.updateGrnItems(grn.id, grn.items.map(item => ({
          id: item.id,
          grnId: item.grnId,
          lineNumber: item.lineNumber,
          productId: item.productId,
          orderedQuantity: Number(item.orderedQuantity),
          receivedQuantity: Number(item.orderedQuantity), // Set received = ordered
          purchaseOrderItemId: item.purchaseOrderItemId,
        })));
      }

      // Reload GRN with fresh items from database
      const updatedGrn = await this.grnRepository.findOne({
        where: { id: grn.id },
        relations: ['items'],
      });

      if (!updatedGrn) {
        throw new NotFoundException('GRN not found after updating items');
      }

      // Update GRN status and recalculate totals with fresh data
      updatedGrn.status = GrnStatus.RECEIVED;
      updatedGrn.calculateTotals();
      await this.grnRepository.save(updatedGrn);

      // Update product quantities
      for (const item of purchaseOrder.items) {
        const product = await this.productRepository.findOne({
          where: { id: item.productId },
        });

        if (product) {
          product.adjustStock(Number(item.quantity), 'increase');
          await this.productRepository.save(product);
        }

        // Update PO item received quantity
        item.receivedQuantity = item.quantity;
        item.acceptedQuantity = item.quantity;
        await this.purchaseOrderItemRepository.save(item);
      }

      // Update base costs for all received products
      await this.updateBaseCostsForGrn(updatedGrn, purchaseOrder);

      this.logger.log(`Goods received successfully for PO ${purchaseOrder.orderNumber}`);
      return await this.findOne(id);
    } catch (error) {
      this.logger.error(`Error receiving goods: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to receive goods');
    }
  }

  /**
   * Return goods - change GRN status to return and revert product quantities
   */
  async returnGoods(id: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Returning goods for purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: ['items', 'items.product', 'supplier'],
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    // Find the GRN linked to this PO with relational items
    const grn = await this.grnRepository.findOne({
      where: { purchaseOrderId: id },
      relations: ['items'],
    });

    if (!grn) {
      throw new NotFoundException('Goods Received Note not found for this purchase order');
    }

    if (grn.status !== GrnStatus.RECEIVED) {
      throw new BadRequestException('GRN must be in received status to return goods');
    }

    try {
      // Reset GRN items received quantities to 0
      if (grn.items && grn.items.length > 0) {
        await this.grnService.updateGrnItems(grn.id, grn.items.map(item => ({
          id: item.id,
          grnId: item.grnId,
          lineNumber: item.lineNumber,
          productId: item.productId,
          orderedQuantity: Number(item.orderedQuantity),
          receivedQuantity: 0, // Reset to 0 (return)
          purchaseOrderItemId: item.purchaseOrderItemId,
        })));
      }

      // Reload GRN with fresh items from database
      const updatedGrn = await this.grnRepository.findOne({
        where: { id: grn.id },
        relations: ['items'],
      });

      if (!updatedGrn) {
        throw new NotFoundException('GRN not found after updating items');
      }

      // Update GRN status back to draft and recalculate totals with fresh data
      updatedGrn.status = GrnStatus.DRAFT;
      updatedGrn.calculateTotals();
      await this.grnRepository.save(updatedGrn);

      // Revert product quantities
      for (const item of purchaseOrder.items) {
        const product = await this.productRepository.findOne({
          where: { id: item.productId },
        });

        if (product) {
          product.adjustStock(Number(item.quantity), 'decrease');
          await this.productRepository.save(product);
        }

        // Reset PO item received quantity
        item.receivedQuantity = 0;
        item.acceptedQuantity = 0;
        await this.purchaseOrderItemRepository.save(item);
      }

      this.logger.log(`Goods returned successfully for PO ${purchaseOrder.orderNumber}`);
      return await this.findOne(id);
    } catch (error) {
      this.logger.error(`Error returning goods: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to return goods');
    }
  }

  /**
   * Mark purchase order as paid by creating a vendor payment
   */
  async markAsPaid(id: string): Promise<{ order: PurchaseOrderResponseDto; payment: VendorPayment }> {
    this.logger.log(`Marking purchase order as paid: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: ['supplier'],
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    // Check if payment already exists
    const existingPayment = await this.vendorPaymentService.findByPurchaseOrder(id);
    if (existingPayment) {
      throw new BadRequestException('Purchase order is already paid');
    }

    // Create vendor payment
    const payment = await this.vendorPaymentService.createForPurchaseOrder(id);

    // Get updated order with payment status
    const updatedOrder = await this.findOne(id);

    this.logger.log(`Purchase order ${purchaseOrder.orderNumber} marked as paid with payment ${payment.paymentNumber}`);
    return { order: updatedOrder, payment };
  }

  /**
   * Mark purchase order as unpaid by hard deleting the vendor payment
   */
  async markAsUnpaid(id: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Marking purchase order as unpaid: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    // Find existing payment
    const existingPayment = await this.vendorPaymentService.findByPurchaseOrder(id);
    if (!existingPayment) {
      throw new NotFoundException('No payment found for this purchase order');
    }

    // Hard delete the vendor payment
    await this.vendorPaymentService.permanentDelete(existingPayment.id);

    // Get updated order
    const updatedOrder = await this.findOne(id);

    this.logger.log(`Purchase order ${purchaseOrder.orderNumber} marked as unpaid - payment deleted`);
    return updatedOrder;
  }

  /**
   * Get payment status of a purchase order
   */
  async getPaymentStatus(id: string): Promise<{ isPaid: boolean; payment?: any }> {
    this.logger.log(`Checking payment status for purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    const payment = await this.vendorPaymentService.findByPurchaseOrder(id);

    return {
      isPaid: !!payment,
      payment: payment ? {
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
      } : undefined,
    };
  }

  /**
   * Map purchase order entity to response DTO
   */
  private mapToResponseDto(purchaseOrder: PurchaseOrder): PurchaseOrderResponseDto {
    return {
      id: purchaseOrder.id,
      orderNumber: purchaseOrder.orderNumber,
      supplier: {
        id: purchaseOrder.supplier.id,
        supplierCode: purchaseOrder.supplier.id.slice(0, 8).toUpperCase(),
        companyName: purchaseOrder.supplier.companyName,
        contactPerson: purchaseOrder.supplier.contactPerson,
        email: undefined,
        phone: purchaseOrder.supplier.phone,
      },
      createdByUser: purchaseOrder.createdByUser ? {
        id: purchaseOrder.createdByUser.id,
        username: purchaseOrder.createdByUser.username,
        firstName: purchaseOrder.createdByUser.firstName,
        lastName: purchaseOrder.createdByUser.lastName,
      } : undefined,
      approvedByUser: purchaseOrder.approvedByUser ? {
        id: purchaseOrder.approvedByUser.id,
        username: purchaseOrder.approvedByUser.username,
        firstName: purchaseOrder.approvedByUser.firstName,
        lastName: purchaseOrder.approvedByUser.lastName,
      } : undefined,
      orderDate: purchaseOrder.orderDate,
            sentDate: purchaseOrder.sentDate,
      acknowledgedDate: purchaseOrder.acknowledgedDate,
      expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
      deliveredDate: purchaseOrder.deliveredDate,
      fullDeliveryAddress: purchaseOrder.fullDeliveryAddress,
      deliveryContact: purchaseOrder.deliveryContact,
      deliveryPhone: purchaseOrder.deliveryPhone,
      subtotal: Number(purchaseOrder.subtotal),
      discountPercent: Number(purchaseOrder.discountPercent),
      discountAmount: Number(purchaseOrder.discountAmount),
      shippingAmount: Number(purchaseOrder.shippingAmount),
      totalAmount: Number(purchaseOrder.totalAmount),
      paymentTermsDays: purchaseOrder.paymentTermsDays,
      paymentTerms: purchaseOrder.paymentTerms,
      deliveryTerms: purchaseOrder.deliveryTerms,
      notes: purchaseOrder.notes,
      internalNotes: purchaseOrder.internalNotes,
      supplierQuoteRef: purchaseOrder.supplierQuoteRef,
      isOverdue: purchaseOrder.isOverdue,
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
                notes: item.notes,
      })) || [],
      goodsReceivedNotes: purchaseOrder.goodsReceivedNotes?.map(grn => ({
        id: grn.id,
        grnNumber: grn.grnNumber,
        status: grn.status,
        receiptDate: grn.receivedDate,
      })) || [],
      vendorPayments: purchaseOrder.vendorPayments?.map(payment => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
      })) || [],
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt,
      deletedAt: purchaseOrder.deletedAt,
    };
  }

  /**
   * Update base costs for all products in a GRN
   * Calculates shipping allocation BY VALUE and records cost history
   */
  private async updateBaseCostsForGrn(
    grn: GoodsReceivedNote,
    purchaseOrder: PurchaseOrder,
  ): Promise<void> {
    this.logger.log(`Updating base costs for GRN ${grn.grnNumber}`);

    const po = purchaseOrder;
    const poSubtotal = Number(po.subtotal || 0);
    const poShipping = Number(po.shippingAmount || 0);

    this.logger.log(
      `PO ${po.orderNumber}: Subtotal RM ${poSubtotal.toFixed(2)}, Shipping RM ${poShipping.toFixed(2)}`
    );

    // Process each GRN item
    for (const grnItem of grn.items) {
      // Find corresponding PO item to get unit cost
      const poItem = po.items?.find(item => item.id === grnItem.purchaseOrderItemId);

      if (!poItem) {
        this.logger.warn(`PO item not found for GRN item ${grnItem.id}, skipping base cost update`);
        continue;
      }

      const unitCost = Number(poItem.unitCost);
      const receivedQty = Number(grnItem.receivedQuantity);

      // Calculate shipping per unit using BY VALUE method
      const shippingPerUnit = this.baseCostCalculator.calculateShippingByValue(
        unitCost,
        receivedQty,
        poSubtotal,
        poShipping,
      );

      this.logger.log(
        `Product ${grnItem.productId}: ${receivedQty} units @ RM ${unitCost.toFixed(4)} + RM ${shippingPerUnit.toFixed(4)} shipping`
      );

      // Add stock to cost history and recalculate base cost
      await this.baseCostCalculator.addStock(
        grnItem.productId,
        grn.id,
        receivedQty,
        unitCost,
        shippingPerUnit,
        grn.receivedDate,
      );
    }

    this.logger.log(`Base costs updated successfully for GRN ${grn.grnNumber}`);
  }
}