import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Product, ProductType } from '../../../database/entities/product.entity';
import { StockMovement, StockMovementType } from '../../../database/entities/stock-movement.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { SettingsService } from '../../settings/settings.service';
import { repoFor, lockProductForStockUpdate } from '../../../common/db/tx-helpers';

export interface StockItem {
  productId: string;
  quantity: number;
  salesOrderId?: string;
}

/**
 * A point-in-time stock snapshot for a set of requested items. This is a
 * QUERY, not a gate: it reports what stock exists and where a request falls
 * short, and deliberately renders no verdict on whether an operation may
 * proceed.
 *
 * It previously carried `available: boolean` and a `message`, but `available`
 * was hard-coded `true`, so all three `if (!available)` guards against it were
 * unreachable and the message claimed negative stock was permitted — which
 * stopped being true at fulfilment in #1078. Callers now read `shortfall` and
 * decide for themselves; order entry accepts shorts by design, fulfilment
 * refuses them under the product lock.
 */
export interface StockAvailability {
  items: {
    productId: string;
    productSku: string;
    productName: string;
    requested: number;
    available: number;
    reserved: number;
    shortfall: number;
  }[];
}

export interface OrderFulfillmentStatus {
  orderId: string;
  totalItems: number;
  fulfilledItems: number;
  reservedItems: number;
  pendingItems: number;
  items: {
    productId: string;
    productSku: string;
    productName: string;
    ordered: number;
    reserved: number;
    fulfilled: number;
    pending: number;
    status: 'available' | 'reserved' | 'fulfilled' | 'backordered';
  }[];
}

