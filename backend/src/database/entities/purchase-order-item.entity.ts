import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from "typeorm";
import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsInt,
  IsDate,
} from "class-validator";
import { BaseEntity } from "./base.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { Product } from "./product.entity";

export enum PurchaseOrderItemStatus {
  PENDING = "pending",
  APPROVED = "approved",
  ORDERED = "ordered",
  PARTIALLY_RECEIVED = "partially_received",
  RECEIVED = "received",
  CANCELLED = "cancelled",
}

/**
 * Purchase Order Item entity for individual line items in purchase orders
 * Tracks detailed product information and pricing at time of order
 */
@Entity("purchase_order_items")
@Index(["purchaseOrderId"])
@Index(["productId"])
@Index(["status"])
export class PurchaseOrderItem extends BaseEntity {
  @Column({
    type: "int",
    comment: "Line item sequence number within the order",
  })
  @IsInt()
  @Min(1)
  lineNumber: number;

  @Column({
    type: "enum",
    enum: PurchaseOrderItemStatus,
    default: PurchaseOrderItemStatus.PENDING,
    comment: "Item status",
  })
  @IsEnum(PurchaseOrderItemStatus)
  status: PurchaseOrderItemStatus;

  // Product Information (captured at time of order)
  // Note: productName and productSku fields removed - available via product relationship

  // Product description is retrieved from product relationship
  // No need to store product description separately as it's available via product.description

  // Quantity and Pricing
  @Column({
    type: "decimal",
    precision: 15,
    scale: 4,
    comment: "Ordered quantity",
  })
  @IsDecimal({ decimal_digits: "0,4" })
  @Min(0)
  quantity: number;

  @Column({
    type: "decimal",
    precision: 15,
    scale: 4,
    default: 0,
    comment: "Received quantity so far",
  })
  @IsDecimal({ decimal_digits: "0,4" })
  @Min(0)
  receivedQuantity: number;

  @Column({
    type: "decimal",
    precision: 15,
    scale: 4,
    comment: "Unit cost price",
  })
  @IsDecimal({ decimal_digits: "0,4" })
  @Min(0)
  unitCost: number;

  @Column({
    type: "varchar",
    length: 20,
    default: "percentage",
    comment: "Discount type: percentage or fixed_amount",
  })
  @IsString()
  discountType: "percentage" | "fixed_amount" = "percentage";

  @Column({
    type: "decimal",
    precision: 5,
    scale: 2,
    default: 0,
    comment: "Line item discount percentage",
  })
  @IsDecimal({ decimal_digits: "0,2" })
  @Min(0)
  discountPercent: number;

  @Column({
    type: "decimal",
    precision: 15,
    scale: 4,
    default: 0,
    comment:
      "Line item discount amount (total for all units or per-unit based on discountType)",
  })
  @IsDecimal({ decimal_digits: "0,4" })
  @Min(0)
  discountAmount: number;

  @Column({
    type: "decimal",
    precision: 15,
    scale: 4,
    default: 0,
    comment: "Line item total amount (after discount)",
  })
  @IsDecimal({ decimal_digits: "0,4" })
  @Min(0)
  totalAmount: number;

  // Delivery Information
  // Note: deliveredDate removed - delivery tracking now handled at purchase order level

  // Quality Information removed - quality acceptance now tracked via receivedQuantity only

  // Foreign Keys
  @Column({
    type: "uuid",
    comment: "Purchase order ID",
  })
  purchaseOrderId: string;

  @Column({
    type: "uuid",
    comment: "Product ID",
  })
  productId: string;

