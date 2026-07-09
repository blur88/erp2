import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, FindOptionsWhere, In } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import { SalesOrder, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem, DiscountType } from '../../../database/entities/sales-order-item.entity';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Product } from '../../../database/entities/product.entity';
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
import {
  ValidationUtil,
  BulkOperationUtil,
  BulkOperationResponse,
} from '../../../common/utils/validation.util';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
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
    private readonly salesOrderFulfillmentService: SalesOrderFulfillmentService,
    private readonly salesOrderLifecycleService: SalesOrderLifecycleService,
    private readonly salesOrderPaymentService: SalesOrderPaymentService,
    private readonly salesOrderQueryService: SalesOrderQueryService,
    private readonly dataSource: DataSource,
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
      console.error(
        '[generateSequentialOrderNumber] Error generating order number:',
        error.message,
      );
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

  async create(
    createSalesOrderDto: CreateSalesOrderDto,
    userId?: string,
    username?: string,
  ): Promise<SalesOrderResponseDto> {
    const { customerId, items, ...orderData } = createSalesOrderDto;

    // Verify customer exists and can purchase
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      relations: { priceList: true },
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
      items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
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
            throw new ConflictException(
              'Failed to generate unique order number after multiple attempts. Please try again.',
            );
          }
          // Wait a longer random time before retrying (50-200ms) to reduce collision probability
          await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 150));
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
      items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        salesOrderId: savedOrder.id,
      })),
    );

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
      },
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

  private mapSalesOrder(order: SalesOrder, q: string, fuzzy: boolean): GlobalSearchResultDto {
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
        baseScore + BOOST_TRANSACTION + (baseScore === SCORE_EXACT_CODE ? BOOST_EXACT_MATCH : 0),
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
      where: { id },
    });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    const { items, customerId, notes } = updateSalesOrderDto;

    // Prepare update data for the sales order
    const updateData: any = {};
    let orderItems: any[] = [];
    let auditOldValues: any = {};
    let auditNewValues: any = null;

    // customerId (if supplied) is recorded now; the customer is resolved and items are
    // priced INSIDE the locked transaction so all pricing reads are lock-consistent.
    if (customerId) {
      updateData.customerId = customerId;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }

    await this.dataSource.transaction(async (manager: EntityManager) => {
      // Lock the parent order before deriving any totals from mutable state.
      const locked = await manager.getRepository(SalesOrder).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Sales order not found');

      // Re-assert editability against the LOCKED row: assertEditAllowed ran on an
      // unlocked pre-read, so a concurrent fulfill/cancel could have moved the order out
      // of the editable band in between. This is the authoritative, race-free check.
      SalesOrderLifecycleService.assertStatusEditable(locked.status);

      // Snapshot pre-edit values for the audit trail before any writes in this tx.
      auditOldValues = SalesOrderService.snapshotOrderForAudit(locked);

      // A supplied customerId changes pricing, so re-pricing is required whenever the
      // customer changes — even with no items in the DTO. Detect that here so the
      // customer-only path re-prices existing items rather than keeping stale totals.
      const customerChanged = customerId !== undefined && customerId !== locked.customerId;

      // Resolve the pricing/validation customer inside the lock. A supplied customerId is
      // validated whenever present (even for customer-only edits); otherwise fall back to
      // the locked order's current customer (needed when (re)pricing items).
      let pricingCustomer: Customer | null = null;
      if (customerId) {
        pricingCustomer = await manager.getRepository(Customer).findOne({
          where: { id: customerId },
          relations: { priceList: true },
        });
        if (!pricingCustomer) {
          throw new NotFoundException('Customer not found');
        }
      } else if (items && items.length > 0) {
        pricingCustomer = await manager.getRepository(Customer).findOne({
          where: { id: locked.customerId },
          relations: { priceList: true },
        });
        if (!pricingCustomer) {
          throw new NotFoundException('Customer not found');
        }
      }

      // Determine the line items to (re)price: DTO items if supplied, otherwise the
      // existing rows when only the customer changed (so their prices follow the new
      // customer's price list).
      let itemsToPrice: any[] | null = null;
      if (items && items.length > 0) {
        itemsToPrice = items;
      } else if (customerChanged) {
        const existingItems = await manager.getRepository(SalesOrderItem).find({
          where: { salesOrderId: id },
        });
        // Re-price by product at the new customer's prices; preserve per-line overrides
        // (explicit unitPrice is respected by validateAndProcessItems).
        itemsToPrice = existingItems.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          discountType: it.discountType,
          discountPercent: it.discountPercent,
          discountAmount: it.discountAmount,
          notes: it.notes,
        }));
      }

      if (itemsToPrice && itemsToPrice.length > 0) {
        orderItems = await this.validateAndProcessItems(itemsToPrice, pricingCustomer!, manager);

        await manager.getRepository(SalesOrderItem).delete({ salesOrderId: id });
        for (const itemData of orderItems) {
          // Use direct repository insert instead of create/save to bypass entity hooks.
          await manager.getRepository(SalesOrderItem).insert({
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
            salesOrderId: id,
          });
        }

        const subtotal = SalesOrderService.sumItemTotals(orderItems);
        const shippingAmount =
          updateSalesOrderDto.shippingAmount !== undefined
            ? Number(updateSalesOrderDto.shippingAmount)
            : Number(locked.shippingAmount || 0);
        updateData.shippingAmount = shippingAmount;
        updateData.subtotal = subtotal;
        updateData.totalAmount = subtotal + shippingAmount;
      } else if (updateSalesOrderDto.shippingAmount !== undefined) {
        // Shipping-only edits read existing items through the transaction manager.
        const existingItems = await manager.getRepository(SalesOrderItem).find({
          where: { salesOrderId: id },
        });
        const currentSubtotal = SalesOrderService.sumItemTotals(existingItems);
        const newShipping = Number(updateSalesOrderDto.shippingAmount);
        updateData.shippingAmount = newShipping;
        updateData.subtotal = currentSubtotal;
        updateData.totalAmount = currentSubtotal + newShipping;
      }

      const hasChanges = Object.keys(updateData).length > 0;
      if (hasChanges) {
        await manager.getRepository(SalesOrder).update(id, updateData);
      }

      // Reconcile inside the same transaction so totals, payment state, and the
      // DRAFT<->READY band commit atomically. reconcileOrderState returns the locked,
      // reconciled order so we can snapshot it for the audit without re-reading.
      let reconciled: SalesOrder | null = null;
      if (updateData.totalAmount !== undefined) {
        reconciled = await this.salesOrderPaymentService.reconcileOrderState(id, manager);
      }

      // Capture the post-edit row BEFORE the lock releases so the audit "after" reflects
      // exactly this edit (not a concurrent later mutation). Prefer the reconciled entity
      // (already in hand); otherwise re-read for the non-total edits (notes/customer-only
      // with no priced items) that still mutated the row.
      if (hasChanges) {
        const after =
          reconciled ?? (await manager.getRepository(SalesOrder).findOne({ where: { id } }));
        if (after) {
          auditNewValues = SalesOrderService.snapshotOrderForAudit(after);
        }
      }
    });

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
          oldValues: auditOldValues,
          newValues: auditNewValues ?? updateData,
        },
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
      items: originalOrder.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        // Copy the full discount shape: a fixed-amount (AMOUNT) discount has
        // discountPercent = 0, so without discountType + discountAmount the
        // duplicate would silently drop the discount.
        discountType: item.discountType,
        discountPercent: Number(item.discountPercent),
        discountAmount: Number(item.discountAmount),
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

  // Helper methods

  private async triggerMetricUpdate(customerId: string, context: string): Promise<void> {
    try {
      await this.customerService.updateCustomerMetrics(customerId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(
          `Customer not found for metric update after ${context} — possible orphaned order (customerId: ${customerId})`,
        );
      } else {
        this.logger.error(
          `Failed to update customer metrics after ${context} (customerId: ${customerId}): ${error.message}`,
        );
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

  /**
   * Build the normalized before/after value snapshot logged on an order edit. Kept in
   * one place so the audit "old" and "new" records always share the exact same shape.
   */
  private static snapshotOrderForAudit(order: SalesOrder): Record<string, unknown> {
    return {
      customerId: order.customerId,
      notes: order.notes ?? null,
      subtotal: Number(order.subtotal),
      shippingAmount: Number(order.shippingAmount),
      totalAmount: Number(order.totalAmount),
      status: order.status,
      paymentStatus: order.paymentStatus,
      paidAmount: Number(order.paidAmount),
      balanceDue: Number(order.balanceDue),
    };
  }

  private async validateAndProcessItems(
    items: any[],
    customer?: Customer,
    manager?: EntityManager,
  ) {
    const productRepo = manager ? manager.getRepository(Product) : this.productRepository;
    const priceListItemRepo = manager
      ? manager.getRepository(PriceListItem)
      : this.priceListItemRepository;

    // Batch-load products and price-list rows up front to avoid an N+1 of findOne calls
    // inside the (locked) edit transaction.
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = productIds.length
      ? await productRepo.find({ where: { id: In(productIds) } })
      : [];
    const productById = new Map(products.map((p) => [p.id, p]));

    const priceByProduct = new Map<string, number>();
    if (customer && customer.priceListId && productIds.length) {
      const priceListItems = await priceListItemRepo.find({
        where: { priceListId: customer.priceListId, productId: In(productIds) },
      });
      for (const pli of priceListItems) {
        priceByProduct.set(pli.productId, Number(pli.price));
      }
    }

    const processedItems = [];
    let lineNumber = 1;

    for (const item of items) {
      const product = productById.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Product with ID ${item.productId} not found`);
      }

      // Determine unit price - price list first, then fall back to baseCost.
      let defaultPrice = priceByProduct.get(item.productId) ?? 0;
      if (defaultPrice === 0) {
        defaultPrice = Number(product.baseCost) || 0;
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

  async recordPayment(
    orderId: string,
    dto: RecordPaymentDto,
    userId?: string,
    username?: string,
  ): Promise<SalesOrderResponseDto> {
    await this.salesOrderPaymentService.recordPayment(orderId, dto, userId, username);
    return this.salesOrderQueryService.findById(orderId);
  }

  async recordRefund(
    orderId: string,
    dto: RecordRefundDto,
    userId?: string,
    username?: string,
  ): Promise<SalesOrderResponseDto> {
    await this.salesOrderPaymentService.recordRefund(orderId, dto, userId, username);
    return this.salesOrderQueryService.findById(orderId);
  }

  async recordPayments(
    orderId: string,
    dtos: RecordPaymentDto[],
    userId?: string,
    username?: string,
  ): Promise<SalesOrderPayment[]> {
    return this.salesOrderPaymentService.recordPayments(orderId, dtos, userId, username);
  }

  async recordRefunds(
    orderId: string,
    dtos: RecordPaymentDto[],
    userId?: string,
    username?: string,
  ) {
    return this.salesOrderPaymentService.recordRefunds(orderId, dtos, userId, username);
  }

  async listPayments(orderId: string) {
    return this.salesOrderPaymentService.listPayments(orderId);
  }

  async fulfillOrder(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<SalesOrderResponseDto> {
    await this.salesOrderFulfillmentService.fulfillOrder(id, userId, username);
    return this.salesOrderQueryService.findById(id);
  }

  async unfulfillOrder(
    id: string,
    userId?: string,
    username?: string,
  ): Promise<SalesOrderResponseDto> {
    await this.salesOrderFulfillmentService.unfulfillOrder(id, userId, username);
    return this.salesOrderQueryService.findById(id);
  }
}
