import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
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
  IsInt,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { PurchaseRequisitionItem } from './purchase-requisition-item.entity';
import { PurchaseOrder } from './purchase-order.entity';

export enum PurchaseRequisitionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CONVERTED_TO_PO = 'converted_to_po',
  CANCELLED = 'cancelled',
}

export enum PurchaseRequisitionPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum PurchaseRequisitionType {
  MATERIALS = 'materials',
  SERVICES = 'services',
  CAPITAL = 'capital',
  MAINTENANCE = 'maintenance',
  OFFICE_SUPPLIES = 'office_supplies',
}

/**
 * Purchase Requisition entity for internal purchase requests
 * Supports approval workflow and conversion to purchase orders
 */
@Entity('purchase_requisitions')
@Index(['requisitionNumber'], { unique: true })
@Index(['requestedByUserId'])
@Index(['status'])
@Index(['requestDate'])
@Index(['requiredDate'])
@Index(['priority'])
@Index(['type'])
@Index(['approvedByUserId'])
export class PurchaseRequisition extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 30,
    unique: true,
    comment: 'Unique purchase requisition number',
  })
  @IsString()
  @MaxLength(30)
  requisitionNumber: string;

  @Column({
    type: 'enum',
    enum: PurchaseRequisitionStatus,
    default: PurchaseRequisitionStatus.DRAFT,
    comment: 'Requisition status',
  })
  @IsEnum(PurchaseRequisitionStatus)
  status: PurchaseRequisitionStatus;

  @Column({
    type: 'enum',
    enum: PurchaseRequisitionPriority,
    default: PurchaseRequisitionPriority.NORMAL,
    comment: 'Requisition priority',
  })
  @IsEnum(PurchaseRequisitionPriority)
  priority: PurchaseRequisitionPriority;

  @Column({
    type: 'enum',
    enum: PurchaseRequisitionType,
    default: PurchaseRequisitionType.MATERIALS,
    comment: 'Type of purchase requisition',
  })
  @IsEnum(PurchaseRequisitionType)
  type: PurchaseRequisitionType;

  @Column({
    type: 'date',
    comment: 'Date when requisition was requested',
  })
  @IsDate()
  requestDate: Date;

  @Column({
    type: 'date',
    comment: 'Required delivery/completion date',
  })
  @IsDate()
  requiredDate: Date;

  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Department or cost center',
  })
  @IsString()
  @MaxLength(200)
  department: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Project code or reference',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectCode?: string;

  @Column({
    type: 'text',
    comment: 'Justification for the purchase request',
  })
  @IsString()
  justification: string;

  // Budget Information
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Estimated total amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  estimatedTotal: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Approved budget amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  approvedBudget: number;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Budget code or account',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  budgetCode?: string;

  // Approval Information
  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Date when submitted for approval',
  })
  @IsOptional()
  @IsDate()
  submittedDate?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Date when approved or rejected',
  })
  @IsOptional()
  @IsDate()
  approvalDate?: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Approval comments or rejection reason',
  })
  @IsOptional()
  @IsString()
  approvalComments?: string;

  @Column({
    type: 'int',
    default: 1,
    comment: 'Current approval level',
  })
  @IsInt()
  @Min(1)
  approvalLevel: number;

  @Column({
    type: 'int',
    default: 1,
    comment: 'Required approval levels',
  })
  @IsInt()
  @Min(1)
  requiredApprovalLevels: number;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Approval workflow history',
  })
  @IsOptional()
  approvalHistory?: Array<{
    level: number;
    approvedBy: string;
    approvedAt: Date;
    comments?: string;
    action: 'approved' | 'rejected' | 'returned';
  }>;

  // Supplier Information
  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Suggested supplier ID',
  })
  @IsOptional()
  suggestedSupplierId?: string;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Suggested supplier name (if not in system)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  suggestedSupplierName?: string;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Additional notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special delivery instructions',
  })
  @IsOptional()
  @IsString()
  deliveryInstructions?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Attached documents/files',
  })
  @IsOptional()
  attachments?: Array<{
    fileName: string;
    filePath: string;
    fileSize: number;
    uploadedAt: Date;
    uploadedBy: string;
  }>;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Additional requisition metadata',
  })
  @IsOptional()
  metadata?: Record<string, any>;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'User who requested the purchase',
  })
  requestedByUserId: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'User who approved the requisition',
  })
  @IsOptional()
  approvedByUserId?: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Purchase order created from this requisition',
  })
  @IsOptional()
  purchaseOrderId?: string;

  // Relationships
  @ManyToOne(() => User, (user) => user.purchaseRequisitions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'requestedByUserId' })
  requestedByUser: User;

  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'approvedByUserId' })
  approvedByUser?: User;

  @ManyToOne(() => PurchaseOrder, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder?: PurchaseOrder;

  @OneToMany(() => PurchaseRequisitionItem, (item) => item.purchaseRequisition, {
    cascade: true,
    eager: false,
  })
  items: PurchaseRequisitionItem[];

  // Computed properties
  get isApprovalRequired(): boolean {
    return Number(this.estimatedTotal) > 0; // Configurable threshold
  }

  get isPendingApproval(): boolean {
    return this.status === PurchaseRequisitionStatus.PENDING_APPROVAL;
  }

  get isApproved(): boolean {
    return this.status === PurchaseRequisitionStatus.APPROVED;
  }

  get canApprove(): boolean {
    return this.status === PurchaseRequisitionStatus.PENDING_APPROVAL;
  }

  get canConvertToPO(): boolean {
    return this.status === PurchaseRequisitionStatus.APPROVED;
  }

  get isOverdue(): boolean {
    return new Date() > this.requiredDate && 
           ![PurchaseRequisitionStatus.CONVERTED_TO_PO, PurchaseRequisitionStatus.CANCELLED].includes(this.status);
  }

  get daysUntilRequired(): number {
    const today = new Date();
    const required = new Date(this.requiredDate);
    const diffTime = required.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Hooks
  @BeforeInsert()
  generateRequisitionNumber() {
    if (!this.requisitionNumber) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 5).toUpperCase();
      this.requisitionNumber = `PR-${timestamp}-${random}`;
    }
  }

  // Helper methods
  calculateEstimatedTotal(): void {
    if (this.items && this.items.length > 0) {
      this.estimatedTotal = this.items.reduce((sum, item) => 
        sum + (Number(item.quantity) * Number(item.estimatedUnitPrice)), 0);
    }
  }

  submit(): void {
    if (this.status === PurchaseRequisitionStatus.DRAFT) {
      this.status = PurchaseRequisitionStatus.SUBMITTED;
      this.submittedDate = new Date();
      
      if (this.isApprovalRequired) {
        this.status = PurchaseRequisitionStatus.PENDING_APPROVAL;
      } else {
        this.status = PurchaseRequisitionStatus.APPROVED;
        this.approvalDate = new Date();
      }
    }
  }

  approve(approvedByUserId: string, comments?: string, level: number = 1): void {
    if (this.canApprove) {
      // Record approval in history
      if (!this.approvalHistory) {
        this.approvalHistory = [];
      }

      this.approvalHistory.push({
        level: level,
        approvedBy: approvedByUserId,
        approvedAt: new Date(),
        comments: comments,
        action: 'approved',
      });

      this.approvalLevel = level;
      
      if (level >= this.requiredApprovalLevels) {
        this.status = PurchaseRequisitionStatus.APPROVED;
        this.approvedByUserId = approvedByUserId;
        this.approvalDate = new Date();
        if (comments) {
          this.approvalComments = comments;
        }
      }
    }
  }

  reject(rejectedByUserId: string, reason: string, level: number = 1): void {
    if (this.canApprove) {
      this.status = PurchaseRequisitionStatus.REJECTED;
      this.approvedByUserId = rejectedByUserId;
      this.approvalDate = new Date();
      this.approvalComments = reason;

      // Record rejection in history
      if (!this.approvalHistory) {
        this.approvalHistory = [];
      }

      this.approvalHistory.push({
        level: level,
        approvedBy: rejectedByUserId,
        approvedAt: new Date(),
        comments: reason,
        action: 'rejected',
      });
    }
  }

  convertToPO(purchaseOrderId: string): void {
    if (this.canConvertToPO) {
      this.status = PurchaseRequisitionStatus.CONVERTED_TO_PO;
      this.purchaseOrderId = purchaseOrderId;
    }
  }

  cancel(reason?: string): void {
    if (![PurchaseRequisitionStatus.CONVERTED_TO_PO, PurchaseRequisitionStatus.CANCELLED].includes(this.status)) {
      this.status = PurchaseRequisitionStatus.CANCELLED;
      if (reason) {
        this.notes = (this.notes || '') + `\nCancelled: ${reason}`;
      }
    }
  }

  // Get total item count
  getTotalItemCount(): number {
    return this.items ? this.items.length : 0;
  }

  // Get total quantity across all items
  getTotalQuantity(): number {
    if (!this.items) return 0;
    return this.items.reduce((sum, item) => sum + Number(item.quantity), 0);
  }

  // Check if all required approvals are obtained
  isFullyApproved(): boolean {
    return this.approvalLevel >= this.requiredApprovalLevels;
  }

  // Get current approval status
  getApprovalStatus(): string {
    if (this.status === PurchaseRequisitionStatus.DRAFT) {
      return 'Draft';
    } else if (this.status === PurchaseRequisitionStatus.SUBMITTED) {
      return 'Submitted';
    } else if (this.status === PurchaseRequisitionStatus.PENDING_APPROVAL) {
      return `Pending Approval (Level ${this.approvalLevel}/${this.requiredApprovalLevels})`;
    } else if (this.status === PurchaseRequisitionStatus.APPROVED) {
      return 'Approved';
    } else if (this.status === PurchaseRequisitionStatus.REJECTED) {
      return 'Rejected';
    } else if (this.status === PurchaseRequisitionStatus.CONVERTED_TO_PO) {
      return 'Converted to PO';
    } else {
      return 'Cancelled';
    }
  }
}