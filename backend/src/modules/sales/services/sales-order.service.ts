import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem, DiscountType } from '../../../database/entities/sales-order-item.entity';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Product } from '../../../database/entities/product.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { InvoiceItem } from '../../../database/entities/invoice-item.entity';
import { User } from '../../../database/entities/user.entity';
import { PriceListItem } from '../../../database/entities/price-list-item.entity';
import {
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
  QuerySalesOrdersDto,
  SalesOrderResponseDto,
  RecordPaymentDto,
  RecordRefundDto,
} from '../dto/sales-order.dto';
import { GlobalSearchResultDto } from '../../search/dto/global-search-result.dto';
import { canSearchSalesOrders } from '../../search/search.permissions';
import {
  SEARCH_CANDIDATE_LIMIT,
  SCORE_EXACT_CODE,
  SCORE_STARTSWITH_CODE,
  SCORE_CONTAINS,
  SCORE_FUZZY,
  BOOST_TRANSACTION,
  BOOST_EXACT_MATCH,
} from '../../search/search.constants';
import { CustomerService } from './customer.service';
import { InventoryIntegrationService } from './inventory-integration.service';
import { ValidationUtil, BulkOperationUtil, BulkOperationResponse } from '../../../common/utils/validation.util';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '@modules/accounting/services/accounting.service';
import { SalesOrderFulfillmentService } from './sales-order-fulfillment.service';
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { SalesOrderPaymentService } from './sales-order-payment.service';
import { SalesOrderQueryService } from './sales-order-query.service';

@Injectable()
export class SalesOrderService extends BaseCrudService<
  SalesOrder,
  CreateSalesOrderDto,
  UpdateSalesOrderDto,
  QuerySalesOrdersDto
