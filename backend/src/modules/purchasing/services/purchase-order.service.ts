import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, Like, In, Between } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseOrderItem,
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
   * Generate sequential purchase order number in format PO-000001
   */
  private async generateSequentialOrderNumber(): Promise<string> {
    // Get all existing order numbers that match the sequential format
    const orders = await this.purchaseOrderRepository.find({
      select: ['orderNumber']
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
          .where('po.requiredDate < :now', { now: new Date() })
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
   * Soft delete a purchase order
   */
  async remove(id: string, userId: string = 'system'): Promise<void> {
    this.logger.log(`Soft deleting purchase order: ${id}`);

    const purchaseOrder = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    // Soft delete using TypeORM's softDelete method
    await this.purchaseOrderRepository.softDelete(id);

    this.logger.log(`Purchase order ${purchaseOrder.orderNumber} soft deleted successfully`);
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