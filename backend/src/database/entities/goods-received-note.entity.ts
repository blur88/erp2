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

export enum GrnStatus {
  DRAFT = 'draft',
  RECEIVED = 'received',
  INSPECTED = 'inspected',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  PARTIALLY_ACCEPTED = 'partially_accepted',
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
    comment: 'Details of items received with quantities and condition',
  })
  @IsJSON()
  itemsReceived: Array<{
    productId: string;
    productSku: string;
    productName: string;
    orderedQuantity: number;
    receivedQuantity: number;
    acceptedQuantity?: number;
    rejectedQuantity?: number;
    unitCost: number;
    notes?: string;
    batchNumber?: string;
    expiryDate?: string;
    condition?: 'good' | 'damaged' | 'expired' | 'defective';
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
    comment: 'Total quantity received',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalQuantityReceived: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total quantity accepted',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalQuantityAccepted: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total quantity rejected',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalQuantityRejected: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total value of goods received',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalValue: number;

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

  // Computed properties
  get isFullyAccepted(): boolean {
    return Number(this.totalQuantityAccepted) === Number(this.totalQuantityReceived) && 
           Number(this.totalQuantityRejected) === 0;
  }

  get isPartiallyAccepted(): boolean {
    return Number(this.totalQuantityAccepted) > 0 && Number(this.totalQuantityRejected) > 0;
  }

  get isFullyRejected(): boolean {
    return Number(this.totalQuantityRejected) === Number(this.totalQuantityReceived) &&
           Number(this.totalQuantityAccepted) === 0;
  }

  get acceptanceRate(): number {
    return Number(this.totalQuantityReceived) > 0 
      ? (Number(this.totalQuantityAccepted) / Number(this.totalQuantityReceived)) * 100 
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
    if (this.itemsReceived && this.itemsReceived.length > 0) {
      this.totalQuantityReceived = this.itemsReceived.reduce(
        (sum, item) => sum + Number(item.receivedQuantity), 0
      );

      this.totalQuantityAccepted = this.itemsReceived.reduce(
        (sum, item) => sum + Number(item.acceptedQuantity || item.receivedQuantity), 0
      );

      this.totalQuantityRejected = this.itemsReceived.reduce(
        (sum, item) => sum + Number(item.rejectedQuantity || 0), 0
      );

      this.totalValue = this.itemsReceived.reduce(
        (sum, item) => sum + (Number(item.receivedQuantity) * Number(item.unitCost)), 0
      );
    }
  }

  // Helper methods
  updateStatus(): void {
    if (this.qualityInspected) {
      if (this.isFullyAccepted) {
        this.status = GrnStatus.ACCEPTED;
      } else if (this.isFullyRejected) {
        this.status = GrnStatus.REJECTED;
      } else if (this.isPartiallyAccepted) {
        this.status = GrnStatus.PARTIALLY_ACCEPTED;
      } else {
        this.status = GrnStatus.INSPECTED;
      }
    } else {
      this.status = GrnStatus.RECEIVED;
    }
  }

  performQualityInspection(
    inspectedByUserId: string, 
    inspectionResults: Array<{
      productId: string;
      acceptedQuantity: number;
      rejectedQuantity: number;
      condition?: string;
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
          acceptedQuantity: result.acceptedQuantity,
          rejectedQuantity: result.rejectedQuantity,
          condition: result.condition as any,
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
    totalReceived: number;
    totalAccepted: number;
    totalRejected: number;
    acceptanceRate: number;
    isLateDelivery: boolean;
    deliveryDelayDays: number;
  } {
    return {
      itemCount: this.itemsReceived?.length || 0,
      totalReceived: Number(this.totalQuantityReceived),
      totalAccepted: Number(this.totalQuantityAccepted),
      totalRejected: Number(this.totalQuantityRejected),
      acceptanceRate: this.acceptanceRate,
      isLateDelivery: this.isLateDelivery,
      deliveryDelayDays: this.deliveryDelayDays,
    };
  }

  // Validate that inspection quantities match received quantities
  validateInspectionQuantities(): boolean {
    if (!this.itemsReceived) return false;

    return this.itemsReceived.every(item => {
      const inspectedTotal = Number(item.acceptedQuantity || 0) + Number(item.rejectedQuantity || 0);
      return inspectedTotal <= Number(item.receivedQuantity);
    });
  }

  // Get items that failed quality inspection
  getFailedItems(): Array<{
    productSku: string;
    productName: string;
    rejectedQuantity: number;
    condition?: string;
    notes?: string;
  }> {
    if (!this.itemsReceived) return [];

    return this.itemsReceived
      .filter(item => Number(item.rejectedQuantity || 0) > 0)
      .map(item => ({
        productSku: item.productSku,
        productName: item.productName,
        rejectedQuantity: Number(item.rejectedQuantity || 0),
        condition: item.condition,
        notes: item.notes,
      }));
  }
}