  // Relationships
  @ManyToOne(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.items, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "purchaseOrderId" })
  purchaseOrder: PurchaseOrder;

  @ManyToOne(() => Product, {
    // Removed back-reference to avoid circular relation issues
    onDelete: "RESTRICT",
    eager: false, // Disabled eager loading to prevent automatic relation resolution
  })
  @JoinColumn({ name: "productId" })
  product: Product;

  // Computed properties
  get remainingQuantity(): number {
    return Number(this.quantity) - Number(this.receivedQuantity);
  }

  get isFullyReceived(): boolean {
    return Number(this.receivedQuantity) >= Number(this.quantity);
  }

  get isPartiallyReceived(): boolean {
    return Number(this.receivedQuantity) > 0 && !this.isFullyReceived;
  }

  get lineTotal(): number {
    return Number(this.quantity) * Number(this.unitCost);
  }

  // Delivery performance tracking moved to purchase order level
  // Individual item delivery performance is no longer tracked
  get deliveryPerformance(): "on_time" | "late" | "early" | "pending" {
    // Always return pending since item-level delivery tracking is removed
    return "pending";
  }

  // Hooks
  @BeforeInsert()
  @BeforeUpdate()
  calculateTotals() {
    // Ensure discountType has a default
    if (!this.discountType) {
      this.discountType = "percentage";
    }

    let unitDiscount = 0;
    let totalDiscountAmount = 0;

    console.log("[calculateTotals] discountType:", this.discountType);
    console.log("[calculateTotals] discountAmount:", this.discountAmount);
    console.log("[calculateTotals] discountPercent:", this.discountPercent);
    console.log("[calculateTotals] unitCost:", this.unitCost);
    console.log("[calculateTotals] quantity:", this.quantity);

    if (this.discountType === "percentage") {
      // Percentage discount: apply to unit price
      unitDiscount =
        this.discountPercent > 0
          ? (Number(this.unitCost) * Number(this.discountPercent)) / 100
          : 0;
      totalDiscountAmount = unitDiscount * Number(this.quantity);
    } else if (this.discountType === "fixed_amount") {
      // Fixed amount discount: discountAmount is per unit
      unitDiscount = Number(this.discountAmount) || 0;
      totalDiscountAmount = unitDiscount * Number(this.quantity);
    }

    console.log("[calculateTotals] unitDiscount:", unitDiscount);
    console.log("[calculateTotals] totalDiscountAmount:", totalDiscountAmount);

    // Discounted unit price
    const discountedUnitPrice = Number(this.unitCost) - unitDiscount;

    // Store total discount amount
    if (this.discountType === "percentage") {
      this.discountAmount = totalDiscountAmount;
    }

    // Calculate total amount: discounted unit price × quantity
    this.totalAmount = discountedUnitPrice * Number(this.quantity);

    console.log("[calculateTotals] totalAmount:", this.totalAmount);
  }

  @BeforeInsert()
  @BeforeUpdate()
  updateStatus() {
    if (this.isFullyReceived) {
      this.status = PurchaseOrderItemStatus.RECEIVED;
      // deliveredDate tracking removed - delivery date now tracked at purchase order level
    } else if (this.isPartiallyReceived) {
      this.status = PurchaseOrderItemStatus.PARTIALLY_RECEIVED;
    }
  }

  // Helper methods
  receiveQuantity(quantity: number): void {
    const receiveQty = Math.min(Number(quantity), this.remainingQuantity);
    this.receivedQuantity = Number(this.receivedQuantity) + receiveQty;
    this.updateStatus();
  }

  approve(): void {
    if (this.status === PurchaseOrderItemStatus.PENDING) {
      this.status = PurchaseOrderItemStatus.APPROVED;
    }
  }

  markAsOrdered(): void {
    if (this.status === PurchaseOrderItemStatus.APPROVED) {
      this.status = PurchaseOrderItemStatus.ORDERED;
    }
  }

  cancel(): void {
    if (this.status !== PurchaseOrderItemStatus.RECEIVED) {
      this.status = PurchaseOrderItemStatus.CANCELLED;
    }
  }

  // Static method to create from product
  static fromProduct(
    product: Product,
    quantity: number,
    unitCost?: number,
  ): Partial<PurchaseOrderItem> {
    return {
      productId: product.id,
      quantity,
      unitCost: unitCost || Number(product.baseCost),
    };
  }

  // Item-level delivery performance metrics removed
  // Delivery performance is now tracked at purchase order level only
  getDeliveryPerformanceMetrics(): {
    daysLate: number;
    isOnTime: boolean;
    isLate: boolean;
    isEarly: boolean;
  } {
    // Return neutral values since item-level delivery tracking is removed
    return {
      daysLate: 0,
      isOnTime: false,
      isLate: false,
      isEarly: false,
    };
  }
}
