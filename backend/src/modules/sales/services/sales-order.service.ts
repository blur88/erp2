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
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
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

    // Check credit limit
    const creditCheck = await this.customerService.checkCredit(customerId, totalAmount);
    if (!creditCheck.approved) {
      throw new ConflictException(`Credit limit exceeded: ${creditCheck.message}`);
    }

    // Check inventory availability
    const inventoryCheck = await this.inventoryIntegrationService.checkAvailability(
      items.map(item => ({ productId: item.productId, quantity: item.quantity }))
    );
    
    if (!inventoryCheck.available) {
      throw new ConflictException(`Insufficient inventory: ${inventoryCheck.message}`);
    }

    // Create sales order
    const salesOrder = this.salesOrderRepository.create({
      ...orderData,
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

  async findSummaries(): Promise<SalesOrderSummaryDto[]> {
    const orders = await this.salesOrderRepository.find({
      relations: ['customer', 'items'],
      order: { orderDate: 'DESC' },
      take: 100, // Limit to recent orders
    });

    return orders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      orderDate: order.orderDate,
      customerName: order.customer?.name || 'Unknown',
      totalAmount: Number(order.totalAmount),
      isOverdue: order.isOverdue,
      itemsCount: order.items?.length || 0,
    }));
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
        .where('order.requiredDate < :today', { today: new Date() })
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

    if (![SalesOrderStatus.DRAFT, SalesOrderStatus.PENDING].includes(order.status)) {
      throw new ConflictException('Cannot delete order in current status');
    }

    // Release reserved inventory
    await this.inventoryIntegrationService.releaseReservation(id);

    // Soft delete by setting status to cancelled
    order.status = SalesOrderStatus.CANCELLED;
    order.internalNotes = `${order.internalNotes || ''}\nDeleted on ${new Date().toISOString()}`;
    
    await this.salesOrderRepository.save(order);
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

    // Final credit check
    const creditCheck = await this.customerService.checkCredit(order.customerId, Number(order.totalAmount));
    if (!creditCheck.approved) {
      throw new ConflictException(`Credit limit exceeded: ${creditCheck.message}`);
    }

    // Update customer balance
    const customer = await this.customerRepository.findOne({ where: { id: order.customerId } });
    if (customer) {
      customer.updateBalance(Number(order.totalAmount), 'increase');
      customer.updateSalesMetrics(Number(order.totalAmount));
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

    order.complete();
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
    if (order.status === SalesOrderStatus.CONFIRMED || order.status === SalesOrderStatus.IN_PROGRESS) {
      const customer = order.customer;
      if (customer) {
        customer.updateBalance(Number(order.totalAmount), 'decrease');
        customer.totalSales = Math.max(0, Number(customer.totalSales) - Number(order.totalAmount));
        customer.totalOrders = Math.max(0, customer.totalOrders - 1);
        await this.customerRepository.save(customer);
      }
    }

    // Release reserved inventory
    await this.inventoryIntegrationService.releaseReservation(id);

    order.cancel(reason);
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
      isOverdue: order.isOverdue,
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
      isOverdue: order.isOverdue,
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

    if (order.status !== SalesOrderStatus.CONFIRMED && order.status !== SalesOrderStatus.IN_PROGRESS) {
      throw new ConflictException('Cannot create invoice for order in current status');
    }

    // Create invoice using the Invoice service (would need to inject)
    const invoiceData = Invoice.fromSalesOrder(order);
    const invoice = this.invoiceRepository.create(invoiceData);
    
    // Add line items from order
    invoice.lineItems = order.items.map(item => ({
      productSku: item.product?.sku || 'N/A',
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
        unit: product.unit || 'pcs',
        quantity: item.quantity,
        unitPrice,
        unitCost: Number(product.baseCost) || 0,
        discountType: item.discountType || 'percentage',
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

  private mapToResponseDto(order: SalesOrder): SalesOrderResponseDto {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      priority: order.priority,
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
        email: order.customer.email,
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
        productSku: item.product?.sku || 'N/A',
        productName: item.product?.name || 'Unknown Product',
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discountPercent: Number(item.discountPercent),
        discountAmount: Number(item.discountAmount),
        totalAmount: Number(item.totalAmount),
        notes: item.notes,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })) || [],
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      fullShippingAddress: order.fullShippingAddress,
      isOverdue: order.isOverdue,
      isShippable: order.isShippable,
      isCompleted: order.isCompleted,
    };
  }
}