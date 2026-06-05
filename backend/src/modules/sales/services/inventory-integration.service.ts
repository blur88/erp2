import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import {
  Product,
  ProductType,
} from "../../../database/entities/product.entity";
import {
  StockMovement,
  StockMovementType,
} from "../../../database/entities/stock-movement.entity";
import { SalesOrder } from "../../../database/entities/sales-order.entity";
import { SalesOrderItem } from "../../../database/entities/sales-order-item.entity";
import { BaseCostCalculatorService } from "../../inventory/services/base-cost-calculator.service";
import { SettingsService } from "../../settings/settings.service";
import { repoFor } from "../../../common/db/tx-helpers";

export interface StockItem {
  productId: string;
  quantity: number;
  salesOrderId?: string;
}

export interface AvailabilityCheck {
  available: boolean;
  message: string;
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
    status: "available" | "reserved" | "fulfilled" | "backordered";
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

  async checkAvailability(items: StockItem[]): Promise<AvailabilityCheck> {
    let allAvailable = true; // Always true now - we allow negative stock for GOODS
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

      // Allow negative stock for GOODS products (stocked products)
      // Service products should not have stock issues
      // For GOODS, we allow negative stock, so always available
      // For SERVICE, they don't have stock constraints, so always available
      // Both types are always available now

      availabilityItems.push({
        productId: item.productId,
        productSku: product.barcode || "",
        productName: product.name,
        requested: item.quantity,
        available: availableQuantity,
        reserved: reservedQuantity,
        shortfall,
      });
    }

