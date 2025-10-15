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

  // Product Information
  // Note: Product details (name, SKU/barcode) are accessed via the product relationship

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

  // Quality Information

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


  get varianceQuantity(): number {
    return Number(this.receivedQuantity) - Number(this.orderedQuantity);
  }

  get variancePercentage(): number {
    return Number(this.orderedQuantity) > 0
      ? (this.varianceQuantity / Number(this.orderedQuantity)) * 100
      : 0;
  }

  // Helper methods

  // Static method to create from PO item
  static fromPurchaseOrderItem(
    poItem: PurchaseOrderItem,
    receivedQty?: number,
  ): Partial<GoodsReceivedNoteItem> {
    const qty = receivedQty !== undefined ? receivedQty : Number(poItem.quantity);

    return {
      purchaseOrderItemId: poItem.id,
      productId: poItem.productId,
      productDescription: poItem.productDescription,
      unit: poItem.unit,
      orderedQuantity: Number(poItem.quantity),
      receivedQuantity: qty,
    };
  }

  // Get quality summary for reporting
  getQualitySummary(): {
    orderedQuantity: number;
    receivedQuantity: number;
    variance: number;
  } {
    return {
      orderedQuantity: Number(this.orderedQuantity),
      receivedQuantity: Number(this.receivedQuantity),
      variance: this.varianceQuantity,
    };
  }
}
