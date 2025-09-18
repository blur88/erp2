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

  async create(createSalesOrderDto: CreateSalesOrderDto, userId: string | null): Promise<SalesOrderResponseDto> {
    const { customerId, items, ...orderData } = createSalesOrderDto;

    // Verify customer exists and can purchase
    const customer = await this.customerRepository.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Check customer status
    if (!customer.isActive || customer.status === 'suspended' || customer.status === 'blacklisted') {
      throw new ConflictException('Customer is not active or is suspended/blacklisted');
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
      sortBy = 'orderDate',
      sortOrder = 'DESC',
      page = 1,
      limit = 20,
    } = query;

    // Use QueryBuilder to avoid metadata issues
    let queryBuilder = this.salesOrderRepository
      .createQueryBuilder('order')
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

  async findSummaries(query: QuerySalesOrdersDto = {}): Promise<any> {
    const {
      search,
      customerId,
      fromDate,
      toDate,
      sortBy = 'orderDate',
      sortOrder = 'DESC',
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

    // Use QueryBuilder for complex filtering
    let queryBuilder = this.salesOrderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.items', 'items')
      .where('order.deletedAt IS NULL');

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
      queryBuilder = queryBuilder.andWhere(
        '(order.orderNumber ILIKE :search OR customer.name ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    // Get total count first
    const total = await queryBuilder.getCount();

    // Apply pagination and sorting
    queryBuilder = queryBuilder
      .orderBy(`order.${sortBy}`, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const orders = await queryBuilder.getMany();

    const data = orders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      orderDate: order.orderDate,
      totalAmount: Number(order.totalAmount),
      customerId: order.customerId,
      customer: order.customer ? {
        id: order.customer.id,
        name: order.customer.name
      } : null,
      customerName: order.customer?.name || 'Unknown Customer',
      items: order.items || [],
      itemsCount: order.items?.length || 0,
      isOverdue: false, // Placeholder since no requiredDate property exists
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    }));

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
      relations: ['customer', 'createdByUser', 'items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    return this.mapToResponseDto(order);
  }

  async findByOrderNumber(orderNumber: string): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({
      where: { orderNumber },
      relations: ['customer', 'createdByUser', 'items', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    return this.mapToResponseDto(order);
  }

  async update(id: string, updateSalesOrderDto: UpdateSalesOrderDto): Promise<SalesOrderResponseDto> {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    // Check if order can be updated
    if ([SalesOrderStatus.SHIPPED, SalesOrderStatus.DELIVERED, SalesOrderStatus.COMPLETED, SalesOrderStatus.CANCELLED].includes(order.status)) {
      throw new ConflictException('Cannot update order in current status');
    }

    Object.assign(order, updateSalesOrderDto);

    // Recalculate totals if items changed
    await this.recalculateOrderTotals(order);

    const savedOrder = await this.salesOrderRepository.save(order);
    return this.findById(savedOrder.id);
  }

  async delete(id: string): Promise<void> {
    const order = await this.salesOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    // Allow deletion of orders that haven't been shipped yet
    if ([SalesOrderStatus.SHIPPED, SalesOrderStatus.DELIVERED, SalesOrderStatus.COMPLETED].includes(order.status)) {
      throw new ConflictException('Cannot delete order that has been shipped, delivered, or completed');
    }

    // Release reserved inventory
    await this.inventoryIntegrationService.releaseReservation(id);

    // Soft delete using TypeORM's built-in soft delete
    await this.salesOrderRepository.softDelete(id);
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
      relations: ['customer', 'items'],
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
      productSku: item.product?.barcode || 'N/A',
      productName: item.product?.name || 'Unknown Product',
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
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

      const unitPrice = item.unitPrice || Number(product.retailPrice);
      const discountPercent = item.discountPercent || 0;
      const discountAmount = item.discountAmount || (unitPrice * item.quantity * discountPercent) / 100;
      const totalAmount = (unitPrice * item.quantity) - discountAmount;

      processedItems.push({
        lineNumber: lineNumber++,
        productId: item.productId,
        productSku: product.barcode || 'N/A',
        productName: product.name,
        productDescription: product.description,
        unit: 'pcs', // Default unit since Product entity doesn't have unit field
        quantity: item.quantity,
        unitPrice,
        unitCost: Number(product.baseCost) || 0,
        discountType: item.discountType || DiscountType.PERCENTAGE,
        discountPercent,
        discountAmount,
        totalAmount,
        notes: item.notes,
      });
    }

    console.log('Processed items from validateAndProcessItems:', JSON.stringify(processedItems, null, 2));
    return processedItems;
  }

  private async recalculateOrderTotals(order: SalesOrder): Promise<void> {
    // Load items if not already loaded
    if (!order.items) {
      order.items = await this.salesOrderItemRepository.find({
        where: { salesOrderId: order.id },
      });
    }

    order.calculateTotals();
  }

  async findDeleted(query: QuerySalesOrdersDto = {}): Promise<any> {
    const {
      search,
      customerId,
      sortBy = 'deletedAt',
      sortOrder = 'DESC',
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

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    if (!order.deletedAt) {
      throw new ConflictException('Sales order is not deleted');
    }

    // Restore the order
    await this.salesOrderRepository.restore(id);

    // Return the restored order
    const restoredOrder = await this.salesOrderRepository.findOne({
      where: { id },
      relations: ['customer', 'items', 'items.product'],
    });

    return this.mapToResponseDto(restoredOrder);
  }

  async bulkRestore(ids: string[]): Promise<{ restoredCount: number; failedIds: string[] }> {
    const failedIds: string[] = [];
    let restoredCount = 0;

    for (const id of ids) {
      try {
        await this.restore(id);
        restoredCount++;
      } catch (error) {
        failedIds.push(id);
      }
    }

    return { restoredCount, failedIds };
  }

  private mapToResponseDto(order: SalesOrder): SalesOrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      shippedDate: order.shippedDate,
      deliveredDate: order.deliveredDate,
      totalAmount: Number(order.totalAmount),
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
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      fullShippingAddress: order.fullShippingAddress,
      isShippable: order.isShippable,
      isCompleted: order.isCompleted,
    };
  }
}