    return {
      available: allAvailable, // Always true now - allowing negative stock
      message:
        "All items are available (negative stock allowed for stocked products)",
      items: availabilityItems,
    };
  }

  async reserveStock(items: StockItem[]): Promise<void> {
    // Check availability first (now allows negative stock for GOODS)
    const availabilityCheck = await this.checkAvailability(items);
    if (!availabilityCheck.available) {
      throw new BadRequestException("Insufficient stock for reservation");
    }

    // Reserve stock for each item
    for (const item of items) {
      if (!item.salesOrderId) {
        throw new BadRequestException(
          "Sales order ID is required for stock reservation",
        );
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

  async releaseReservation(salesOrderId: string): Promise<void> {
    const orderReservations = this.reservations.get(salesOrderId);
    if (!orderReservations) {
      return; // No reservations to release
    }

    // Release all reservations for this order
    // Note: We don't create stock movement records for releasing reservations
    // Stock movements are only created for actual stock changes (fulfillment)

    // Remove from reservations map
    this.reservations.delete(salesOrderId);
  }

  async fulfillOrder(salesOrderId: string, userId?: string): Promise<void> {
    const order = await this.salesOrderRepository.findOne({
      where: { id: salesOrderId },
      relations: { items: true },
    });

    if (!order) {
      throw new NotFoundException("Sales order not found");
    }

    const orderReservations = this.reservations.get(salesOrderId);
    if (!orderReservations) {
      throw new BadRequestException("No reservations found for this order");
    }

    // Fulfill each item
    for (const item of order.items) {
      const product = await this.productRepository.findOne({
        where: { id: item.productId },
      });

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      // Check if we have enough reserved stock
      const reservedQuantity = orderReservations.get(item.productId) || 0;
      if (reservedQuantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient reserved stock for product ${product.barcode || product.name}. Reserved: ${reservedQuantity}, Required: ${item.quantity}`,
        );
      }

      // Create stock movement for fulfillment BEFORE updating stock
      // This ensures previousBalance and newBalance are calculated correctly
      const previousStock = Number(product.stockQuantity);
      const newStockQuantity = previousStock - item.quantity;

      await this.createStockMovementWithBalances(
        item.productId,
        -item.quantity, // Negative for sales (outward movement)
        previousStock,
        newStockQuantity,
        StockMovementType.SALE,
        `Fulfilled for sales order ${order.orderNumber}`,
        salesOrderId,
        userId,
      );

      // Update product stock (allow negative for GOODS products)
      product.stockQuantity = newStockQuantity; // Allow negative stock for GOODS
      await this.productRepository.save(product);

      // Remove from reservations
      orderReservations.set(item.productId, reservedQuantity - item.quantity);
    }

    // Clean up empty reservations
    for (const [productId, quantity] of orderReservations.entries()) {
      if (quantity <= 0) {
        orderReservations.delete(productId);
      }
    }

    if (orderReservations.size === 0) {
      this.reservations.delete(salesOrderId);
    }
  }

  async getOrderFulfillmentStatus(
    salesOrderId: string,
  ): Promise<OrderFulfillmentStatus> {
    const order = await this.salesOrderRepository.findOne({
      where: { id: salesOrderId },
      relations: { items: { product: true } },
    });

    if (!order) {
      throw new NotFoundException("Sales order not found");
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
      const fulfilledQuantity = await this.getFulfilledQuantity(
        salesOrderId,
        item.productId,
      );
      const pending = Math.max(0, item.quantity - reserved - fulfilledQuantity);

      let status: "available" | "reserved" | "fulfilled" | "backordered" =
        "available";
      if (fulfilledQuantity >= item.quantity) {
        status = "fulfilled";
        fulfilledItems++;
      } else if (reserved > 0) {
        status = "reserved";
        reservedItems++;
      } else if (Number(product.stockQuantity) < item.quantity) {
        status = "backordered";
        pendingItems++;
      } else {
        pendingItems++;
      }

      fulfillmentItems.push({
        productId: item.productId,
        productSku: product.barcode || "",
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
    for (const [
      salesOrderId,
      orderReservations,
    ] of this.reservations.entries()) {
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
      reservations: reservations.sort(
        (a, b) => b.createdDate.getTime() - a.createdDate.getTime(),
      ),
    };
  }

  async adjustReservation(
    salesOrderId: string,
    productId: string,
    newQuantity: number,
  ): Promise<void> {
    const orderReservations = this.reservations.get(salesOrderId);
    if (!orderReservations) {
      throw new NotFoundException("No reservations found for this order");
    }

    const currentReservation = orderReservations.get(productId) || 0;
    const difference = newQuantity - currentReservation;

    if (difference === 0) {
      return; // No change needed
    }

    // Check availability if increasing reservation
    if (difference > 0) {
      const availabilityCheck = await this.checkAvailability([
        {
          productId,
          quantity: difference,
          salesOrderId,
        },
      ]);

      if (!availabilityCheck.available) {
        throw new BadRequestException(
          "Insufficient stock for increased reservation",
        );
      }
    }

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
    const { lowStockThreshold } =
      await this.settingsService.getRegionalSettings();
    const products = await this.productRepository.find({
      where: { isActive: true },
    });

    let totalStockValue = 0;
    let lowStockProducts = 0;
    let totalReservations = 0;
    let reservationValue = 0;

    for (const product of products) {
      const stockValue =
        Number(product.stockQuantity) * Number(product.baseCost || 0);
      totalStockValue += stockValue;

      if (Number(product.stockQuantity) <= lowStockThreshold) {
        lowStockProducts++;
      }

      // Calculate reservations for this product
      const reservations = await this.getProductReservations(product.id);
      totalReservations += reservations.totalReserved;
      reservationValue +=
        reservations.totalReserved * Number(product.baseCost || 0);
    }

    return {
      totalProducts: products.length,
      totalStockValue,
      lowStockProducts,
      totalReservations,
      reservationValue,
    };
  }

  async adjustStock(
    productId: string,
    quantityChange: number,
    reason: string,
    referenceId?: string,
    userId?: string,
    movementTypeOverride?: StockMovementType,
    manager?: EntityManager,
  ): Promise<void> {
    const productRepo = repoFor(manager, Product, this.productRepository);

    const product = await productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    // Calculate stock changes BEFORE updating
    const currentStock = Number(product.stockQuantity);
    const changeAmount = Number(quantityChange);
    const newStockQuantity = currentStock + changeAmount;

    // Create stock movement record BEFORE updating product
    // This ensures previousBalance and newBalance are calculated correctly
    const movementType =
      movementTypeOverride ||
      (quantityChange > 0
        ? StockMovementType.ADJUSTMENT_INCREASE
        : StockMovementType.SALE); // Use SALE for negative adjustments (fulfillment)

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

    // Update FIFO cost history for sales (negative quantity changes).
    // Errors propagate so a wrapping transaction rolls back.
    if (quantityChange < 0) {
      const quantitySold = Math.abs(quantityChange);
      await this.baseCostCalculator.reduceStock(
        productId,
        quantitySold,
        manager,
      );
    }

    // Update product stock quantity (allow negative for GOODS products)
    product.stockQuantity = Number(newStockQuantity);
    await productRepo.save(product);
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

  private async getFulfilledQuantity(
    salesOrderId: string,
    productId: string,
  ): Promise<number> {
    const movements = await this.stockMovementRepository.find({
      where: {
        productId,
        movementType: StockMovementType.SALE,
        referenceId: salesOrderId,
      },
    });

    return movements.reduce((total, movement) => {
      return (
        total +
        (movement.movementType === StockMovementType.SALE
          ? movement.quantity
          : 0)
      );
    }, 0);
  }

  private async createStockMovement(
    productId: string,
    quantity: number,
    movementType: StockMovementType,
    reason: string,
    referenceId?: string,
    userId?: string,
  ): Promise<StockMovement> {
    // Get current product stock to calculate previous balance
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const previousBalance = Number(product.stockQuantity);
    const newBalance = previousBalance + quantity; // quantity is negative for sales

    return this.createStockMovementWithBalances(
      productId,
      quantity,
      previousBalance,
      newBalance,
      movementType,
      reason,
      referenceId,
      userId,
    );
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
    const stockMovementRepo = repoFor(
      manager,
      StockMovement,
      this.stockMovementRepository,
    );
    const movement = stockMovementRepo.create({
      productId,
      quantity,
      previousBalance,
      newBalance,
      movementType,
      reason,
      referenceId,
      referenceType: referenceId ? "sales_order" : null, // Set referenceType if referenceId is provided
      movementDate: new Date(),
    });

    return await stockMovementRepo.save(movement);
  }
}
