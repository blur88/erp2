import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In, Between } from 'typeorm';
import { 
  PurchaseOrder, 
  PurchaseOrderItem,
  PurchaseOrderStatus, 
  PurchaseOrderPriority,
  Supplier,
  User,
  Product
} from '../../../database/entities';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderQueryDto,
  PurchaseOrderResponseDto,
  PurchaseOrderListResponseDto,
  ApprovePurchaseOrderDto,
  AcknowledgePurchaseOrderDto,
  CancelPurchaseOrderDto,
  PurchaseOrderSummaryDto,
} from '../dto';
import { SupplierService } from './supplier.service';

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
    private readonly supplierService: SupplierService,
  ) {}

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
      // Create purchase order
      const purchaseOrder = this.purchaseOrderRepository.create({
        ...createPurchaseOrderDto,
        orderDate: new Date(createPurchaseOrderDto.orderDate),
        createdByUserId: validUserId,
        status: PurchaseOrderStatus.DRAFT,
        priority: PurchaseOrderPriority.NORMAL,
        paymentTermsDays: createPurchaseOrderDto.paymentTermsDays || 30,
      });

      // Generate order number
      purchaseOrder.generateOrderNumber();

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
          productSku: product.barcode || '',
          productName: product.name,
          productDescription: product.description,
          quantity: itemDto.quantity,
          unitCost: itemDto.unitPrice,
          unit: 'pcs',
          discountPercent: itemDto.discountPercent || 0,
          status: 'pending' as any,
          receivedQuantity: 0,
          rejectedQuantity: 0,
          acceptedQuantity: 0,
          lineNumber: lineNum,
        });

        this.logger.debug(`Created item with lineNumber: ${item.lineNumber}, lineNum variable: ${lineNum}`);

        // Calculate totals
        item.calculateTotals();

        this.logger.debug(`After calculateTotals, lineNumber: ${item.lineNumber}`);

        orderItems.push(item);
        subtotal += Number(item.totalAmount);
        lineNum++;
      }

      this.logger.debug(`Total items created: ${orderItems.length}, checking lineNumbers: ${orderItems.map(i => i.lineNumber).join(', ')}`);

      // Set purchase order totals
      purchaseOrder.subtotal = subtotal;
      purchaseOrder.calculateTotals();

      // Check supplier credit limit
      const canPurchase = await this.supplierService.canPurchase(
        supplier.id,
        Number(purchaseOrder.totalAmount)
      );

      if (!canPurchase) {
        throw new BadRequestException('Purchase amount exceeds supplier credit limit');
      }

      // Attach items to purchase order before saving (cascade save will handle items)
      purchaseOrder.items = orderItems;

      // Save purchase order with items (cascade will save items automatically)
      const savedPurchaseOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      // Update supplier metrics if this is a new order
      const isFirstOrder = supplier.totalOrders === 0;
      await this.supplierService.updatePurchaseMetrics(
        supplier.id, 
        Number(savedPurchaseOrder.totalAmount), 
        isFirstOrder
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

    const {
      page = 1,
      limit = 10,
      search,
      supplierId,
      status,
      priority,
      createdByUserId,
      orderDateFrom,
      orderDateTo,
      requiredDateFrom,
      requiredDateTo,
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
      .leftJoinAndSelect('items.product', 'product');

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

    if (status) {
      queryBuilder.andWhere('po.status = :status', { status });
    }

    if (priority) {
      queryBuilder.andWhere('po.priority = :priority', { priority });
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

    if (requiredDateFrom) {
      queryBuilder.andWhere('po.requiredDate >= :requiredDateFrom', { 
        requiredDateFrom: new Date(requiredDateFrom) 
      });
    }

    if (requiredDateTo) {
      queryBuilder.andWhere('po.requiredDate <= :requiredDateTo', { 
        requiredDateTo: new Date(requiredDateTo) 
      });
    }

    if (isOverdue) {
      queryBuilder.andWhere('po.requiredDate < :now', { now: new Date() });
      queryBuilder.andWhere('po.status NOT IN (:...completedStatuses)', {
        completedStatuses: ['received', 'completed', 'cancelled']
      });
    }

    // Apply sorting
    const validSortFields = [
      'orderNumber', 'orderDate', 'requiredDate', 'status', 'priority',
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
      relations: ['items'],
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    // Check if order can be modified
    if (purchaseOrder.isCompleted) {
      throw new BadRequestException('Cannot modify completed purchase order');
    }

    try {
      // Update basic fields
      Object.assign(purchaseOrder, {
        ...updatePurchaseOrderDto,
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

          const item = this.purchaseOrderItemRepository.create({
            purchaseOrderId: id,
            productId: itemDto.productId,
            productSku: product.barcode || '',
            productName: product.name,
            productDescription: product.description,
            quantity: itemDto.quantity,
            unitCost: itemDto.unitPrice,
            unit: 'pcs',
            discountPercent: itemDto.discountPercent || 0,
            status: 'pending' as any,
            receivedQuantity: 0,
            rejectedQuantity: 0,
            acceptedQuantity: 0,
            lineNumber: lineNum,
          });

          item.calculateTotals();
          orderItems.push(item);
          subtotal += Number(item.totalAmount);
          lineNum++;
        }

        await this.purchaseOrderItemRepository.save(orderItems);
        purchaseOrder.subtotal = subtotal;
        purchaseOrder.calculateTotals();
      }

      const updatedPurchaseOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      this.logger.log(`Purchase order updated successfully: ${updatedPurchaseOrder.orderNumber}`);
      return await this.findOne(updatedPurchaseOrder.id);
    } catch (error) {
      this.logger.error(`Error updating purchase order: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to update purchase order');
    }
  }

  /**
   * Approve purchase order
   */
  async approve(
    id: string, 
    approveDto: ApprovePurchaseOrderDto, 
    userId: string
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Approving purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: ['supplier'],
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (!purchaseOrder.canApprove) {
      throw new BadRequestException('Purchase order cannot be approved in current status');
    }

    try {
      purchaseOrder.approve(userId);
      if (approveDto.comments) {
        purchaseOrder.internalNotes = (purchaseOrder.internalNotes || '') + 
          `\nApproved: ${approveDto.comments}`;
      }

      const updatedOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      this.logger.log(`Purchase order approved successfully: ${updatedOrder.orderNumber}`);
      return await this.findOne(updatedOrder.id);
    } catch (error) {
      this.logger.error(`Error approving purchase order: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to approve purchase order');
    }
  }

  /**
   * Send purchase order to supplier
   */
  async send(id: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Sending purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (!purchaseOrder.canSend) {
      throw new BadRequestException('Purchase order cannot be sent in current status');
    }

    try {
      purchaseOrder.send();
      const updatedOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      this.logger.log(`Purchase order sent successfully: ${updatedOrder.orderNumber}`);
      return await this.findOne(updatedOrder.id);
    } catch (error) {
      this.logger.error(`Error sending purchase order: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to send purchase order');
    }
  }

  /**
   * Acknowledge purchase order from supplier
   */
  async acknowledge(
    id: string, 
    acknowledgeDto: AcknowledgePurchaseOrderDto
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Acknowledging purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (purchaseOrder.status !== PurchaseOrderStatus.SENT) {
      throw new BadRequestException('Purchase order cannot be acknowledged in current status');
    }

    try {
      const expectedDeliveryDate = acknowledgeDto.expectedDeliveryDate ?
        new Date(acknowledgeDto.expectedDeliveryDate) : undefined;
      
      purchaseOrder.acknowledge(expectedDeliveryDate);
      
      if (acknowledgeDto.notes) {
        purchaseOrder.internalNotes = (purchaseOrder.internalNotes || '') + 
          `\nAcknowledged: ${acknowledgeDto.notes}`;
      }

      const updatedOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      this.logger.log(`Purchase order acknowledged successfully: ${updatedOrder.orderNumber}`);
      return await this.findOne(updatedOrder.id);
    } catch (error) {
      this.logger.error(`Error acknowledging purchase order: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to acknowledge purchase order');
    }
  }

  /**
   * Cancel purchase order
   */
  async cancel(
    id: string, 
    cancelDto: CancelPurchaseOrderDto
  ): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Cancelling purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (!purchaseOrder.canCancel()) {
      throw new BadRequestException('Purchase order cannot be cancelled in current status');
    }

    try {
      purchaseOrder.cancel(cancelDto.reason);
      const updatedOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      this.logger.log(`Purchase order cancelled successfully: ${updatedOrder.orderNumber}`);
      return await this.findOne(updatedOrder.id);
    } catch (error) {
      this.logger.error(`Error cancelling purchase order: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to cancel purchase order');
    }
  }

  /**
   * Mark purchase order as received
   */
  async markAsReceived(id: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Marking purchase order as received: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (!purchaseOrder.isReceivable) {
      throw new BadRequestException('Purchase order cannot be marked as received in current status');
    }

    try {
      purchaseOrder.markAsReceived();
      const updatedOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      this.logger.log(`Purchase order marked as received: ${updatedOrder.orderNumber}`);
      return await this.findOne(updatedOrder.id);
    } catch (error) {
      this.logger.error(`Error marking purchase order as received: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to mark purchase order as received');
    }
  }

  /**
   * Complete purchase order
   */
  async complete(id: string): Promise<PurchaseOrderResponseDto> {
    this.logger.log(`Completing purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (purchaseOrder.status !== PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException('Purchase order cannot be completed in current status');
    }

    try {
      purchaseOrder.complete();
      const updatedOrder = await this.purchaseOrderRepository.save(purchaseOrder);

      this.logger.log(`Purchase order completed successfully: ${updatedOrder.orderNumber}`);
      return await this.findOne(updatedOrder.id);
    } catch (error) {
      this.logger.error(`Error completing purchase order: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to complete purchase order');
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
        ordersByStatus,
        ordersByPriority,
        overdueOrders,
        pendingApproval,
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

        // Orders by status
        this.purchaseOrderRepository
          .createQueryBuilder('po')
          .select('po.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('po.status')
          .getRawMany()
          .then(results => 
            results.reduce((acc, row) => {
              acc[row.status] = parseInt(row.count);
              return acc;
            }, {} as Record<string, number>)
          ),

        // Orders by priority
        this.purchaseOrderRepository
          .createQueryBuilder('po')
          .select('po.priority', 'priority')
          .addSelect('COUNT(*)', 'count')
          .groupBy('po.priority')
          .getRawMany()
          .then(results => 
            results.reduce((acc, row) => {
              acc[row.priority] = parseInt(row.count);
              return acc;
            }, {} as Record<string, number>)
          ),

        // Overdue orders
        this.purchaseOrderRepository
          .createQueryBuilder('po')
          .where('po.requiredDate < :now', { now: new Date() })
          .andWhere('po.status NOT IN (:...statuses)', {
            statuses: ['received', 'completed', 'cancelled']
          })
          .getCount(),

        // Pending approval
        this.purchaseOrderRepository
          .createQueryBuilder('po')
          .where('po.status = :status', { status: PurchaseOrderStatus.PENDING })
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
        ordersByStatus,
        ordersByPriority,
        averageOrderValue,
        overdueOrders,
        pendingApprovalCount: pendingApproval,
        topSuppliers,
      };
    } catch (error) {
      this.logger.error(`Error getting purchase order summary: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to get purchase order summary');
    }
  }

  /**
   * Map purchase order entity to response DTO
   */
  private mapToResponseDto(purchaseOrder: PurchaseOrder): PurchaseOrderResponseDto {
    return {
      id: purchaseOrder.id,
      orderNumber: purchaseOrder.orderNumber,
      status: purchaseOrder.status,
      priority: purchaseOrder.priority,
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
      requiredDate: purchaseOrder.requiredDate,
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
      taxPercent: Number(purchaseOrder.taxPercent),
      taxAmount: Number(purchaseOrder.taxAmount),
      shippingAmount: Number(purchaseOrder.shippingAmount),
      totalAmount: Number(purchaseOrder.totalAmount),
      paymentTermsDays: purchaseOrder.paymentTermsDays,
      paymentTerms: purchaseOrder.paymentTerms,
      deliveryTerms: purchaseOrder.deliveryTerms,
      notes: purchaseOrder.notes,
      internalNotes: purchaseOrder.internalNotes,
      supplierQuoteRef: purchaseOrder.supplierQuoteRef,
      isOverdue: purchaseOrder.isOverdue,
      isReceivable: purchaseOrder.isReceivable,
      isCompleted: purchaseOrder.isCompleted,
      canApprove: purchaseOrder.canApprove,
      canSend: purchaseOrder.canSend,
      canCancel: purchaseOrder.canCancel(),
      isFullyReceived: purchaseOrder.isFullyReceived(),
      totalReceivedQuantity: purchaseOrder.getTotalReceivedQuantity(),
      totalOrderedQuantity: purchaseOrder.getTotalOrderedQuantity(),
      items: purchaseOrder.items?.map(item => ({
        id: item.id,
        product: item.product ? {
          id: item.product.id,
          sku: item.productSku,
          name: item.product.name,
          unit: item.unit,
        } : undefined,
        description: item.productName,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitCost),
        unit: item.unit,
        discountPercent: Number(item.discountPercent),
        discountAmount: Number(item.discountAmount),
        taxPercent: 0,
        taxAmount: 0,
        totalAmount: Number(item.totalAmount),
        receivedQuantity: Number(item.receivedQuantity),
        rejectedQuantity: Number(item.rejectedQuantity),
        isFullyReceived: item.isFullyReceived,
        status: item.status,
        requiredDate: item.requiredDate,
        notes: item.notes,
      })) || [],
      createdAt: purchaseOrder.createdAt,
      updatedAt: purchaseOrder.updatedAt,
    };
  }
}