> {
  private readonly logger = new Logger(SalesOrderService.name);

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
    @InjectRepository(InvoiceItem)
    private readonly invoiceItemRepository: Repository<InvoiceItem>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PriceListItem)
    private readonly priceListItemRepository: Repository<PriceListItem>,
    private readonly customerService: CustomerService,
    private readonly inventoryIntegrationService: InventoryIntegrationService,
    private readonly stockMovementService: StockMovementService,
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly settingsService: SettingsService,
    auditLogService: AuditLogService,
    private readonly accountingService: AccountingService,
    private readonly salesOrderFulfillmentService: SalesOrderFulfillmentService,
    private readonly salesOrderLifecycleService: SalesOrderLifecycleService,
    private readonly salesOrderPaymentService: SalesOrderPaymentService,
    private readonly salesOrderQueryService: SalesOrderQueryService,
  ) {
    super(salesOrderRepository, auditLogService);
  }

  getEntityType(): string {
    return 'SalesOrder';
  }

  buildWhereClause(query: QuerySalesOrdersDto): FindOptionsWhere<SalesOrder> {
    const where: FindOptionsWhere<SalesOrder> = {};

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    return where;
  }

  private async generateSequentialOrderNumber(): Promise<string> {
    // Use document number settings to generate order number
    try {
      const orderNumber = await this.settingsService.generateDocumentNumber('Sales Orders');
      console.log('[generateSequentialOrderNumber] Generated order number:', orderNumber);
      return orderNumber;
    } catch (error) {
      console.error('[generateSequentialOrderNumber] Error generating order number:', error.message);
      // Fallback to legacy method if settings service fails
      const lastOrder = await this.salesOrderRepository
        .createQueryBuilder('order')
        .withDeleted()
        .select('order.orderNumber')
        .where('order.orderNumber LIKE :prefix', { prefix: 'SO-%' })
        .orderBy('order.orderNumber', 'DESC')
        .limit(1)
        .getOne();

      let nextNumber = 1;
      if (lastOrder) {
        const match = lastOrder.orderNumber.match(/^SO-(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const newOrderNumber = `SO-${nextNumber.toString().padStart(6, '0')}`;
      console.log('[generateSequentialOrderNumber] Fallback order number:', newOrderNumber);
      return newOrderNumber;
    }
  }

  private async generateInvoiceNumber(): Promise<string> {
    // Use document number settings to generate invoice number
    try {
      const invoiceNumber = await this.settingsService.generateDocumentNumber('Invoices');
      console.log('[generateInvoiceNumber] Generated invoice number:', invoiceNumber);
      return invoiceNumber;
    } catch (error) {
      console.error('[generateInvoiceNumber] Error generating invoice number:', error.message);
      // Fallback to legacy method
      const lastInvoice = await this.invoiceRepository
        .createQueryBuilder('invoice')
        .withDeleted()
        .select('invoice.invoiceNumber')
        .where('invoice.invoiceNumber LIKE :prefix', { prefix: 'INV-%' })
        .orderBy('invoice.invoiceNumber', 'DESC')
        .limit(1)
        .getOne();

      let nextNumber = 1;
      if (lastInvoice) {
        const match = lastInvoice.invoiceNumber.match(/^INV-(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }

      const newInvoiceNumber = `INV-${nextNumber.toString().padStart(6, '0')}`;
      console.log('[generateInvoiceNumber] Fallback invoice number:', newInvoiceNumber);
      return newInvoiceNumber;
    }
  }

  async create(
    createSalesOrderDto: CreateSalesOrderDto,
    userId?: string,
    username?: string,
  ): Promise<SalesOrderResponseDto> {
    const { customerId, items, ...orderData } = createSalesOrderDto;

    // Verify customer exists and can purchase
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      relations: { priceList: true }
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Check customer status
    if (!customer.isActive) {
      throw new ConflictException('Customer is not active');
    }

    // Validate and calculate order totals with customer pricing scheme
    const orderItems = await this.validateAndProcessItems(items, customer);
    const subtotal = SalesOrderService.sumItemTotals(orderItems);
    const shippingAmount = Number(createSalesOrderDto.shippingAmount || 0);
    const totalAmount = subtotal + shippingAmount;

    // Note: Credit limit check removed - customerService not available

    // Check inventory availability
    const inventoryCheck = await this.inventoryIntegrationService.checkAvailability(
      items.map(item => ({ productId: item.productId, quantity: item.quantity }))
    );

    if (!inventoryCheck.available) {
      throw new ConflictException(`Insufficient inventory: ${inventoryCheck.message}`);
    }

    // Retry logic for handling duplicate order numbers (race condition)
    let savedOrder: SalesOrder;
    let retries = 5; // Increased retries
    let lastError: any;

    while (retries > 0) {
      try {
        // Generate sequential order number with each attempt
        const orderNumber = await this.generateSequentialOrderNumber();

        // Create sales order
        const salesOrder = this.salesOrderRepository.create({
          ...orderData,
          orderNumber,
          customerId,
          orderDate: new Date(),
          subtotal,
          shippingAmount,
          totalAmount,
        });

        savedOrder = await this.salesOrderRepository.save(salesOrder);
        break; // Success - exit retry loop
      } catch (error) {
        lastError = error;
        // Check if it's a duplicate key error
        if (error.code === '23505' && error.constraint === 'UQ_ea901f7691ec7f314f072d9dee8') {
          retries--;
          if (retries === 0) {
            throw new ConflictException('Failed to generate unique order number after multiple attempts. Please try again.');
          }
          // Wait a longer random time before retrying (50-200ms) to reduce collision probability
          await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
          continue;
        }
        // If it's not a duplicate error, rethrow immediately
        throw error;
      }
    }

    // If we exhausted retries but savedOrder is not set, throw the last error
    if (!savedOrder) {
      throw lastError || new ConflictException('Failed to create sales order');
    }

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

    // Automatically generate invoice when order is created
    try {
      // Reload order with customer relation to populate customerName for invoice
      const orderWithCustomer = await this.salesOrderRepository.findOne({
        where: { id: savedOrder.id },
        relations: { customer: true, items: true }
      });

      if (!orderWithCustomer) {
        throw new Error('Order not found after save');
      }

      if (!orderWithCustomer.customer) {
        throw new Error('Customer information not found for invoice generation');
      }

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();

      // Create invoice using the fromSalesOrder factory method
      const invoiceData = Invoice.fromSalesOrder(orderWithCustomer);
      const invoice = this.invoiceRepository.create({
        ...invoiceData,
        invoiceNumber,
      });

      // lineItems removed from invoice model

      // Calculate totals and set correct status
      invoice.calculateTotals();
      invoice.updateStatus();

      await this.invoiceRepository.save(invoice);

      // Log audit trail for invoice creation
      await this.auditLogService.log(
        'CREATE',
        'Invoice',
        `Created invoice: ${invoice.invoiceNumber} for sales order ${orderWithCustomer.orderNumber}`,
          {
            entityId: invoice.id,
            userId: userId || 'system',
            username,
            newValues: {
            invoiceNumber: invoice.invoiceNumber,
            salesOrderId: orderWithCustomer.id,
            customerId: orderWithCustomer.customerId,
            totalAmount: invoice.totalAmount,
            status: invoice.status,
          },
        }
      );

      // Copy sales order items to invoice items
      if (orderWithCustomer.items && orderWithCustomer.items.length > 0) {
        const invoiceItemsData = orderWithCustomer.items.map(soItem => ({
          invoiceId: invoice.id,
          lineNumber: soItem.lineNumber,
          productId: soItem.productId,
          quantity: Number(soItem.quantity),
          unitPrice: Number(soItem.unitPrice),
          discountType: soItem.discountType,
          discountPercent: Number(soItem.discountPercent || 0),
          discount: Number(soItem.discountAmount || 0),
          totalAmount: Number(soItem.totalAmount),
        }));

        await this.invoiceItemRepository.insert(invoiceItemsData);
        console.log(`✅ Copied ${invoiceItemsData.length} items to invoice ${invoice.invoiceNumber}`);
      }

      console.log(`✅ Auto-generated invoice ${invoice.invoiceNumber} for new order ${savedOrder.orderNumber}`);
    } catch (error) {
      console.error(`⚠️ Failed to auto-generate invoice for order ${savedOrder.orderNumber}:`, error.message);
      console.error('Full error:', error); // Add full error logging for debugging
      // Don't throw error - order creation should still succeed even if invoice creation fails
    }

    // Log audit trail for create
    await this.auditLogService.log(
      'CREATE',
      'SalesOrder',
      `Created sales order: ${savedOrder.orderNumber} for ${customer.name} (RM ${totalAmount.toFixed(2)})`,
      {
        entityId: savedOrder.id,
        userId: userId || 'system',
        username,
        newValues: {
          orderNumber: savedOrder.orderNumber,
          customerId: customer.id,
          customerName: customer.name,
          totalAmount,
          itemCount: createdItems.length,
        },
      }
    );

    return this.findById(savedOrder.id);
  }

  async findAll(query: QuerySalesOrdersDto) {
    return this.salesOrderQueryService.findAll(query);
  }

  async searchGlobal(query: string, user: any): Promise<GlobalSearchResultDto[]> {
    if (!canSearchSalesOrders(user.role)) return [];

    const trimmed = query.trim();
    const q = trimmed.toLowerCase();
    const orders = await this.salesOrderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .where('order.deletedAt IS NULL')
      .andWhere('(order.orderNumber ILIKE :q OR customer.name ILIKE :q)', {
        q: `%${trimmed}%`,
      })
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    if (orders.length > 0) {
      return orders.map((order) => this.mapSalesOrder(order, q, false));
    }

    const fuzzyOrders = await this.salesOrderRepository
      .createQueryBuilder('order')
      .addSelect('similarity(order.orderNumber, :q)', 'sim')
      .leftJoinAndSelect('order.customer', 'customer')
      .where('order.deletedAt IS NULL')
      .andWhere('similarity(order.orderNumber, :q) > 0.3')
      .orderBy('sim', 'DESC')
      .setParameter('q', trimmed)
      .take(SEARCH_CANDIDATE_LIMIT)
      .getMany();

    return fuzzyOrders.map((order) => this.mapSalesOrder(order, q, true));
  }

  private mapSalesOrder(
    order: SalesOrder,
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
      description: order.customer?.name ?? '',
      route: `/sales/orders/${order.id}/edit`,
      score:
        baseScore +
        BOOST_TRANSACTION +
        (baseScore === SCORE_EXACT_CODE ? BOOST_EXACT_MATCH : 0),
    };
  }

  async findSummaries(query: QuerySalesOrdersDto = {}): Promise<any> {
    return this.salesOrderQueryService.findSummaries(query);
  }

  async getDashboardStats() {
    return this.salesOrderQueryService.getDashboardStats();
  }

  async findById(id: string): Promise<SalesOrderResponseDto> {
    return this.salesOrderQueryService.findById(id);
  }

  async findByOrderNumber(orderNumber: string): Promise<SalesOrderResponseDto> {
    return this.salesOrderQueryService.findByOrderNumber(orderNumber);
  }

  async update(
    id: string,
    updateSalesOrderDto: UpdateSalesOrderDto,
    userId?: string,
    username?: string,
  ): Promise<SalesOrderResponseDto> {
    await this.salesOrderLifecycleService.assertEditAllowed(id);

    const order = await this.salesOrderRepository.findOne({
      where: { id }
    });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    const { items, customerId, notes } = updateSalesOrderDto;

    // Prepare update data for the sales order
    const updateData: any = {};

    // Get customer for pricing (either new customer or existing)
    let customerForPricing: Customer | null = null;

    // Update customer if provided
    if (customerId) {
      customerForPricing = await this.customerRepository.findOne({
        where: { id: customerId },
        relations: { priceList: true }
      });
      if (!customerForPricing) {
        throw new NotFoundException('Customer not found');
      }
      updateData.customerId = customerId;
    } else {
      // Load existing customer for pricing
      customerForPricing = await this.customerRepository.findOne({
        where: { id: order.customerId },
        relations: { priceList: true }
      });
    }

    // Update notes if provided (including empty string to clear notes)
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    // Update items if provided
    if (items && items.length > 0) {
      // Delete existing items from database
      await this.salesOrderItemRepository.delete({ salesOrderId: id });

      // Validate and process new items with customer pricing
      const orderItems = await this.validateAndProcessItems(items, customerForPricing);

      const subtotal = SalesOrderService.sumItemTotals(orderItems);
      const shippingAmount = updateSalesOrderDto.shippingAmount !== undefined
        ? Number(updateSalesOrderDto.shippingAmount)
        : Number(order.shippingAmount || 0);
      const totalAmount = subtotal + shippingAmount;

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

      // Add shipping and total amount to update data
      updateData.shippingAmount = shippingAmount;
      updateData.subtotal = subtotal;
      updateData.totalAmount = totalAmount;
    } else if (updateSalesOrderDto.shippingAmount !== undefined) {
      // If only shipping is being updated (no items), load items from DB to recalculate total
      const existingItems = await this.salesOrderItemRepository.find({ where: { salesOrderId: id } });
      const currentSubtotal = SalesOrderService.sumItemTotals(existingItems);
      const newShipping = Number(updateSalesOrderDto.shippingAmount);
      updateData.shippingAmount = newShipping;
      updateData.subtotal = currentSubtotal;
      updateData.totalAmount = currentSubtotal + newShipping;
    }

    // Perform all updates in a single database call
    if (Object.keys(updateData).length > 0) {
      await this.salesOrderRepository.update(id, updateData);
    }

    // Log audit trail for update
    if (Object.keys(updateData).length > 0) {
      await this.auditLogService.log(
        'UPDATE',
        'SalesOrder',
        `Updated sales order: ${order.orderNumber}`,
        {
          entityId: id,
          userId: userId || 'system',
          username,
          oldValues: updateData,
          newValues: updateData,
        }
      );
    }

    return this.findById(id);
  }

  async duplicateOrder(id: string, userId: string): Promise<SalesOrderResponseDto> {
    const originalOrder = await this.salesOrderRepository.findOne({
      where: { id },
      relations: { items: true },
    });

    if (!originalOrder) {
      throw new NotFoundException('Sales order not found');
    }

    const duplicateData: CreateSalesOrderDto = {
      customerId: originalOrder.customerId,
      notes: originalOrder.notes,
      shippingAmount: Number(originalOrder.shippingAmount || 0),
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
      relations: { items: true },
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    const inventoryStatus = await this.inventoryIntegrationService.getOrderFulfillmentStatus(id);

    return {
      orderId: id,
      orderNumber: order.orderNumber,
      totalItems: order.items?.length || 0,
      inventory: inventoryStatus,
    };
  }

  async findOrdersByCustomer(customerId: string, limit: number = 10) {
    return this.salesOrderQueryService.findOrdersByCustomer(customerId, limit);
  }

  // Helper methods

  private async triggerMetricUpdate(customerId: string, context: string): Promise<void> {
    try {
      await this.customerService.updateCustomerMetrics(customerId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(`Customer not found for metric update after ${context} — possible orphaned order (customerId: ${customerId})`);
      } else {
        this.logger.error(`Failed to update customer metrics after ${context} (customerId: ${customerId}): ${error.message}`);
      }
    }
  }

  /**
   * Sum the post-discount totalAmount across a list of order items.
   * Used in create, update (items branch), and update (shipping-only branch)
   * to ensure the same calculation logic is applied everywhere.
   */
  private static sumItemTotals(items: Array<{ totalAmount: number }>): number {
    return items.reduce((sum, item) => sum + Number(item.totalAmount), 0);
  }

  private async validateAndProcessItems(items: any[], customer?: Customer) {
    const processedItems = [];
    let lineNumber = 1;

    for (const item of items) {
      const product = await this.productRepository.findOne({ where: { id: item.productId } });
      if (!product) {
        throw new NotFoundException(`Product with ID ${item.productId} not found`);
      }

      // Determine unit price - try price list first, then fallback to legacy
      let defaultPrice = 0;

      // NEW: Try to get price from customer's price list first
      if (customer && customer.priceListId) {
        const priceListItem = await this.priceListItemRepository.findOne({
          where: {
            priceListId: customer.priceListId,
            productId: item.productId
          }
        });

        if (priceListItem) {
          defaultPrice = Number(priceListItem.price);
          console.log(`Using price list price: ${defaultPrice} for product ${item.productId}`);
        }
      }

      // Fallback to baseCost if no price list price found
      if (defaultPrice === 0) {
        defaultPrice = Number(product.baseCost) || 0;
        console.log(`Using baseCost fallback: ${defaultPrice} for product ${item.productId}`);
      }

      const unitPrice = Number(item.unitPrice) || defaultPrice;
      const discountPercent = Number(item.discountPercent) || 0;
      const discountAmount = Number(item.discountAmount) || 0;

      // Calculate line total before discount
      const lineTotal = unitPrice * item.quantity;

      // Calculate total discount for the line (not per unit)
      let calculatedDiscountAmount = 0;
      if (item.discountType === DiscountType.PERCENTAGE && discountPercent > 0) {
        calculatedDiscountAmount = (lineTotal * discountPercent) / 100;
      } else if (item.discountType === DiscountType.AMOUNT && discountAmount > 0) {
        calculatedDiscountAmount = discountAmount;
      }

      const totalAmount = lineTotal - calculatedDiscountAmount;

      processedItems.push({
        lineNumber: lineNumber++,
        productId: item.productId,
        quantity: Number(item.quantity) || 1,
        unitPrice: Number(unitPrice) || 0,
        unitCost: Number(product.baseCost) || 0,
        discountType: item.discountType || DiscountType.PERCENTAGE,
        discountPercent: Number(discountPercent) || 0,
        discountAmount: Number(calculatedDiscountAmount) || 0,
        totalAmount: Number(totalAmount) || 0,
        notes: item.notes || null,
      });
    }

    console.log('Processed items from validateAndProcessItems:', JSON.stringify(processedItems, null, 2));
    return processedItems;
  }

  async cancel(id: string, userId?: string, username?: string): Promise<SalesOrderResponseDto> {
    await this.salesOrderLifecycleService.cancel(id, userId, username);
    return this.salesOrderQueryService.findById(id);
  }

  async uncancel(id: string, userId?: string, username?: string): Promise<SalesOrderResponseDto> {
    await this.salesOrderLifecycleService.uncancel(id, userId, username);
    return this.salesOrderQueryService.findById(id);
  }

  async recordPayment(orderId: string, dto: RecordPaymentDto, userId?: string, username?: string): Promise<SalesOrderResponseDto> {
    await this.salesOrderPaymentService.recordPayment(orderId, dto, userId, username);
    return this.salesOrderQueryService.findById(orderId);
  }

  async recordRefund(orderId: string, dto: RecordRefundDto, userId?: string, username?: string): Promise<SalesOrderResponseDto> {
    await this.salesOrderPaymentService.recordRefund(orderId, dto, userId, username);
    return this.salesOrderQueryService.findById(orderId);
  }

  async recordPayments(orderId: string, dtos: RecordPaymentDto[], userId?: string, username?: string): Promise<SalesOrderPayment[]> {
    return this.salesOrderPaymentService.recordPayments(orderId, dtos, userId, username);
  }

  async recordRefunds(orderId: string, dtos: RecordPaymentDto[], userId?: string, username?: string) {
    return this.salesOrderPaymentService.recordRefunds(orderId, dtos, userId, username)
  }

  async listPayments(orderId: string) {
    return this.salesOrderPaymentService.listPayments(orderId);
  }

  async fulfillOrder(id: string, userId?: string, username?: string): Promise<SalesOrderResponseDto> {
    await this.salesOrderFulfillmentService.fulfillOrder(id, userId, username);
    return this.salesOrderQueryService.findById(id);
  }

  async unfulfillOrder(id: string, userId?: string, username?: string): Promise<SalesOrderResponseDto> {
    await this.salesOrderFulfillmentService.unfulfillOrder(id, userId, username);
    return this.salesOrderQueryService.findById(id);
  }


}
