import {
  Entity,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import {
  IsString,
  IsEmail,
  IsBoolean,
  IsOptional,
  IsEnum,
  MaxLength,
  IsPhoneNumber,
  IsDecimal,
  Min,
  IsInt,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { GoodsReceivedNote } from './goods-received-note.entity';
import { SupplierInvoice } from './supplier-invoice.entity';

export enum SupplierType {
  LOCAL = 'local',
  INTERNATIONAL = 'international',
}

export enum SupplierStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  BLACKLISTED = 'blacklisted',
}

export enum SupplierRating {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  AVERAGE = 'average',
  POOR = 'poor',
  UNRATED = 'unrated',
}

/**
 * Supplier entity for purchasing management
 * Supports comprehensive supplier information and performance tracking
 */
@Entity('suppliers')
@Index(['supplierCode'], { unique: true })
@Index(['email'], { unique: true, where: 'email IS NOT NULL' })
@Index(['phone'])
@Index(['type', 'status'])
@Index(['rating'])
@Index(['isActive'])
export class Supplier extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    comment: 'Unique supplier code/number',
  })
  @IsString()
  @MaxLength(20)
  supplierCode: string;

  @Column({
    type: 'enum',
    enum: SupplierType,
    default: SupplierType.LOCAL,
    comment: 'Supplier type (local/international)',
  })
  @IsEnum(SupplierType)
  type: SupplierType;

  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Supplier company name',
  })
  @IsString()
  @MaxLength(200)
  companyName: string;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Contact person name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Contact person title/position',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactTitle?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    unique: true,
    comment: 'Supplier email address',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Primary phone number',
  })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Alternative phone number',
  })
  @IsOptional()
  @IsPhoneNumber()
  alternativePhone?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Fax number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fax?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Website URL',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  website?: string;

  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
    comment: 'Tax ID or business registration number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  taxId?: string;

  // Address Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Supplier address',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'City',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'State/province',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Postal code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Country',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  // Business Information
  @Column({
    type: 'enum',
    enum: SupplierStatus,
    default: SupplierStatus.ACTIVE,
    comment: 'Supplier status',
  })
  @IsEnum(SupplierStatus)
  status: SupplierStatus;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Whether the supplier is active',
  })
  @IsBoolean()
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: SupplierRating,
    default: SupplierRating.UNRATED,
    comment: 'Supplier performance rating',
  })
  @IsEnum(SupplierRating)
  rating: SupplierRating;

  // Payment Terms
  @Column({
    type: 'int',
    default: 30,
    comment: 'Payment terms in days',
  })
  @IsInt()
  @Min(0)
  paymentTermsDays: number;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'USD',
    comment: 'Preferred currency for transactions',
  })
  @IsString()
  @MaxLength(10)
  currency: string;

  // Supplier Metrics
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total purchase amount from this supplier',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalPurchases: number;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Total number of purchase orders',
  })
  @IsInt()
  @Min(0)
  totalOrders: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Date of last purchase',
  })
  @IsOptional()
  lastPurchaseDate?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'Date of first purchase',
  })
  @IsOptional()
  firstPurchaseDate?: Date;

  // Performance Metrics
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Average delivery time in days',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  averageDeliveryTime: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 100,
    comment: 'On-time delivery percentage',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  onTimeDeliveryRate: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 100,
    comment: 'Quality acceptance percentage',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  qualityRate: number;

  // Additional Information
  @Column({
    type: 'json',
    nullable: true,
    comment: 'Product categories supplied',
  })
  @IsOptional()
  categories?: string[];

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Certifications and qualifications',
  })
  @IsOptional()
  certifications?: string[];

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Internal notes about the supplier',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Additional supplier metadata',
  })
  @IsOptional()
  metadata?: Record<string, any>;

  // Relationships
  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.supplier, {
    cascade: false,
  })
  purchaseOrders: PurchaseOrder[];

  @OneToMany(() => GoodsReceivedNote, (grn) => grn.supplier, {
    cascade: false,
  })
  goodsReceivedNotes: GoodsReceivedNote[];

  @OneToMany(() => SupplierInvoice, (invoice) => invoice.supplier, {
    cascade: false,
  })
  invoices: SupplierInvoice[];

  // Computed properties
  get fullAddress(): string {
    const parts = [
      this.address,
      this.city,
      this.state,
      this.postalCode,
      this.country,
    ].filter(Boolean);
    return parts.join(', ');
  }

  get averageOrderValue(): number {
    return this.totalOrders > 0 ? Number(this.totalPurchases) / this.totalOrders : 0;
  }

  get overallPerformanceScore(): number {
    // Calculate overall performance based on delivery and quality metrics
    const deliveryScore = Math.min(Number(this.onTimeDeliveryRate), 100);
    const qualityScore = Math.min(Number(this.qualityRate), 100);
    return (deliveryScore + qualityScore) / 2;
  }

  // Helper methods
  updatePurchaseMetrics(orderAmount: number, isFirstOrder: boolean = false): void {
    this.totalPurchases = Number(this.totalPurchases) + Number(orderAmount);
    this.totalOrders += 1;
    this.lastPurchaseDate = new Date();
    
    if (isFirstOrder || !this.firstPurchaseDate) {
      this.firstPurchaseDate = new Date();
    }
  }

  updatePerformanceMetrics(deliveryTime: number, wasOnTime: boolean, wasQualityAccepted: boolean): void {
    // Simple rolling average calculation - in production, consider using weighted averages
    const currentAvgDelivery = Number(this.averageDeliveryTime);
    const currentOnTimeRate = Number(this.onTimeDeliveryRate);
    const currentQualityRate = Number(this.qualityRate);
    const totalOrders = this.totalOrders || 1;

    // Update average delivery time
    this.averageDeliveryTime = 
      (currentAvgDelivery * (totalOrders - 1) + deliveryTime) / totalOrders;

    // Update on-time delivery rate
    const onTimeCount = Math.round(currentOnTimeRate * (totalOrders - 1) / 100);
    const newOnTimeCount = onTimeCount + (wasOnTime ? 1 : 0);
    this.onTimeDeliveryRate = (newOnTimeCount / totalOrders) * 100;

    // Update quality rate
    const qualityCount = Math.round(currentQualityRate * (totalOrders - 1) / 100);
    const newQualityCount = qualityCount + (wasQualityAccepted ? 1 : 0);
    this.qualityRate = (newQualityCount / totalOrders) * 100;

    // Update rating based on performance
    this.updateRatingBasedOnPerformance();
  }

  private updateRatingBasedOnPerformance(): void {
    const score = this.overallPerformanceScore;
    
    if (score >= 95) {
      this.rating = SupplierRating.EXCELLENT;
    } else if (score >= 85) {
      this.rating = SupplierRating.GOOD;
    } else if (score >= 70) {
      this.rating = SupplierRating.AVERAGE;
    } else {
      this.rating = SupplierRating.POOR;
    }
  }

  canPurchase(): boolean {
    return this.isActive && this.status !== SupplierStatus.SUSPENDED && this.status !== SupplierStatus.BLACKLISTED;
  }
}