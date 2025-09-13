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
  IsDate,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Product } from './product.entity';

export enum StockAdjustmentType {
  PHYSICAL_COUNT = 'physical_count',
  DAMAGE = 'damage',
  EXPIRY = 'expiry',
  THEFT = 'theft',
  LOSS = 'loss',
  FOUND = 'found',
  CORRECTION = 'correction',
  WRITE_OFF = 'write_off',
  REVALUATION = 'revaluation',
}

export enum StockAdjustmentStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}

/**
 * Stock Adjustment entity for manual stock corrections
 * Provides proper approval workflow and audit trail for inventory adjustments
 */
@Entity('stock_adjustments')
@Index(['adjustmentNumber'], { unique: true })
@Index(['productId'])
@Index(['type'])
@Index(['status'])
@Index(['adjustmentDate'])
@Index(['adjustedByUserId'])
@Index(['approvedByUserId'])
export class StockAdjustment extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 30,
    unique: true,
    comment: 'Unique adjustment number',
  })
  @IsString()
  @MaxLength(30)
  adjustmentNumber: string;

  @Column({
    type: 'enum',
    enum: StockAdjustmentType,
    comment: 'Type of stock adjustment',
  })
  @IsEnum(StockAdjustmentType)
  type: StockAdjustmentType;

  @Column({
    type: 'enum',
    enum: StockAdjustmentStatus,
    default: StockAdjustmentStatus.DRAFT,
    comment: 'Adjustment status',
  })
  @IsEnum(StockAdjustmentStatus)
  status: StockAdjustmentStatus;

  @Column({
    type: 'date',
    comment: 'Date of adjustment',
  })
  @IsDate()
  adjustmentDate: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Date when adjustment was approved',
  })
  @IsOptional()
  @IsDate()
  approvedDate?: Date;

  // Stock Quantities
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'System stock quantity before adjustment',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  systemQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Actual physical quantity counted/found',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  actualQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Adjustment quantity (difference)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  adjustmentQuantity: number;

  // Valuation
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Unit cost at time of adjustment',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  unitCost?: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Total value impact of adjustment',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  totalValueImpact?: number;

  // Location Information
  @Column({
    type: 'varchar',
    length: 50,
    default: 'MAIN',
    comment: 'Warehouse/location code',
  })
  @IsString()
  @MaxLength(50)
  locationCode: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Bin/shelf location within warehouse',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  binLocation?: string;

  // Batch/Lot Information
  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Batch or lot number being adjusted',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  batchNumber?: string;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Expiry date of batch/lot',
  })
  @IsOptional()
  expiryDate?: Date;

  // Reason and Documentation
  @Column({
    type: 'text',
    comment: 'Reason for adjustment',
  })
  @IsString()
  reason: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Additional notes and details',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Approval or rejection notes',
  })
  @IsOptional()
  @IsString()
  approvalNotes?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Supporting documents or photos',
  })
  @IsOptional()
  attachments?: Array<{
    filename: string;
    url: string;
    type: 'photo' | 'document';
    description?: string;
  }>;

  // Physical Count Details (if applicable)
  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Name of person who performed physical count',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  countedBy?: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When physical count was performed',
  })
  @IsOptional()
  countedAt?: Date;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Count verification details',
  })
  @IsOptional()
  countDetails?: {
    countMethod: string;
    countTeam?: string[];
    verifiedCount?: boolean;
    recountPerformed?: boolean;
    discrepancyInvestigated?: boolean;
  };

  // Additional Information
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
    comment: 'Product ID',
  })
  productId: string;

  @Column({
    type: 'varchar',
    length: 100,
    default: 'system',
    comment: 'User who initiated the adjustment',
  })
  @IsString()
  @MaxLength(100)
  adjustedBy: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'User who approved the adjustment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  approvedBy?: string;

  // Relationships
  @ManyToOne(() => Product, (product) => product.stockAdjustments, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  // Computed properties
  get isIncrease(): boolean {
    return Number(this.adjustmentQuantity) > 0;
  }

  get isDecrease(): boolean {
    return Number(this.adjustmentQuantity) < 0;
  }

  get adjustmentPercent(): number {
    return Number(this.systemQuantity) > 0 
      ? (Number(this.adjustmentQuantity) / Number(this.systemQuantity)) * 100 
      : 0;
  }

  get isPending(): boolean {
    return [StockAdjustmentStatus.DRAFT, StockAdjustmentStatus.PENDING_APPROVAL].includes(this.status);
  }

  get isCompleted(): boolean {
    return this.status === StockAdjustmentStatus.COMPLETED;
  }

  get canApprove(): boolean {
    return this.status === StockAdjustmentStatus.PENDING_APPROVAL;
  }

  get canReject(): boolean {
    return this.status === StockAdjustmentStatus.PENDING_APPROVAL;
  }

  // Hooks
  @BeforeInsert()
  generateAdjustmentNumber() {
    if (!this.adjustmentNumber) {
      const year = new Date().getFullYear();
      const timestamp = Date.now().toString(36).toUpperCase();
      this.adjustmentNumber = `ADJ-${year}-${timestamp}`;
    }
  }

  @BeforeInsert()
  calculateAdjustmentQuantity() {
    this.adjustmentQuantity = Number(this.actualQuantity) - Number(this.systemQuantity);
  }

  @BeforeInsert()
  calculateValueImpact() {
    if (this.unitCost) {
      this.totalValueImpact = Number(this.adjustmentQuantity) * Number(this.unitCost);
    }
  }

  // Helper methods
  submitForApproval(): void {
    if (this.status === StockAdjustmentStatus.DRAFT) {
      this.status = StockAdjustmentStatus.PENDING_APPROVAL;
    }
  }

  approve(approvedBy: string = 'system', approvalNotes?: string): void {
    if (this.canApprove) {
      this.status = StockAdjustmentStatus.APPROVED;
      this.approvedBy = approvedBy;
      this.approvedDate = new Date();
      if (approvalNotes) {
        this.approvalNotes = approvalNotes;
      }
    }
  }

  reject(rejectedBy: string = 'system', rejectionReason: string): void {
    if (this.canReject) {
      this.status = StockAdjustmentStatus.REJECTED;
      this.approvedBy = rejectedBy;
      this.approvalNotes = `Rejected: ${rejectionReason}`;
    }
  }

  complete(): void {
    if (this.status === StockAdjustmentStatus.APPROVED) {
      this.status = StockAdjustmentStatus.COMPLETED;
    }
  }

  cancel(reason?: string): void {
    if (this.isPending) {
      this.status = StockAdjustmentStatus.CANCELLED;
      if (reason) {
        this.notes = `${this.notes || ''}\nCancelled: ${reason}`;
      }
    }
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

  updateCountDetails(details: {
    countMethod: string;
    countTeam?: string[];
    verifiedCount?: boolean;
    recountPerformed?: boolean;
    discrepancyInvestigated?: boolean;
  }): void {
    this.countDetails = details;
  }

  // Validation methods
  requiresApproval(): boolean {
    const significantAmount = Math.abs(Number(this.totalValueImpact || 0)) > 100; // $100 threshold
    const significantPercent = Math.abs(this.adjustmentPercent) > 10; // 10% threshold
    
    return significantAmount || significantPercent || 
           [StockAdjustmentType.THEFT, StockAdjustmentType.WRITE_OFF].includes(this.type);
  }

  validateAdjustment(): Array<string> {
    const errors: string[] = [];

    // Validate quantities
    if (Number(this.systemQuantity) < 0) {
      errors.push('System quantity cannot be negative');
    }

    if (Number(this.actualQuantity) < 0) {
      errors.push('Physical quantity cannot be negative');
    }

    // Validate reason
    if (!this.reason || this.reason.trim().length < 10) {
      errors.push('Reason must be at least 10 characters long');
    }

    // Validate large adjustments
    if (Math.abs(this.adjustmentPercent) > 50 && !this.countDetails) {
      errors.push('Large adjustments require count verification details');
    }

    return errors;
  }

  // Static factory methods
  static createPhysicalCountAdjustment(
    productId: string,
    systemQty: number,
    physicalQty: number,
    countedBy: string,
    reason: string,
    adjustedBy: string = 'system'
  ): Partial<StockAdjustment> {
    return {
      productId,
      type: StockAdjustmentType.PHYSICAL_COUNT,
      systemQuantity: systemQty,
      actualQuantity: physicalQty,
      countedBy,
      countedAt: new Date(),
      reason,
      adjustmentDate: new Date(),
      adjustedBy,
    };
  }

  static createDamageAdjustment(
    productId: string,
    systemQty: number,
    damagedQty: number,
    reason: string,
    adjustedBy: string = 'system'
  ): Partial<StockAdjustment> {
    return {
      productId,
      type: StockAdjustmentType.DAMAGE,
      systemQuantity: systemQty,
      actualQuantity: systemQty - damagedQty,
      reason,
      adjustmentDate: new Date(),
      adjustedBy,
    };
  }

  // Get summary for reporting
  getSummary(): {
    adjustmentType: string;
    quantityImpact: number;
    valueImpact: number;
    percentageChange: number;
    requiresApproval: boolean;
    isSignificant: boolean;
  } {
    const isSignificant = Math.abs(this.adjustmentPercent) > 5 || 
                          Math.abs(Number(this.totalValueImpact || 0)) > 50;

    return {
      adjustmentType: this.type,
      quantityImpact: Number(this.adjustmentQuantity),
      valueImpact: Number(this.totalValueImpact || 0),
      percentageChange: this.adjustmentPercent,
      requiresApproval: this.requiresApproval(),
      isSignificant,
    };
  }
}