@Injectable()
export class InventoryIntegrationService {
  // In-memory reservations map (in production, this would be in database)
  private readonly reservations: Map<string, Map<string, number>> = new Map();

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(StockMovement)
    private readonly stockMovementRepository: Repository<StockMovement>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepository: Repository<SalesOrderItem>,
    @Inject(forwardRef(() => BaseCostCalculatorService))
    private readonly baseCostCalculator: BaseCostCalculatorService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Report current stock and shortfall for the requested items.
   *
   * Reports only — it never throws on insufficiency and never decides whether a
   * caller may proceed. Sufficiency is enforced at fulfilment, inside
   * `adjustStock()` under the product lock (#1078), which is the only place a
   * verdict can be made race-free. A check here would be a pre-lock snapshot
   * and stale by the time anyone acted on it.
   */
  async getStockAvailability(items: StockItem[]): Promise<StockAvailability> {
    const availabilityItems = [];

    for (const item of items) {
      const product = await this.productRepository.findOne({
        where: { id: item.productId },
      });

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      const availableQuantity = Number(product.stockQuantity);
      const reservedQuantity = this.getReservedQuantity(item.productId);
      const effectiveAvailable = availableQuantity - reservedQuantity;
      const shortfall = Math.max(0, item.quantity - effectiveAvailable);

      availabilityItems.push({
        productId: item.productId,
        productSku: product.barcode || '',
        productName: product.name,
        requested: item.quantity,
        available: availableQuantity,
        reserved: reservedQuantity,
        shortfall,
      });
    }

    return { items: availabilityItems };
  }

  async reserveStock(items: StockItem[]): Promise<void> {
    // Reservations are advisory and deliberately do NOT gate on stock: a short
    // item may be reserved, exactly as a short order may be entered. Fulfilment
    // is where sufficiency is enforced (#1078).

    // Reserve stock for each item
    for (const item of items) {
      if (!item.salesOrderId) {
        throw new BadRequestException('Sales order ID is required for stock reservation');
      }

      // Get or create order reservations
      let orderReservations = this.reservations.get(item.salesOrderId);
      if (!orderReservations) {
        orderReservations = new Map();
        this.reservations.set(item.salesOrderId, orderReservations);
      }

      // Add to reservation
      const currentReservation = orderReservations.get(item.productId) || 0;
      orderReservations.set(item.productId, currentReservation + item.quantity);

      // Note: We don't create stock movement records for reservations
      // Stock movements are only created when the order is actually fulfilled
      // Reservations are tracked in-memory only via the reservations Map
    }
  }

  // NOTE: releaseReservation() and fulfillOrder() were removed in #1076. Both
  // were unreachable (no callers anywhere in src/), and fulfillOrder() wrote
  // product.stockQuantity directly on this.productRepository — outside any
  // transaction and bypassing the stock-mutation contract. The in-memory
  // reservations map is deliberately KEPT: reserveStock() and
  // getOrderFulfillmentStatus() below are live (SalesOrderService:240 and :571).
  // Its single-instance design is tracked separately.

  async getOrderFulfillmentStatus(salesOrderId: string): Promise<OrderFulfillmentStatus> {
    const order = await this.salesOrderRepository.findOne({
      where: { id: salesOrderId },
      relations: { items: { product: true } },
    });

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    const orderReservations = this.reservations.get(salesOrderId) || new Map();
    const fulfillmentItems = [];
    let fulfilledItems = 0;
    let reservedItems = 0;
    let pendingItems = 0;

    for (const item of order.items) {
      const product = item.product;
      if (!product) continue;

      const reserved = orderReservations.get(item.productId) || 0;
      
      // Determine fulfilled quantity based on stock movements
      const fulfilledQuantity = await this.getFulfilledQuantity(salesOrderId, item.productId);
      const pending = Math.max(0, item.quantity - reserved - fulfilledQuantity);

      let status: 'available' | 'reserved' | 'fulfilled' | 'backordered' = 'available';
      if (fulfilledQuantity >= item.quantity) {
        status = 'fulfilled';
        fulfilledItems++;
      } else if (reserved > 0) {
        status = 'reserved';
        reservedItems++;
      } else if (Number(product.stockQuantity) < item.quantity) {
        status = 'backordered';
        pendingItems++;
      } else {
        pendingItems++;
      }

      fulfillmentItems.push({
        productId: item.productId,
        productSku: product.barcode || '',
        productName: product.name,
        ordered: item.quantity,
        reserved,
        fulfilled: fulfilledQuantity,
        pending,
        status,
      });
    }

    return {
      orderId: salesOrderId,
      totalItems: order.items.length,
      fulfilledItems,
      reservedItems,
      pendingItems,
      items: fulfillmentItems,
    };
  }

  async getProductReservations(productId: string): Promise<{
    totalReserved: number;
    reservations: {
      salesOrderId: string;
      orderNumber?: string;
      quantity: number;
      createdDate: Date;
    }[];
  }> {
    let totalReserved = 0;
    const reservations = [];

    // Scan all reservations for this product
    for (const [salesOrderId, orderReservations] of this.reservations.entries()) {
      const reserved = orderReservations.get(productId);
      if (reserved && reserved > 0) {
        totalReserved += reserved;

        // Get order details
        const order = await this.salesOrderRepository.findOne({
          where: { id: salesOrderId },
          select: { orderNumber: true, createdAt: true },
        });

        reservations.push({
          salesOrderId,
          orderNumber: order?.orderNumber,
          quantity: reserved,
          createdDate: order?.createdAt || new Date(),
        });
      }
    }

    return {
      totalReserved,
      reservations: reservations.sort((a, b) => b.createdDate.getTime() - a.createdDate.getTime()),
    };
  }

  async adjustReservation(
    salesOrderId: string,
    productId: string,
    newQuantity: number,
  ): Promise<void> {
    const orderReservations = this.reservations.get(salesOrderId);
    if (!orderReservations) {
      throw new NotFoundException('No reservations found for this order');
    }

    const currentReservation = orderReservations.get(productId) || 0;
    const difference = newQuantity - currentReservation;

    if (difference === 0) {
      return; // No change needed
    }

    // Increasing a reservation is not gated on stock either — see reserveStock().

    // Update reservation
    if (newQuantity <= 0) {
      orderReservations.delete(productId);
    } else {
      orderReservations.set(productId, newQuantity);
    }

    // Note: We don't create stock movement records for reservation adjustments
    // Stock movements are only created when the order is actually fulfilled
    // Reservations are tracked in-memory only via the reservations Map
  }

  async getInventorySummary(): Promise<{
    totalProducts: number;
    totalStockValue: number;
    lowStockProducts: number;
    totalReservations: number;
    reservationValue: number;
  }> {
    const { lowStockThreshold } = await this.settingsService.getRegionalSettings();
    const products = await this.productRepository.find({
      where: { isActive: true },
    });

    let totalStockValue = 0;
    let lowStockProducts = 0;
    let totalReservations = 0;
    let reservationValue = 0;

    for (const product of products) {
      const stockValue = Number(product.stockQuantity) * Number(product.baseCost || 0);
      totalStockValue += stockValue;

      if (Number(product.stockQuantity) <= lowStockThreshold) {
        lowStockProducts++;
      }

      // Calculate reservations for this product
      const reservations = await this.getProductReservations(product.id);
      totalReservations += reservations.totalReserved;
      reservationValue += reservations.totalReserved * Number(product.baseCost || 0);
    }

    return {
      totalProducts: products.length,
      totalStockValue,
      lowStockProducts,
      totalReservations,
      reservationValue,
    };
  }

  /**
   * Adjust stock for a product.
   * For depletions (negative quantityChange), returns the consumed value as an
   * unrounded scale-8 bigint from reduceStock. For non-depletions, returns 0n.
   *
   * Throws ConflictException when a depletion would drive the lock-held balance
   * negative (#1078). This is the authoritative oversell gate for sales
   * fulfilment; see the check below.
   */
  async adjustStock(
    productId: string,
    quantityChange: number,
    reason: string,
    referenceId?: string,
    userId?: string,
    movementTypeOverride?: StockMovementType,
    manager?: EntityManager,
  ): Promise<bigint> {
    const productRepo = repoFor(manager, Product, this.productRepository);

    // Stock-mutation contract (#1076): lock before reading stockQuantity so the
    // movement, the FIFO consumption and the product save below are atomic
    // against concurrent movements from other workflows. The caller
    // (SalesOrderFulfillmentService) already runs in a transaction and passes
    // its manager; without one there is no lock to take, so refuse rather than
    // silently racing.
    if (!manager) {
      throw new Error(
        'adjustStock requires an EntityManager: the product lock is only ' +
          'meaningful inside a transaction (stock-mutation contract, #1076).',
      );
    }
    const product = await lockProductForStockUpdate(manager, Product, productId);

    // Calculate stock changes BEFORE updating. `product` above is lock-held and
    // is the authoritative source of the current quantity — do not re-read it.
    const currentStock = Number(product.stockQuantity);
    const changeAmount = Number(quantityChange);
    const newStockQuantity = currentStock + changeAmount;

    // Authoritative stock-sufficiency gate (#1078). The caller's pre-flight runs
    // on a pre-lock snapshot and cannot be race-free; this one reads the
    // lock-held row, so a concurrent depletion that already committed is
    // visible here. Two fulfilments of the last unit used to both pass the
    // caller's check and land the product at -1 — the loser now fails and its
    // whole transaction rolls back.
    //
    // The caller keeps its pre-flight because it aggregates every short item
    // into one message; this check is necessarily per-product, since it can
    // only speak for the row it holds.
    if (newStockQuantity < 0) {
      throw new ConflictException(
        `Cannot fulfill — insufficient stock for ${(product as any).name ?? productId} ` +
          `(need ${Math.abs(changeAmount)}, have ${currentStock})`,
      );
    }

    // Create stock movement record BEFORE updating product
    const movementType = movementTypeOverride || (quantityChange > 0
      ? StockMovementType.ADJUSTMENT_INCREASE
      : StockMovementType.SALE);

    await this.createStockMovementWithBalances(
      productId,
      quantityChange,
      currentStock,
      newStockQuantity,
      movementType,
      reason,
      referenceId,
      userId,
      manager,
    );

    let consumedScale8 = 0n;

    // Update FIFO cost history for sales (negative quantity changes).
    if (quantityChange < 0) {
      const quantitySold = Math.abs(quantityChange);
      consumedScale8 = await this.baseCostCalculator.reduceStock(productId, quantitySold, manager);
    }

    // Update product stock quantity. Guaranteed >= 0 by the check above.
    product.stockQuantity = Number(newStockQuantity);
    await productRepo.save(product);

    return consumedScale8;
  }

  // Private helper methods

  private getReservedQuantity(productId: string): number {
    let totalReserved = 0;
    
    for (const orderReservations of this.reservations.values()) {
      const reserved = orderReservations.get(productId) || 0;
      totalReserved += reserved;
    }
    
    return totalReserved;
  }

  private async getFulfilledQuantity(salesOrderId: string, productId: string): Promise<number> {
    const movements = await this.stockMovementRepository.find({
      where: {
        productId,
        movementType: StockMovementType.SALE,
        referenceId: salesOrderId,
      },
    });

    return movements.reduce((total, movement) => {
      return total + (movement.movementType === StockMovementType.SALE ? movement.quantity : 0);
    }, 0);
  }


  private async createStockMovementWithBalances(
    productId: string,
    quantity: number,
    previousBalance: number,
    newBalance: number,
    movementType: StockMovementType,
    reason: string,
    referenceId?: string,
    userId?: string,
    manager?: EntityManager,
  ): Promise<StockMovement> {
    const stockMovementRepo = repoFor(manager, StockMovement, this.stockMovementRepository);
    const movement = stockMovementRepo.create({
      productId,
      quantity,
      previousBalance,
      newBalance,
      movementType,
      reason,
      referenceId,
      referenceType: referenceId ? 'sales_order' : null, // Set referenceType if referenceId is provided
      movementDate: new Date(),
    });

    return await stockMovementRepo.save(movement);
  }
}
