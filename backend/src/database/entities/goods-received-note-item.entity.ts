import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  MaxLength,
  IsDecimal,
  Min,
  IsInt,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { GoodsReceivedNote } from './goods-received-note.entity';
import { Product } from './product.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';

/**
 * Goods Received Note Item entity for individual line items in GRNs
 * Tracks received quantities and quality inspection results
 */
@Entity('goods_received_note_items')
@Index(['grnId'])
@Index(['productId'])
@Index(['purchaseOrderItemId'])
export class GoodsReceivedNoteItem extends BaseEntity {
  @Column({
    type: 'int',
    comment: 'Line item sequence number within the GRN',
  })
  @IsInt()
  @Min(1)
  lineNumber: number;

  // Product Information (captured from PO item at time of receipt)
  @Column({
    type: 'varchar',
    length: 50,
    comment: 'Product SKU at time of receipt',
  })
  @IsString()
  @MaxLength(50)
  productSku: string;

  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Product name at time of receipt',
  })
  @IsString()
  @MaxLength(200)
  productName: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Product description at time of receipt',
  })
  @IsOptional()
  @IsString()
  productDescription?: string;

  @Column({
    type: 'varchar',
    length: 20,
    comment: 'Unit of measurement',
  })
  @IsString()
  @MaxLength(20)
  unit: string;

  // Quantity Information
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Ordered quantity (from PO)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  orderedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Quantity received',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  receivedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Quantity accepted (passed quality check)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  acceptedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Quantity rejected (failed quality check)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  rejectedQuantity: number;

  // Pricing
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Unit cost at time of receipt',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Total amount for this line (receivedQuantity × unitCost)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalAmount: number;

  // Quality Information
  @Column({
    type: 'varchar',
    length: 20,
    default: 'good',
    comment: 'Item condition at receipt',
  })
  @IsString()
  condition: 'good' | 'damaged' | 'expired' | 'defective';

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Quality inspection notes',
  })
  @IsOptional()
  @IsString()
  qualityNotes?: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Rejection reason if applicable',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;

  // Batch and Tracking
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Batch or lot number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Expiry date for batch',
  })
  @IsOptional()
  expiryDate?: Date;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Storage location',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  storageLocation?: string;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Item-specific notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Goods Received Note ID',
  })
  grnId: string;

  @Column({
    type: 'uuid',
    comment: 'Product ID',
  })
  productId: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Reference to original purchase order item',
  })
  @IsOptional()
  purchaseOrderItemId?: string;

  // Relationships
  @ManyToOne(() => GoodsReceivedNote, (grn) => grn.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'grnId' })
  grn: GoodsReceivedNote;

  @ManyToOne(() => Product, {
    onDelete: 'RESTRICT',
    eager: false,
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => PurchaseOrderItem, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: false,
  })
  @JoinColumn({ name: 'purchaseOrderItemId' })
  purchaseOrderItem?: PurchaseOrderItem;

  // Computed properties
  get isFullyReceived(): boolean {
    return Number(this.receivedQuantity) >= Number(this.orderedQuantity);
  }

  get hasQualityIssues(): boolean {
    return Number(this.rejectedQuantity) > 0 || this.condition !== 'good';
  }

  get acceptanceRate(): number {
    const totalInspected = Number(this.acceptedQuantity) + Number(this.rejectedQuantity);
    return totalInspected > 0
      ? (Number(this.acceptedQuantity) / totalInspected) * 100
      : 0;
  }

  get varianceQuantity(): number {
    return Number(this.receivedQuantity) - Number(this.orderedQuantity);
  }

  get variancePercentage(): number {
    return Number(this.orderedQuantity) > 0
      ? (this.varianceQuantity / Number(this.orderedQuantity)) * 100
      : 0;
  }

  // Helper methods
  calculateTotal(): void {
    this.totalAmount = Number(this.receivedQuantity) * Number(this.unitCost);
  }

  inspectItem(acceptedQty: number, rejectedQty: number, notes?: string, reason?: string): void {
    const totalInspected = Number(acceptedQty) + Number(rejectedQty);
    if (totalInspected > Number(this.receivedQuantity)) {
      throw new Error('Cannot inspect more than received quantity');
    }

    this.acceptedQuantity = Number(acceptedQty);
    this.rejectedQuantity = Number(rejectedQty);

    if (notes) {
      this.qualityNotes = notes;
    }

    if (reason && Number(rejectedQty) > 0) {
      this.rejectionReason = reason;
    }

    // Auto-set condition based on rejection
    if (Number(rejectedQty) === 0) {
      this.condition = 'good';
    } else if (Number(acceptedQty) === 0) {
      this.condition = 'defective';
    }
  }

  // Static method to create from PO item
  static fromPurchaseOrderItem(
    poItem: PurchaseOrderItem,
    receivedQty?: number,
  ): Partial<GoodsReceivedNoteItem> {
    const qty = receivedQty !== undefined ? receivedQty : Number(poItem.quantity);

    return {
      purchaseOrderItemId: poItem.id,
      productId: poItem.productId,
      productSku: poItem.productSku,
      productName: poItem.productName,
      productDescription: poItem.productDescription,
      unit: poItem.unit,
      orderedQuantity: Number(poItem.quantity),
      receivedQuantity: qty,
      acceptedQuantity: qty,
      rejectedQuantity: 0,
      unitCost: Number(poItem.unitCost),
      condition: 'good',
    };
  }

  // Get quality summary for reporting
  getQualitySummary(): {
    totalReceived: number;
    totalAccepted: number;
    totalRejected: number;
    acceptanceRate: number;
    hasIssues: boolean;
    condition: string;
  } {
    return {
      totalReceived: Number(this.receivedQuantity),
      totalAccepted: Number(this.acceptedQuantity),
      totalRejected: Number(this.rejectedQuantity),
      acceptanceRate: this.acceptanceRate,
      hasIssues: this.hasQualityIssues,
      condition: this.condition,
    };
  }
}
