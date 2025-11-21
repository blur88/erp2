import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsUUID,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Product } from './product.entity';

export enum StockMovementType {
  // Inward movements (increase stock)
  PURCHASE_RECEIPT = 'purchase_receipt',
  SALES_RETURN = 'sales_return',
  SALE_REVERSAL = 'sale_reversal', // Sales order unfulfillment
  PRODUCTION_RECEIPT = 'production_receipt',
  TRANSFER_IN = 'transfer_in',
  ADJUSTMENT_INCREASE = 'adjustment_increase',
  INITIAL_STOCK = 'initial_stock',

  // Outward movements (decrease stock)
  SALE = 'sale',
  PURCHASE_RETURN = 'purchase_return',
  PRODUCTION_CONSUMPTION = 'production_consumption',
  TRANSFER_OUT = 'transfer_out',
  ADJUSTMENT_DECREASE = 'adjustment_decrease',
  DAMAGE = 'damage',
  EXPIRY = 'expiry',
  THEFT = 'theft',
  LOSS = 'loss',
}

/**
 * Stock Movement entity for tracking all inventory movements
 * Provides comprehensive audit trail for stock changes
 */
@Entity('stock_movements')
@Index(['productId'])
@Index(['movementType'])
@Index(['movementDate'])
@Index(['referenceType', 'referenceId'])
@Index(['quantity'])
export class StockMovement extends BaseEntity {
  @Column({
    type: 'enum',
    enum: StockMovementType,
    comment: 'Type of stock movement',
  })
  @IsEnum(StockMovementType)
  movementType: StockMovementType;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Date and time of movement',
  })
  movementDate: Date;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Quantity moved (positive for inward, negative for outward)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Stock quantity before this movement',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  previousBalance: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Stock quantity after this movement',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  newBalance: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Unit cost/price at time of movement',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitValue?: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Total value of this movement',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  totalValue?: number;

  // Reference Information
  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Type of source document (sales_order, purchase_order, etc.)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceType?: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'ID of the source document',
  })
  @IsOptional()
  @IsUUID(4)
  referenceId?: string;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason or notes for this movement',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Additional notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Product ID',
  })
  productId: string;

  // Relationships
  @ManyToOne(() => Product, (product) => product.stockMovements, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  // Computed properties
  get isInward(): boolean {
    return [
      StockMovementType.PURCHASE_RECEIPT,
      StockMovementType.SALES_RETURN,
      StockMovementType.SALE_REVERSAL,
      StockMovementType.PRODUCTION_RECEIPT,
      StockMovementType.TRANSFER_IN,
      StockMovementType.ADJUSTMENT_INCREASE,
      StockMovementType.INITIAL_STOCK,
    ].includes(this.movementType);
  }

  get isOutward(): boolean {
    return [
      StockMovementType.SALE,
      StockMovementType.PURCHASE_RETURN,
      StockMovementType.PRODUCTION_CONSUMPTION,
      StockMovementType.TRANSFER_OUT,
      StockMovementType.ADJUSTMENT_DECREASE,
      StockMovementType.DAMAGE,
      StockMovementType.EXPIRY,
      StockMovementType.THEFT,
      StockMovementType.LOSS,
    ].includes(this.movementType);
  }

  get isAdjustment(): boolean {
    return [
      StockMovementType.ADJUSTMENT_INCREASE,
      StockMovementType.ADJUSTMENT_DECREASE,
    ].includes(this.movementType);
  }

  get absoluteQuantity(): number {
    return Math.abs(Number(this.quantity));
  }

  // Hooks
  @BeforeInsert()
  calculateTotalValue() {
    if (this.unitValue && this.quantity) {
      this.totalValue = Math.abs(Number(this.quantity)) * Number(this.unitValue);
    }
  }

  // Helper methods
  reverse(reason: string): StockMovement {
    const reversal = new StockMovement();
    reversal.movementType = this.getReversalType();
    reversal.movementDate = new Date();
    reversal.quantity = -Number(this.quantity);
    reversal.previousBalance = Number(this.newBalance);
    reversal.newBalance = Number(this.previousBalance);
    reversal.unitValue = this.unitValue;
    reversal.totalValue = this.totalValue;
    reversal.reason = `Reversal of movement ${this.id}: ${reason}`;
    reversal.referenceType = 'stock_movement_reversal';
    reversal.referenceId = this.id;
    reversal.productId = this.productId;

    return reversal;
  }

  private getReversalType(): StockMovementType {
    const reversalMap: Record<StockMovementType, StockMovementType> = {
      [StockMovementType.PURCHASE_RECEIPT]: StockMovementType.PURCHASE_RETURN,
      [StockMovementType.SALES_RETURN]: StockMovementType.SALE,
      [StockMovementType.SALE_REVERSAL]: StockMovementType.SALE,
      [StockMovementType.PRODUCTION_RECEIPT]: StockMovementType.PRODUCTION_CONSUMPTION,
      [StockMovementType.TRANSFER_IN]: StockMovementType.TRANSFER_OUT,
      [StockMovementType.ADJUSTMENT_INCREASE]: StockMovementType.ADJUSTMENT_DECREASE,
      [StockMovementType.INITIAL_STOCK]: StockMovementType.ADJUSTMENT_DECREASE,
      [StockMovementType.SALE]: StockMovementType.SALES_RETURN,
      [StockMovementType.PURCHASE_RETURN]: StockMovementType.PURCHASE_RECEIPT,
      [StockMovementType.PRODUCTION_CONSUMPTION]: StockMovementType.PRODUCTION_RECEIPT,
      [StockMovementType.TRANSFER_OUT]: StockMovementType.TRANSFER_IN,
      [StockMovementType.ADJUSTMENT_DECREASE]: StockMovementType.ADJUSTMENT_INCREASE,
      [StockMovementType.DAMAGE]: StockMovementType.ADJUSTMENT_INCREASE,
      [StockMovementType.EXPIRY]: StockMovementType.ADJUSTMENT_INCREASE,
      [StockMovementType.THEFT]: StockMovementType.ADJUSTMENT_INCREASE,
      [StockMovementType.LOSS]: StockMovementType.ADJUSTMENT_INCREASE,
    };

    return reversalMap[this.movementType] || StockMovementType.ADJUSTMENT_INCREASE;
  }

  // Static factory methods
  static createSaleMovement(
    productId: string,
    quantity: number,
    unitPrice: number,
    referenceId: string
  ): Partial<StockMovement> {
    return {
      productId,
      movementType: StockMovementType.SALE,
      quantity: -Math.abs(quantity), // Negative for outward
      unitValue: unitPrice,
      referenceType: 'sales_order',
      referenceId,
    };
  }

  static createPurchaseReceiptMovement(
    productId: string,
    quantity: number,
    unitCost: number,
    referenceId: string
  ): Partial<StockMovement> {
    return {
      productId,
      movementType: StockMovementType.PURCHASE_RECEIPT,
      quantity: Math.abs(quantity), // Positive for inward
      unitValue: unitCost,
      referenceType: 'purchase_order',
      referenceId,
    };
  }

  static createAdjustmentMovement(
    productId: string,
    quantityAdjustment: number,
    reason: string,
    adjustmentId: string
  ): Partial<StockMovement> {
    const movementType = quantityAdjustment >= 0
      ? StockMovementType.ADJUSTMENT_INCREASE
      : StockMovementType.ADJUSTMENT_DECREASE;

    return {
      productId,
      movementType,
      quantity: quantityAdjustment,
      reason,
      referenceType: 'stock_adjustment',
      referenceId: adjustmentId,
    };
  }

  // Get movement description for reporting
  getDescription(): string {
    const typeDescriptions: Record<StockMovementType, string> = {
      [StockMovementType.PURCHASE_RECEIPT]: 'Purchase Receipt',
      [StockMovementType.SALES_RETURN]: 'Sales Return',
      [StockMovementType.SALE_REVERSAL]: 'Sales Order Unfulfill',
      [StockMovementType.PRODUCTION_RECEIPT]: 'Production Receipt',
      [StockMovementType.TRANSFER_IN]: 'Transfer In',
      [StockMovementType.ADJUSTMENT_INCREASE]: 'Stock Increase',
      [StockMovementType.INITIAL_STOCK]: 'Initial Stock',
      [StockMovementType.SALE]: 'Sale',
      [StockMovementType.PURCHASE_RETURN]: 'Purchase Return',
      [StockMovementType.PRODUCTION_CONSUMPTION]: 'Production Use',
      [StockMovementType.TRANSFER_OUT]: 'Transfer Out',
      [StockMovementType.ADJUSTMENT_DECREASE]: 'Stock Decrease',
      [StockMovementType.DAMAGE]: 'Damage',
      [StockMovementType.EXPIRY]: 'Expiry',
      [StockMovementType.THEFT]: 'Theft',
      [StockMovementType.LOSS]: 'Loss',
    };

    return typeDescriptions[this.movementType] || 'Unknown Movement';
  }
}