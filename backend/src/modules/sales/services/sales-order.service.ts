import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, FindManyOptions, MoreThanOrEqual, LessThanOrEqual, ILike } from 'typeorm';
import {
  SalesOrder,
  SalesOrderStatus,
  SalesOrderPriority
} from '../../../database/entities/sales-order.entity';
import { SalesOrderItem, DiscountType } from '../../../database/entities/sales-order-item.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Product } from '../../../database/entities/product.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { User } from '../../../database/entities/user.entity';
import {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
  QuerySalesOrdersDto,
  SalesOrderResponseDto,
  SalesOrderSummaryDto,
  ShipOrderDto,
} from '../dto/sales-order.dto';
// import { CustomerService } from './customer.service';
import { InventoryIntegrationService } from './inventory-integration.service';
import { ValidationUtil, BulkOperationUtil, BulkOperationResponse } from '../../../common/utils/validation.util';

@Injectable()
export class SalesOrderService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepository: Repository<SalesOrderItem>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    // private readonly customerService: CustomerService,
    private readonly inventoryIntegrationService: InventoryIntegrationService,
  ) {}

  private async generateSequentialOrderNumber(): Promise<string> {
    // Get all existing order numbers that match the sequential format
    const orders = await this.salesOrderRepository.find({
      select: ['orderNumber']
    });

    let maxNumber = 0;
    for (const order of orders) {
      // Extract number from format SO-000001 (only sequential format)
      const match = order.orderNumber.match(/^SO-(\d+)$/);
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
    return `SO-${nextNumber.toString().padStart(6, '0')}`;
  }

  private async generateInvoiceNumber(): Promise<string> {
    // Get all existing invoice numbers that match the sequential format
    const invoices = await this.invoiceRepository.find({
      select: ['invoiceNumber']
    });

    let maxNumber = 0;
    for (const invoice of invoices) {
      // Extract number from format INV-000001 (only sequential format)
      const match = invoice.invoiceNumber.match(/^INV-(\d+)$/);
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
    return `INV-${nextNumber.toString().padStart(6, '0')}`;
  }

  private async findPreviousOrder(currentOrderNumber: string): Promise<SalesOrderResponseDto | null> {
    // Extract number from current order number (format: SO-000003)
    const match = currentOrderNumber.match(/^SO-(\d+)$/);
    if (!match) {
      return null; // Invalid format
    }

    const currentNumber = parseInt(match[1]);
    if (currentNumber <= 1) {
      return null; // No previous order possible
    }

    // Calculate previous sequential number
    const previousNumber = currentNumber - 1;
    const previousOrderNumber = `SO-${previousNumber.toString().padStart(6, '0')}`;

    // Check if the previous order exists in database and get full details
    const previousOrder = await this.salesOrderRepository.findOne({
      where: { orderNumber: previousOrderNumber },
      relations: ['customer', 'createdByUser', 'items', 'items.product'],
      withDeleted: true // Include soft-deleted orders
    });

    return previousOrder ? this.mapToResponseDto(previousOrder) : null;
  }

  async create(createSalesOrderDto: CreateSalesOrderDto, userId: string | null): Promise<SalesOrderResponseDto> {
    const { customerId, items, ...orderData } = createSalesOrderDto;

    // Verify customer exists and can purchase
    const customer = await this.customerRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Check customer status
    if (!customer.isActive) {
      throw new ConflictException('Customer is not active');
    }

    // Validate and calculate order totals
    const orderItems = await this.validateAndProcessItems(items);
    const totalAmount = orderItems.reduce((sum, item) => sum + Number(item.totalAmount), 0);

    // Note: Credit limit check removed - customerService not available

    // Check inventory availability
    const inventoryCheck = await this.inventoryIntegrationService.checkAvailability(
      items.map(item => ({ productId: item.productId, quantity: item.quantity }))
    );
    
    if (!inventoryCheck.available) {
      throw new ConflictException(`Insufficient inventory: ${inventoryCheck.message}`);
    }

    // Generate sequential order number
    const orderNumber = await this.generateSequentialOrderNumber();

    // Create sales order
    const salesOrder = this.salesOrderRepository.create({
      ...orderData,
      orderNumber,
      customerId,
      createdByUserId: userId,
      orderDate: new Date(),
      totalAmount,
      status: SalesOrderStatus.DRAFT,
    });

    const savedOrder = await this.salesOrderRepository.save(salesOrder);

    // Create order items
    const createdItems = [];
    for (const itemData of orderItems) {
      console.log('Creating order item with data:', JSON.stringify(itemData, null, 2));
      const orderItem = this.salesOrderItemRepository.create({
        ...itemData,
        salesOrderId: savedOrder.id,
      });
      console.log('Created order item object:', JSON.stringify(orderItem, null, 2));
      createdItems.push(await this.salesOrderItemRepository.save(orderItem));
    }

    // Reserve inventory
    await this.inventoryIntegrationService.reserveStock(
      items.map(item => ({ 
        productId: item.productId, 
        quantity: item.quantity,
        salesOrderId: savedOrder.id,
      }))
    );

    return this.findById(savedOrder.id);
  }

  async findAll(query: QuerySalesOrdersDto) {
    const {
      search,
      customerId,
      fromDate,
      toDate,
      paymentStatus,
      fulfillmentStatus,
      sortBy = 'orderNumber',
      sortOrder = 'ASC',
      page = 1,
      limit = 20,
    } = query;

    // Use QueryBuilder to avoid metadata issues
    let queryBuilder = this.salesOrderRepository
      .createQueryBuilder('order')
      .select([
        'order.id',
        'order.orderNumber',
        'order.status',
        'order.orderDate',
        'order.totalAmount',
        'order.paidAmount',
        'order.isFulfilled',
        'order.customerId',
        'order.createdAt',
        'order.updatedAt'
      ])
      .where('order.deletedAt IS NULL'); // Only get non-deleted orders

    if (customerId) {
      queryBuilder = queryBuilder.andWhere('order.customerId = :customerId', { customerId });
    }

    if (fromDate) {
      queryBuilder = queryBuilder.andWhere('order.orderDate >= :fromDate', { fromDate: new Date(fromDate) });
    }
    
    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      queryBuilder = queryBuilder.andWhere('order.orderDate <= :toDate', { toDate: endDate });
    }
    
    if (search) {
      queryBuilder = queryBuilder.andWhere('order.orderNumber ILIKE :search', { search: `%${search}%` });
    }

    // Payment status filter
    if (paymentStatus && paymentStatus !== 'all') {
      switch (paymentStatus) {
        case 'unpaid':
          queryBuilder = queryBuilder.andWhere('(order.paidAmount = 0 OR order.paidAmount IS NULL)');
          break;
        case 'partial':
          queryBuilder = queryBuilder.andWhere('order.paidAmount > 0 AND order.paidAmount < order.totalAmount');
          break;
        case 'paid':
          queryBuilder = queryBuilder.andWhere('order.paidAmount >= order.totalAmount AND order.paidAmount > 0');
          break;
        case 'overpaid':
          queryBuilder = queryBuilder.andWhere('order.paidAmount > order.totalAmount');
          break;
      }
    }

    // Fulfillment status filter
    if (fulfillmentStatus && fulfillmentStatus !== 'all') {
      switch (fulfillmentStatus) {
        case 'fulfilled':
          queryBuilder = queryBuilder.andWhere('order.isFulfilled = true');
          break;
        case 'unfulfilled':
          queryBuilder = queryBuilder.andWhere('order.isFulfilled = false');
          break;
      }
    }

    queryBuilder = queryBuilder
      .orderBy(`order.${sortBy}`, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Get count first
    const countQuery = this.salesOrderRepository
      .createQueryBuilder('order')
      .where('order.deletedAt IS NULL')
      .select('COUNT(order.id)', 'count');
    
    if (customerId) {
      countQuery.andWhere('order.customerId = :customerId', { customerId });
    }
    if (fromDate) {
      countQuery.andWhere('order.orderDate >= :fromDate', { fromDate: new Date(fromDate) });
    }
    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      countQuery.andWhere('order.orderDate <= :toDate', { toDate: endDate });
    }
    if (search) {
      countQuery.andWhere('order.orderNumber ILIKE :search', { search: `%${search}%` });
    }

    // Payment status filter for count query
    if (paymentStatus && paymentStatus !== 'all') {
      switch (paymentStatus) {
        case 'unpaid':
          countQuery.andWhere('(order.paidAmount = 0 OR order.paidAmount IS NULL)');
          break;
        case 'partial':
          countQuery.andWhere('order.paidAmount > 0 AND order.paidAmount < order.totalAmount');
          break;
        case 'paid':
          countQuery.andWhere('order.paidAmount >= order.totalAmount AND order.paidAmount > 0');
          break;
        case 'overpaid':
          countQuery.andWhere('order.paidAmount > order.totalAmount');
          break;
      }
    }

    // Fulfillment status filter for count query
    if (fulfillmentStatus && fulfillmentStatus !== 'all') {
      switch (fulfillmentStatus) {
        case 'fulfilled':
          countQuery.andWhere('order.isFulfilled = true');
          break;
        case 'unfulfilled':
          countQuery.andWhere('order.isFulfilled = false');
          break;
      }
    }

    const { count } = await countQuery.getRawOne();
    const total = parseInt(count);
    
    // Get orders
    const orders = await queryBuilder.getMany();

    return {
      data: orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        orderDate: order.orderDate,
        totalAmount: Number(order.totalAmount),
        paidAmount: Number(order.paidAmount || 0),
        balanceDue: Math.max(0, Number(order.totalAmount) - Number(order.paidAmount || 0)),
        isPaidInFull: Number(order.paidAmount || 0) >= Number(order.totalAmount),
        isFulfilled: order.isFulfilled,
        customerId: order.customerId,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async testInvoiceRelations(orderNumber: string): Promise<any> {
    const order = await this.salesOrderRepository.findOne({
      where: { orderNumber },
      relations: ['invoices', 'customer', 'items']
    });

    return {
      order,
      invoicesCount: order?.invoices?.length || 0,
      invoices: order?.invoices || null
    };
  }

  async findSummaries(query: QuerySalesOrdersDto = {}): Promise<any> {
    console.log('🚀 findSummaries called with query:', JSON.stringify(query, null, 2));
    console.log('🚀 paymentStatus:', query.paymentStatus, 'fulfillmentStatus:', query.fulfillmentStatus);

    // Test with a simple find to check relations
    const testOrder = await this.salesOrderRepository.findOne({
      where: { orderNumber: 'SO-000001' },
      relations: ['invoices', 'customer', 'items']
    });
    console.log('🧪 Test order with relations:', JSON.stringify(testOrder, null, 2));
    const {
      search,
      customerId,
      fromDate,
      toDate,
      paymentStatus,
      fulfillmentStatus,
      sortBy = 'orderNumber',
      sortOrder = 'ASC',
      page = 1,
      limit = 20,
    } = query;

    // Build find options with filters
    const where: any = { deletedAt: null };

    if (customerId) {
      where.customerId = customerId;
    }

    if (fromDate) {
      where.orderDate = { ...where.orderDate, ...{ $gte: new Date(fromDate) } };
    }

    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      where.orderDate = { ...where.orderDate, ...{ $lte: endDate } };
    }

    // Try simple repository approach with relations
    let findOptions: any = {
      relations: ['customer', 'items', 'invoices'],
      where: { deletedAt: null },
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit
    };

    // Apply filters to where clause
    if (customerId) {
      findOptions.where.customerId = customerId;
    }

    if (fromDate) {
      findOptions.where.orderDate = { ...findOptions.where.orderDate, $gte: new Date(fromDate) };
    }

    if (toDate) {
      const endDate = new Date(toDate);
      endDate.setHours(23, 59, 59, 999);
      findOptions.where.orderDate = { ...findOptions.where.orderDate, $lte: endDate };
    }

    // For complex filters like search, payment status, etc., we'll need to fall back to QueryBuilder
    // But for now, let's test the simple case first
    const total = await this.salesOrderRepository.count({ where: findOptions.where });
    const orders = await this.salesOrderRepository.find(findOptions);

    const data = orders.map(order => {
      const paidAmount = Number(order.paidAmount || 0);
      const totalAmount = Number(order.totalAmount);
      const balanceDue = Math.max(0, totalAmount - paidAmount);
      const isPaidInFull = paidAmount >= totalAmount;

      console.log(`Order ${order.orderNumber}: totalAmount=${totalAmount}, paidAmount=${paidAmount}, balanceDue=${balanceDue}, isPaidInFull=${isPaidInFull}`);

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        orderDate: order.orderDate,
        totalAmount: totalAmount,
        paidAmount: paidAmount,
        balanceDue: balanceDue,
        isPaidInFull: isPaidInFull,
        isFulfilled: order.isFulfilled || false,
        fulfilledDate: order.fulfilledDate,
        canFulfill: isPaidInFull && !order.isFulfilled,
        canUnfulfill: order.isFulfilled || false,
        customerId: order.customerId,
        customer: order.customer ? {
          id: order.customer.id,
          name: order.customer.name
        } : null,
        customerName: order.customer?.name || 'Unknown Customer',
        items: order.items || [],
        itemsCount: order.items?.length || 0,
        invoices: order.invoices?.map(invoice => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          invoiceDate: invoice.invoiceDate,
          totalAmount: Number(invoice.totalAmount),
          paidAmount: Number(invoice.paidAmount),
        })) || [],
        isOverdue: false, // Placeholder since no requiredDate property exists
        notes: order.notes, // Include notes field in summary response
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDashboardStats() {
    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisWeek = new Date(today.setDate(today.getDate() - today.getDay()));

    const [
      totalOrders,
      pendingOrders,
      shippedOrders,
      overdueOrders,
      thisMonthOrders,
      thisWeekOrders,
    ] = await Promise.all([
      this.salesOrderRepository.count(),
      this.salesOrderRepository.count({ where: { status: SalesOrderStatus.PENDING } }),
      this.salesOrderRepository.count({ where: { status: SalesOrderStatus.SHIPPED } }),
      this.salesOrderRepository
        .createQueryBuilder('order')
        .where('order.orderDate < :thirtyDaysAgo', { thirtyDaysAgo: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) })
        .andWhere('order.status NOT IN (:...completedStatuses)', {
          completedStatuses: [SalesOrderStatus.DELIVERED, SalesOrderStatus.COMPLETED, SalesOrderStatus.CANCELLED],
        })
        .getCount(),
      this.salesOrderRepository.count({ where: { orderDate: MoreThanOrEqual(thisMonth) } }),
      this.salesOrderRepository.count({ where: { orderDate: MoreThanOrEqual(thisWeek) } }),
    ]);

    const totalSalesResult = await this.salesOrderRepository
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.totalAmount), 0)', 'total')
      .where('order.status != :cancelled', { cancelled: SalesOrderStatus.CANCELLED })
      .getRawOne();

    const thisMonthSalesResult = await this.salesOrderRepository
      .createQueryBuilder('order')
      .select('COALESCE(SUM(order.totalAmount), 0)', 'total')
      .where('order.orderDate >= :startDate', { startDate: thisMonth })
      .andWhere('order.status != :cancelled', { cancelled: SalesOrderStatus.CANCELLED })
      .getRawOne();

    return {
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        shipped: shippedOrders,
        overdue: overdueOrders,
        thisMonth: thisMonthOrders,
        thisWeek: thisWeekOrders,
      },
      sales: {
        total: parseFloat(totalSalesResult.total) || 0,
        thisMonth: parseFloat(thisMonthSalesResult.total) || 0,
      },
    };
  }

  async findById(id: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'createdByUser', 'items', 'items.product', 'invoices'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    return this.mapToResponseDto(order);
  }

  async findByOrderNumber(orderNumber: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { orderNumber },
      relations: ['customer', 'createdByUser', 'items', 'items.product', 'invoices'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    return this.mapToResponseDto(order);
  }

  async update(id: string, updateSalesOrderDto: UpdateSalesOrderDto): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { id }
    });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    // Check if order can be updated
    if ([SalesOrderStatus.SHIPPED, SalesOrderStatus.DELIVERED, SalesOrderStatus.COMPLETED, SalesOrderStatus.CANCELLED].includes(order.status)) {
      throw new ConflictException('Cannot update order in current status');
    }

    const { items, customerId, notes } = updateSalesOrderDto;

    // Prepare update data for the sales order
    const updateData: any = {};

    // Update customer if provided
    if (customerId) {
      const customer = await this.customerRepository.findOne({ where: { id: customerId } });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      updateData.customerId = customerId;
    }

    // Update notes if provided (including empty string to clear notes)
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    // Update items if provided
    if (items && items.length > 0) {
      // Delete existing items from database
      await this.salesOrderItemRepository.delete({ salesOrderId: id });

      // Validate and process new items
      const orderItems = await this.validateAndProcessItems(items);

      const totalAmount = orderItems.reduce((sum, item) => sum + Number(item.totalAmount), 0);

      // Create new order items using direct object creation to avoid entity relations issues
      for (const itemData of orderItems) {
        // Validate that order.id exists
        if (!order.id) {
          throw new Error(`Cannot create order items: order.id is ${order.id}`);
        }

        // Use direct repository insert instead of create/save to bypass entity hooks
        await this.salesOrderItemRepository.insert({
          lineNumber: itemData.lineNumber || 1,
          productId: itemData.productId,
          productSku: itemData.productSku || 'N/A',
          productName: itemData.productName || 'Unknown Product',
          productDescription: itemData.productDescription || '',
          unit: itemData.unit || 'pcs',
          quantity: itemData.quantity || 1,
          unitPrice: itemData.unitPrice || 0,
          unitCost: itemData.unitCost || 0,
          discountType: itemData.discountType || DiscountType.PERCENTAGE,
          discountPercent: itemData.discountPercent || 0,
          discountAmount: itemData.discountAmount || 0,
          totalAmount: itemData.totalAmount || 0,
          notes: itemData.notes || null,
          salesOrderId: order.id, // Direct database insert ensures this is set
        });
      }

      // Add total amount to update data
      updateData.totalAmount = totalAmount;
    }

    // Perform all updates in a single database call
    if (Object.keys(updateData).length > 0) {
      await this.salesOrderRepository.update(id, updateData);
    }

    return this.findById(id);
  }

  async delete(id: string): Promise<{ deletedOrderNumber: string; previousOrder: SalesOrderResponseDto | null }> {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    // Allow deletion of orders that haven't been shipped yet
    if ([SalesOrderStatus.SHIPPED, SalesOrderStatus.DELIVERED, SalesOrderStatus.COMPLETED].includes(order.status)) {
      throw new ConflictException('Cannot delete order that has been shipped, delivered, or completed');
    }

    // Find previous order details before deletion
    const previousOrder = await this.findPreviousOrder(order.orderNumber);

    // Release reserved inventory
    await this.inventoryIntegrationService.releaseReservation(id);

    // Soft delete using TypeORM's built-in soft delete
    await this.salesOrderRepository.softDelete(id);

    return {
      deletedOrderNumber: order.orderNumber,
      previousOrder
    };
  }

  async confirmOrder(id: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({ 
      where: { id },
      relations: ['customer', 'items'],
    });
    
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.status !== SalesOrderStatus.DRAFT && order.status !== SalesOrderStatus.PENDING) {
      throw new ConflictException('Cannot confirm order in current status');
    }

    // Update customer metrics
    const customer = await this.customerRepository.findOne({ where: { id: order.customerId } });
    if (customer) {
      // Update sales metrics (assuming these properties exist)
      customer.totalSales = Number(customer.totalSales || 0) + Number(order.totalAmount);
      customer.totalOrders = (customer.totalOrders || 0) + 1;
      await this.customerRepository.save(customer);
    }

    order.status = SalesOrderStatus.CONFIRMED;
    const savedOrder = await this.salesOrderRepository.save(order);
    
    return this.findById(savedOrder.id);
  }

  async shipOrder(id: string, shipOrderDto: ShipOrderDto): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (!order.canShip()) {
      throw new ConflictException('Cannot ship order in current status');
    }

    order.markAsShipped(shipOrderDto.trackingNumber);
    if (shipOrderDto.shippingMethod) {
      order.shippingMethod = shipOrderDto.shippingMethod;
    }
    if (shipOrderDto.notes) {
      order.internalNotes = `${order.internalNotes || ''}\nShipping: ${shipOrderDto.notes}`;
    }

    // Reduce actual inventory
    await this.inventoryIntegrationService.fulfillOrder(id);

    const savedOrder = await this.salesOrderRepository.save(order);
    return this.findById(savedOrder.id);
  }

  async deliverOrder(id: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.status !== SalesOrderStatus.SHIPPED) {
      throw new ConflictException('Cannot deliver order in current status');
    }

    order.markAsDelivered();
    const savedOrder = await this.salesOrderRepository.save(order);
    return this.findById(savedOrder.id);
  }

  async completeOrder(id: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.status !== SalesOrderStatus.DELIVERED) {
      throw new ConflictException('Cannot complete order in current status');
    }

    order.status = SalesOrderStatus.COMPLETED;
    const savedOrder = await this.salesOrderRepository.save(order);
    return this.findById(savedOrder.id);
  }

  async cancelOrder(id: string, reason: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({ 
      where: { id },
      relations: ['customer'],
    });
    
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (!order.canCancel()) {
      throw new ConflictException('Cannot cancel order in current status');
    }

    // Revert customer balance if order was confirmed
    if (order.status === SalesOrderStatus.CONFIRMED || order.status === SalesOrderStatus.PROCESSING) {
      const customer = order.customer;
      if (customer) {
        // Update customer metrics (assuming these methods exist in Customer entity)
        customer.totalSales = Math.max(0, Number(customer.totalSales) - Number(order.totalAmount));
        customer.totalOrders = Math.max(0, customer.totalOrders - 1);
        await this.customerRepository.save(customer);
      }
    }

    // Release reserved inventory
    await this.inventoryIntegrationService.releaseReservation(id);

    order.status = SalesOrderStatus.CANCELLED;
    order.internalNotes = `${order.internalNotes || ''}\nCancellation reason: ${reason}`;
    const savedOrder = await this.salesOrderRepository.save(order);
    return this.findById(savedOrder.id);
  }

  async duplicateOrder(id: string, userId: string): Promise<SalesOrderResponseDto> {
    const originalOrder = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!originalOrder) {
      throw new NotFoundException('Sales order not found');
    }

    const duplicateData: CreateSalesOrderDto = {
      customerId: originalOrder.customerId,
      shippingAddress: originalOrder.shippingAddress,
      shippingCity: originalOrder.shippingCity,
      shippingState: originalOrder.shippingState,
      shippingPostalCode: originalOrder.shippingPostalCode,
      shippingCountry: originalOrder.shippingCountry,
      shippingMethod: originalOrder.shippingMethod,
      notes: originalOrder.notes,
      items: originalOrder.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discountPercent: Number(item.discountPercent),
        notes: item.notes,
      })),
    };

    return this.create(duplicateData, userId);
  }

  async getFulfillmentStatus(id: string) {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    const inventoryStatus = await this.inventoryIntegrationService.getOrderFulfillmentStatus(id);

    return {
      orderId: id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalItems: order.items?.length || 0,
      inventory: inventoryStatus,
      canShip: order.canShip(),
      isShippable: order.isShippable,
    };
  }

  async findOrdersByCustomer(customerId: string, limit: number = 10) {
    const orders = await this.salesOrderRepository.find({
      where: { customerId },
      relations: ['items'],
      order: { orderDate: 'DESC' },
      take: limit,
    });

    return orders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      orderDate: order.orderDate,
      totalAmount: Number(order.totalAmount),
      itemsCount: order.items?.length || 0,
    }));
  }

  async getOrderInvoices(id: string) {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    const invoices = await this.invoiceRepository.find({
      where: { salesOrderId: id },
      order: { invoiceDate: 'DESC' },
    });

    return {
      orderId: id,
      orderNumber: order.orderNumber,
      invoices: invoices.map(invoice => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount: Number(invoice.totalAmount),
        paidAmount: Number(invoice.paidAmount),
        balanceDue: Number(invoice.balanceDue),
      })),
    };
  }

  async createInvoiceFromOrder(id: string) {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.status !== SalesOrderStatus.CONFIRMED && order.status !== SalesOrderStatus.PROCESSING) {
      throw new ConflictException('Cannot create invoice for order in current status');
    }

    // Create invoice using the Invoice service (would need to inject)
    const invoiceData = Invoice.fromSalesOrder(order);
    const invoice = this.invoiceRepository.create(invoiceData);
    
    // Add line items from order
    invoice.lineItems = order.items.map(item => ({
      productId: item.productId,
      productName: item.product?.name || 'Unknown Product',
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discountAmount),
      totalAmount: Number(item.totalAmount),
    }));

    const savedInvoice = await this.invoiceRepository.save(invoice);

    return {
      invoiceId: savedInvoice.id,
      invoiceNumber: savedInvoice.invoiceNumber,
      orderId: id,
      orderNumber: order.orderNumber,
    };
  }

  // Helper methods

  private async validateAndProcessItems(items: any[]) {
    const processedItems = [];
    let lineNumber = 1;

    for (const item of items) {
      const product = await this.productRepository.findOne({ where: { id: item.productId } });
      if (!product) {
        throw new NotFoundException(`Product with ID ${item.productId} not found`);
      }

      const unitPrice = Number(item.unitPrice) || Number(product.retailPrice) || 0;
      const discountPercent = Number(item.discountPercent) || 0;

      // Calculate discount amount based on discount type
      let discountAmount = 0;
      if (item.discountType === DiscountType.PERCENTAGE && discountPercent > 0) {
        discountAmount = (unitPrice * item.quantity * discountPercent) / 100;
      } else if (item.discountType === DiscountType.AMOUNT && item.discountAmount > 0) {
        discountAmount = Math.min(Number(item.discountAmount), unitPrice * item.quantity);
      }

      const totalAmount = (unitPrice * item.quantity) - discountAmount;

      processedItems.push({
        lineNumber: lineNumber++,
        productId: item.productId,
        productSku: product.barcode || 'N/A',
        productName: product.name || 'Unknown Product',
        productDescription: product.description || '',
        unit: 'pcs', // Default unit since Product entity doesn't have unit field
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(unitPrice) || 0,
        unitCost: Number(product.baseCost) || 0,
        discountType: item.discountType || DiscountType.PERCENTAGE,
        discountPercent: Number(discountPercent) || 0,
        discountAmount: Number(discountAmount) || 0,
        totalAmount: Number(totalAmount) || 0,
        notes: item.notes || null,
      });
    }

    console.log('Processed items from validateAndProcessItems:', JSON.stringify(processedItems, null, 2));
    return processedItems;
  }


  async findDeleted(query: QuerySalesOrdersDto = {}): Promise<any> {
    const {
      search,
      customerId,
      sortBy = 'deletedAt',
      sortOrder = 'ASC',
      page = 1,
      limit = 20,
    } = query;

    let queryBuilder = this.salesOrderRepository
      .createQueryBuilder('order')
      .withDeleted() // Include soft-deleted records
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.items', 'items')
      .where('order.deletedAt IS NOT NULL'); // Only get soft-deleted orders

    if (customerId) {
      queryBuilder = queryBuilder.andWhere('order.customerId = :customerId', { customerId });
    }

    if (search) {
      queryBuilder = queryBuilder.andWhere(
        '(order.orderNumber ILIKE :search OR customer.name ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Add sorting
    queryBuilder = queryBuilder.orderBy(`order.${sortBy}`, sortOrder as 'ASC' | 'DESC');

    // Add pagination
    const offset = (page - 1) * limit;
    queryBuilder = queryBuilder.skip(offset).take(limit);

    const [orders, total] = await queryBuilder.getManyAndCount();

    const data = orders.map(order => this.mapToResponseDto(order));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async restore(id: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      withDeleted: true, // Include soft-deleted records
      relations: ['customer', 'items', 'items.product'],
    });

    // Use standardized validation
    ValidationUtil.validateForRestore(order, 'Sales order', id);

    // Restore the order
    await this.salesOrderRepository.restore(id);

    // Return the restored order
    const restoredOrder = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'items', 'items.product'],
    });

    return this.mapToResponseDto(restoredOrder);
  }

  async bulkRestore(ids: string[]): Promise<BulkOperationResponse> {
    if (!ids || ids.length === 0) {
      return BulkOperationUtil.createResponse('restored', 'sales order', 0, []);
    }

    const failedItems = [];
    let successCount = 0;

    for (const id of ids) {
      try {
        await this.restore(id);
        successCount++;
      } catch (error) {
        BulkOperationUtil.addFailure(
          failedItems,
          id,
          error.message,
          'RESTORE_ERROR'
        );
      }
    }

    return BulkOperationUtil.createResponse('restored', 'sales order', successCount, failedItems);
  }

  async permanentDelete(id: string): Promise<void> {
    // Find the order (including soft-deleted ones)
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'items'],
      withDeleted: true,
    });

    // Use standardized validation
    ValidationUtil.validateForPermanentDelete(order, 'Sales order', id);

    // Check for financial dependencies and business rules
    const invoiceCount = await this.invoiceRepository.count({
      where: { salesOrderId: id },
    });

    const isCompleted = [SalesOrderStatus.SHIPPED, SalesOrderStatus.DELIVERED, SalesOrderStatus.COMPLETED].includes(order.status);

    // Use standardized financial entity validation
    ValidationUtil.validateFinancialEntityDeletion('sales order', invoiceCount > 0, false, isCompleted);

    // Revert customer metrics if order was confirmed
    if (order.status === SalesOrderStatus.CONFIRMED && order.customer) {
      const customer = order.customer;
      customer.totalSales = Math.max(0, Number(customer.totalSales) - Number(order.totalAmount));
      customer.totalOrders = Math.max(0, customer.totalOrders - 1);
      await this.customerRepository.save(customer);
    }

    // Hard delete order items first (foreign key constraint)
    await this.salesOrderItemRepository.delete({ salesOrderId: id });

    // Hard delete the order from database
    await this.salesOrderRepository.delete(id);

    // Note: Audit logging removed with authentication system
  }

  async bulkPermanentDelete(
    orderIds: string[]
  ): Promise<BulkOperationResponse> {
    if (!orderIds || orderIds.length === 0) {
      return BulkOperationUtil.createResponse('permanently deleted', 'sales order', 0, []);
    }

    const failedItems = [];
    let successCount = 0;

    // Process each order individually to handle failures gracefully
    for (const id of orderIds) {
      try {
        // Find the order (including soft-deleted ones)
        const order = await this.salesOrderRepository.findOne({
          where: { id },
          relations: ['customer', 'items'],
          withDeleted: true,
        });

        // Use standardized validation
        try {
          ValidationUtil.validateForPermanentDelete(order, 'Sales order', id);
        } catch (error) {
          BulkOperationUtil.addFailure(
            failedItems,
            id,
            error.message,
            'VALIDATION_ERROR'
          );
          continue;
        }

        // Check for financial dependencies and business rules
        const invoiceCount = await this.invoiceRepository.count({
          where: { salesOrderId: id },
        });

        const isCompleted = [SalesOrderStatus.SHIPPED, SalesOrderStatus.DELIVERED, SalesOrderStatus.COMPLETED].includes(order.status);

        // Use standardized financial entity validation
        try {
          ValidationUtil.validateFinancialEntityDeletion('sales order', invoiceCount > 0, false, isCompleted);
        } catch (error) {
          BulkOperationUtil.addFailure(
            failedItems,
            id,
            error.message,
            'BUSINESS_RULE_ERROR'
          );
          continue;
        }

        // Revert customer metrics if order was confirmed
        if (order.status === SalesOrderStatus.CONFIRMED && order.customer) {
          const customer = order.customer;
          customer.totalSales = Math.max(0, Number(customer.totalSales) - Number(order.totalAmount));
          customer.totalOrders = Math.max(0, customer.totalOrders - 1);
          await this.customerRepository.save(customer);
        }

        // Hard delete order items first
        await this.salesOrderItemRepository.delete({ salesOrderId: id });

        // Hard delete the order
        await this.salesOrderRepository.delete(id);

        successCount++;
      } catch (error) {
        BulkOperationUtil.addFailure(
          failedItems,
          id,
          error.message,
          'UNEXPECTED_ERROR'
        );
      }
    }

    return BulkOperationUtil.createResponse('permanently deleted', 'sales order', successCount, failedItems);
  }

  async recordPayment(id: string, amount: number): Promise<SalesOrderResponseDto> {
    if (amount < 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'createdByUser', 'items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.isFulfilled) {
      throw new ConflictException('Cannot modify payment for fulfilled order');
    }

    order.paidAmount = Number(amount);
    const savedOrder = await this.salesOrderRepository.save(order);

    // Automatically generate payment record
    try {
      const Payment = (await import('../../../database/entities/payment.entity')).Payment;
      const PaymentMethod = (await import('../../../database/entities/payment.entity')).PaymentMethod;
      const PaymentStatus = (await import('../../../database/entities/payment.entity')).PaymentStatus;
      const PaymentType = (await import('../../../database/entities/payment.entity')).PaymentType;

      // Get or create a user repository import
      const paymentRepository = this.salesOrderRepository.manager.getRepository(Payment);

      // Generate payment number
      const allPayments = await paymentRepository.find({ select: ['paymentNumber'] });
      let maxNumber = 0;
      for (const payment of allPayments) {
        const match = payment.paymentNumber.match(/^PAY-(\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxNumber) maxNumber = num;
        }
      }
      const paymentNumber = `PAY-${(maxNumber + 1).toString().padStart(6, '0')}`;

      // Create payment record with sales order details
      const payment = paymentRepository.create({
        paymentNumber,
        type: PaymentType.PAYMENT,
        status: PaymentStatus.COMPLETED,
        paymentMethod: PaymentMethod.CASH, // Default method, can be changed later
        paymentDate: new Date(),
        amount: Number(amount),
        customerId: order.customerId,
        invoiceId: null, // Not linked to invoice, just to sales order
        recordedByUserId: order.createdByUserId || null,
        currency: 'USD',
        exchangeRate: 1.0,
        processingFee: 0,
        notes: `Payment recorded for sales order ${order.orderNumber}`,
        clearedDate: new Date(),
      });

      await paymentRepository.save(payment);
      console.log(`✅ Auto-generated payment ${payment.paymentNumber} for sales order ${order.orderNumber}`);
    } catch (error) {
      console.error(`⚠️ Failed to auto-generate payment for order ${order.orderNumber}:`, error.message);
      // Don't throw error - payment recording on order should still succeed
    }

    return this.mapToResponseDto(savedOrder);
  }

  async unpayOrder(id: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'createdByUser', 'items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.isFulfilled) {
      throw new ConflictException('Cannot unpay fulfilled order - order has already been fulfilled');
    }

    // Delete associated payment record(s) from database
    try {
      const Payment = (await import('../../../database/entities/payment.entity')).Payment;
      const paymentRepository = this.salesOrderRepository.manager.getRepository(Payment);

      // Find and delete all payments associated with this sales order
      // Match by notes field which contains "sales order {orderNumber}"
      const associatedPayments = await paymentRepository.find({
        where: {
          customerId: order.customerId,
          notes: ILike(`%sales order ${order.orderNumber}%`)
        }
      });

      if (associatedPayments.length > 0) {
        // Hard delete the payment records from database
        await paymentRepository.delete(associatedPayments.map(p => p.id));
        console.log(`✅ Deleted ${associatedPayments.length} payment record(s) for sales order ${order.orderNumber}`);
      }
    } catch (error) {
      console.error(`⚠️ Failed to delete payment records for order ${order.orderNumber}:`, error.message);
      // Don't throw error - unpay should still succeed even if payment deletion fails
    }

    order.paidAmount = 0;
    const savedOrder = await this.salesOrderRepository.save(order);

    return this.mapToResponseDto(savedOrder);
  }

  async fulfillOrder(id: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'createdByUser', 'items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (order.isFulfilled) {
      throw new ConflictException('Order is already fulfilled');
    }

    if (!order.isPaidInFull) {
      throw new ConflictException(
        `Cannot fulfill order. Payment required: ${order.balanceDue}. Received: ${order.paidAmount}`
      );
    }

    // Deduct inventory for each item
    for (const item of order.items) {
      if (item.product) {
        await this.inventoryIntegrationService.adjustStock(
          item.productId,
          -item.quantity,
          `Sales order fulfillment: ${order.orderNumber}`
        );
      }
    }

    // Mark as fulfilled and completed
    order.isFulfilled = true;
    order.fulfilledDate = new Date();
    order.status = SalesOrderStatus.COMPLETED;

    const savedOrder = await this.salesOrderRepository.save(order);

    // Automatically generate invoice upon fulfillment
    try {
      // Check if invoice already exists for this order
      const existingInvoice = await this.invoiceRepository.findOne({
        where: { salesOrderId: order.id }
      });

      if (!existingInvoice) {
        // Generate invoice number
        const invoiceNumber = await this.generateInvoiceNumber();

        // Create invoice using the fromSalesOrder factory method
        const invoiceData = Invoice.fromSalesOrder(savedOrder);
        const invoice = this.invoiceRepository.create({
          ...invoiceData,
          invoiceNumber,
        });

        // Add line items from order
        invoice.lineItems = savedOrder.items.map(item => ({
          productId: item.productId,
          productName: item.product?.name || 'Unknown Product',
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discountAmount),
          totalAmount: Number(item.totalAmount),
        }));

        // Calculate totals and set correct status
        invoice.calculateTotals();
        invoice.updateStatus();

        // Debug logging
        console.log(`💰 Invoice payment info - Total: ${invoice.totalAmount}, Paid: ${invoice.paidAmount}, Balance: ${invoice.balanceDue}, Status: ${invoice.status}`);

        await this.invoiceRepository.save(invoice);

        console.log(`✅ Auto-generated invoice ${invoice.invoiceNumber} for fulfilled order ${savedOrder.orderNumber}`);
      }
    } catch (error) {
      console.error(`⚠️ Failed to auto-generate invoice for order ${savedOrder.orderNumber}:`, error.message);
      // Don't throw error - fulfillment should still succeed even if invoice creation fails
    }

    return this.findById(savedOrder.id);
  }

  async unfulfillOrder(id: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'createdByUser', 'items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (!order.isFulfilled) {
      throw new ConflictException('Order is not fulfilled');
    }

    // Add inventory back for each item
    for (const item of order.items) {
      if (item.product) {
        await this.inventoryIntegrationService.adjustStock(
          item.productId,
          item.quantity,
          `Sales order unfulfillment: ${order.orderNumber}`
        );
      }
    }

    // Automatically delete associated invoice(s) when unfulfilling
    try {
      const associatedInvoices = await this.invoiceRepository.find({
        where: { salesOrderId: order.id }
      });

      if (associatedInvoices.length > 0) {
        // Hard delete the invoices to completely remove them
        await this.invoiceRepository.delete({ salesOrderId: order.id });

        console.log(`✅ Auto-deleted ${associatedInvoices.length} invoice(s) for unfulfilled order ${order.orderNumber}`);
      }
    } catch (error) {
      console.error(`⚠️ Failed to auto-delete invoices for order ${order.orderNumber}:`, error.message);
      // Don't throw error - unfulfillment should still succeed even if invoice deletion fails
    }

    // Mark as unfulfilled and revert to confirmed status
    order.isFulfilled = false;
    order.fulfilledDate = null;
    order.status = SalesOrderStatus.CONFIRMED;

    const savedOrder = await this.salesOrderRepository.save(order);

    return this.findById(savedOrder.id);
  }

  private mapToResponseDto(order: SalesOrder): SalesOrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      shippedDate: order.shippedDate,
      deliveredDate: order.deliveredDate,
      fulfilledDate: order.fulfilledDate,
      totalAmount: Number(order.totalAmount),
      paidAmount: Number(order.paidAmount),
      isFulfilled: order.isFulfilled,
      isPaidInFull: order.isPaidInFull,
      balanceDue: order.balanceDue,
      canFulfill: order.canFulfill,
      canUnfulfill: order.canUnfulfill,
      shippingAddress: order.shippingAddress,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingPostalCode: order.shippingPostalCode,
      shippingCountry: order.shippingCountry,
      shippingMethod: order.shippingMethod,
      trackingNumber: order.trackingNumber,
      customerPoNumber: order.customerPoNumber,
      notes: order.notes,
      internalNotes: order.internalNotes,
      customerId: order.customerId,
      createdByUserId: order.createdByUserId,
      customer: order.customer ? {
        id: order.customer.id,
        customerCode: order.customer.customerCode,
        name: order.customer.name,
        phone: order.customer.phone,
      } : undefined,
      createdByUser: order.createdByUser ? {
        id: order.createdByUser.id,
        username: order.createdByUser.username,
        firstName: order.createdByUser.firstName,
        lastName: order.createdByUser.lastName,
      } : undefined,
      items: order.items?.map(item => ({
        id: item.id,
        productId: item.productId,
        productSku: item.product?.barcode || 'N/A',
        productName: item.product?.name || 'Unknown Product',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discountType: item.discountType || DiscountType.PERCENTAGE,
        discountPercent: Number(item.discountPercent || 0),
        discountAmount: Number(item.discountAmount || 0),
        totalAmount: Number(item.totalAmount),
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })) || [],
      invoices: order.invoices?.map(invoice => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        invoiceDate: invoice.invoiceDate,
        totalAmount: Number(invoice.totalAmount),
        paidAmount: Number(invoice.paidAmount),
      })) || [],
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      fullShippingAddress: order.fullShippingAddress,
      isShippable: order.isShippable,
      isCompleted: order.isCompleted,
    };
  }
}