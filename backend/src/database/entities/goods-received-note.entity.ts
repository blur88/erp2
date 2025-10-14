import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsDate,
  IsJSON,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { Supplier } from './supplier.entity';
import { User } from './user.entity';
import { GoodsReceivedNoteItem } from './goods-received-note-item.entity';

export enum GrnStatus {
  DRAFT = 'draft',
  RECEIVED = 'received',
}

export enum GrnType {
  STANDARD = 'standard',
  RETURN = 'return',
  TRANSFER = 'transfer',
}

/**
 * Goods Received Note (GRN) entity for tracking receipt of goods from suppliers
 * Links to purchase orders and tracks quality inspection results
 */
@Entity('goods_received_notes')
@Index(['grnNumber'], { unique: true })
@Index(['purchaseOrderId'])
@Index(['supplierId'])
@Index(['receivedByUserId'])
@Index(['status'])
@Index(['receivedDate'])
@Index(['type'])
export class GoodsReceivedNote extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 30,
    unique: true,
    comment: 'Unique GRN number',
  })
  @IsString()
  @MaxLength(30)
  grnNumber: string;

  @Column({
    type: 'enum',
    enum: GrnType,
    default: GrnType.STANDARD,
    comment: 'Type of goods receipt',
  })
  @IsEnum(GrnType)
  type: GrnType;

  @Column({
    type: 'enum',
    enum: GrnStatus,
    default: GrnStatus.DRAFT,
    comment: 'GRN status',
  })
  @IsEnum(GrnStatus)
  status: GrnStatus;

  @Column({
    type: 'date',
    comment: 'Date goods were received',
  })
  @IsDate()
  receivedDate: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Date of quality inspection',
  })
  @IsOptional()
  @IsDate()
  inspectedDate?: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Expected delivery date',
  })
  @IsOptional()
  @IsDate()
  expectedDate?: Date;

  // Delivery Information
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Delivery reference/invoice number from supplier',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryReference?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Vehicle/transport details',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleDetails?: string;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Driver or delivery person name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  driverName?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Driver contact number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  driverContact?: string;

  // Items received (denormalized for performance and audit)
  @Column({
    type: 'json',
    comment: 'Details of items received with quantities',
  })
  @IsJSON()
  itemsReceived: Array<{
    productId: string;
    productSku: string;
    productName: string;
    orderedQuantity: number;
    receivedQuantity: number;
    notes?: string;
    batchNumber?: string;
    expiryDate?: string;
  }>;

  // Quality Inspection
  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether quality inspection was performed',
  })
  @IsBoolean()
  qualityInspected: boolean;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Quality inspector name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  inspectorName?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Quality inspection notes',
  })
  @IsOptional()
  @IsString()
  inspectionNotes?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Quality test results and metrics',
  })
  @IsOptional()
  qualityTestResults?: Record<string, any>;

  // Totals
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total quantity ordered (from PO)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalQuantityOrdered: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total quantity received',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalQuantityReceived: number;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'General notes about the delivery',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Internal processing notes',
  })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Photos or documents related to delivery',
  })
  @IsOptional()
  attachments?: Array<{
    filename: string;
    url: string;
    type: 'photo' | 'document';
    description?: string;
  }>;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Additional metadata',
  })
  @IsOptional()
  metadata?: Record<string, any>;

  // Foreign Keys
  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Related purchase order ID',
  })
  @IsOptional()
  purchaseOrderId?: string;

  @Column({
    type: 'uuid',
    comment: 'Supplier ID',
  })
  supplierId: string;

  @Column({
    type: 'uuid',
    nullable: true, // Nullable since auth was removed
    comment: 'User who received the goods',
  })
  @IsOptional()
  receivedByUserId?: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'User who performed quality inspection',
  })
  @IsOptional()
  inspectedByUserId?: string;

  // Relationships
  @ManyToOne(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.goodsReceivedNotes, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder?: PurchaseOrder;

  @ManyToOne(() => Supplier, (supplier) => supplier.goodsReceivedNotes, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'receivedByUserId' })
  receivedByUser?: User;

  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'inspectedByUserId' })
  inspectedByUser?: User;

  @OneToMany(() => GoodsReceivedNoteItem, (item) => item.grn, {
    cascade: true,
    eager: false,
  })
  items: GoodsReceivedNoteItem[];

  // Computed properties
  get isFullyReceived(): boolean {
    return Number(this.totalQuantityReceived) >= Number(this.totalQuantityOrdered);
  }

  get isPartiallyReceived(): boolean {
    return Number(this.totalQuantityReceived) > 0 &&
           Number(this.totalQuantityReceived) < Number(this.totalQuantityOrdered);
  }

  get receivedPercentage(): number {
    return Number(this.totalQuantityOrdered) > 0
      ? (Number(this.totalQuantityReceived) / Number(this.totalQuantityOrdered)) * 100
      : 0;
  }

  get isLateDelivery(): boolean {
    if (!this.expectedDate) return false;
    return this.receivedDate > this.expectedDate;
  }

  get deliveryDelayDays(): number {
    if (!this.expectedDate || !this.isLateDelivery) return 0;
    const diffTime = this.receivedDate.getTime() - this.expectedDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Hooks
  @BeforeInsert()
  generateGrnNumber() {
    // GRN number will be set by the service using sequential numbering
    // This hook is kept for backward compatibility but does nothing
    // if grnNumber is already set by the service
  }

  @BeforeInsert()
  calculateTotals() {
    // Calculate from items relation if available, otherwise from JSON (for backward compatibility)
    const itemsSource = this.items?.length > 0 ? this.items : this.itemsReceived;

    if (itemsSource && itemsSource.length > 0) {
      this.totalQuantityOrdered = itemsSource.reduce(
        (sum, item) => sum + Number(item.orderedQuantity || 0), 0
      );

      this.totalQuantityReceived = itemsSource.reduce(
        (sum, item) => sum + Number(item.receivedQuantity || 0), 0
      );
    }
  }

  // Helper methods
  updateStatus(): void {
    // Simplified status logic - only DRAFT or RECEIVED
    if (this.receivedDate) {
      this.status = GrnStatus.RECEIVED;
    } else {
      this.status = GrnStatus.DRAFT;
    }
  }

  performQualityInspection(
    inspectedByUserId: string,
    inspectionResults: Array<{
      productId: string;
      receivedQuantity: number;
      notes?: string;
    }>,
    inspectionNotes?: string
  ): void {
    this.qualityInspected = true;
    this.inspectedDate = new Date();
    this.inspectedByUserId = inspectedByUserId;
    this.inspectionNotes = inspectionNotes;

    // Update item results
    this.itemsReceived = this.itemsReceived.map(item => {
      const result = inspectionResults.find(r => r.productId === item.productId);
      if (result) {
        return {
          ...item,
          receivedQuantity: result.receivedQuantity,
          notes: result.notes,
        };
      }
      return item;
    });

    // Recalculate totals
    this.calculateTotals();
    this.updateStatus();
  }

  addAttachment(filename: string, url: string, type: 'photo' | 'document', description?: string): void {
    if (!this.attachments) {
      this.attachments = [];
    }

    this.attachments.push({
      filename,
      url,
      type,
      description,
    });
  }

  // Get summary for reporting
  getSummary(): {
    itemCount: number;
    totalOrdered: number;
    totalReceived: number;
    receivedPercentage: number;
    isLateDelivery: boolean;
    deliveryDelayDays: number;
  } {
    return {
      itemCount: this.itemsReceived?.length || 0,
      totalOrdered: Number(this.totalQuantityOrdered),
      totalReceived: Number(this.totalQuantityReceived),
      receivedPercentage: this.receivedPercentage,
      isLateDelivery: this.isLateDelivery,
      deliveryDelayDays: this.deliveryDelayDays,
    };
  }

  // Get items with variance (received != ordered)
  getItemsWithVariance(): Array<{
    productSku: string;
    productName: string;
    orderedQuantity: number;
    receivedQuantity: number;
    variance: number;
    notes?: string;
  }> {
    if (!this.itemsReceived) return [];

    return this.itemsReceived
      .filter(item => Number(item.receivedQuantity || 0) !== Number(item.orderedQuantity || 0))
      .map(item => ({
        productSku: item.productSku,
        productName: item.productName,
        orderedQuantity: Number(item.orderedQuantity || 0),
        receivedQuantity: Number(item.receivedQuantity || 0),
        variance: Number(item.receivedQuantity || 0) - Number(item.orderedQuantity || 0),
        notes: item.notes,
      }));
  }
}