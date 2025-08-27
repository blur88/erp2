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
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { SalesOrder } from './sales-order.entity';
import { Invoice } from './invoice.entity';
import { Payment } from './payment.entity';

export enum CustomerType {
  INDIVIDUAL = 'individual',
  BUSINESS = 'business',
}

export enum CustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  BLACKLISTED = 'blacklisted',
}

export enum PriceLevel {
  RETAIL = 'retail',
  WHOLESALE = 'wholesale',
  SPECIAL = 'special',
}

/**
 * Customer entity for sales management
 * Supports both individual and business customers
 * Includes credit management and pricing level assignment
 */
@Entity('customers')
@Index(['customerCode'], { unique: true })
@Index(['email'], { unique: true, where: 'email IS NOT NULL' })
@Index(['phone'])
@Index(['type', 'status'])
@Index(['priceLevel'])
@Index(['isActive'])
export class Customer extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    comment: 'Unique customer code/number',
  })
  @IsString()
  @MaxLength(20)
  customerCode: string;

  @Column({
    type: 'enum',
    enum: CustomerType,
    default: CustomerType.INDIVIDUAL,
    comment: 'Customer type (individual/business)',
  })
  @IsEnum(CustomerType)
  type: CustomerType;

  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Customer name or business name',
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Contact person name (for business customers)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    unique: true,
    comment: 'Customer email address',
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
    comment: 'Billing address',
  })
  @IsOptional()
  @IsString()
  billingAddress?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Billing city',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCity?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Billing state/province',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingState?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Billing postal code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingPostalCode?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Billing country',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCountry?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Shipping address (if different from billing)',
  })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Shipping city',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCity?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Shipping state/province',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingState?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Shipping postal code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  shippingPostalCode?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Shipping country',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCountry?: string;

  // Business Information
  @Column({
    type: 'enum',
    enum: CustomerStatus,
    default: CustomerStatus.ACTIVE,
    comment: 'Customer status',
  })
  @IsEnum(CustomerStatus)
  status: CustomerStatus;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Whether the customer is active',
  })
  @IsBoolean()
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: PriceLevel,
    default: PriceLevel.RETAIL,
    comment: 'Default price level for this customer',
  })
  @IsEnum(PriceLevel)
  priceLevel: PriceLevel;

  // Credit Management
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Credit limit for this customer',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  creditLimit: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Current outstanding balance',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  currentBalance: number;

  @Column({
    type: 'int',
    default: 30,
    comment: 'Payment terms in days',
  })
  paymentTermsDays: number;

  // Customer Metrics
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total sales amount to this customer',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalSales: number;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Total number of orders',
  })
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

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Internal notes about the customer',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Additional customer metadata',
  })
  @IsOptional()
  metadata?: Record<string, any>;

  // Relationships
  @OneToMany(() => SalesOrder, (salesOrder) => salesOrder.customer, {
    cascade: false,
  })
  salesOrders: SalesOrder[];

  @OneToMany(() => Invoice, (invoice) => invoice.customer, {
    cascade: false,
  })
  invoices: Invoice[];

  @OneToMany(() => Payment, (payment) => payment.customer, {
    cascade: false,
  })
  payments: Payment[];

  // Computed properties
  get fullAddress(): string {
    const parts = [
      this.billingAddress,
      this.billingCity,
      this.billingState,
      this.billingPostalCode,
      this.billingCountry,
    ].filter(Boolean);
    return parts.join(', ');
  }

  get fullShippingAddress(): string {
    if (!this.shippingAddress) return this.fullAddress;
    
    const parts = [
      this.shippingAddress,
      this.shippingCity,
      this.shippingState,
      this.shippingPostalCode,
      this.shippingCountry,
    ].filter(Boolean);
    return parts.join(', ');
  }

  get availableCredit(): number {
    return Number(this.creditLimit) - Number(this.currentBalance);
  }

  get isOverCreditLimit(): boolean {
    return Number(this.currentBalance) > Number(this.creditLimit);
  }

  get averageOrderValue(): number {
    return this.totalOrders > 0 ? Number(this.totalSales) / this.totalOrders : 0;
  }

  // Helper methods
  updateBalance(amount: number, type: 'increase' | 'decrease'): void {
    if (type === 'increase') {
      this.currentBalance = Number(this.currentBalance) + Number(amount);
    } else {
      this.currentBalance = Math.max(0, Number(this.currentBalance) - Number(amount));
    }
  }

  updateSalesMetrics(orderAmount: number, isFirstOrder: boolean = false): void {
    this.totalSales = Number(this.totalSales) + Number(orderAmount);
    this.totalOrders += 1;
    this.lastPurchaseDate = new Date();
    
    if (isFirstOrder || !this.firstPurchaseDate) {
      this.firstPurchaseDate = new Date();
    }
  }

  canPurchase(amount: number): boolean {
    if (!this.isActive || this.status === CustomerStatus.SUSPENDED || this.status === CustomerStatus.BLACKLISTED) {
      return false;
    }
    
    return (Number(this.currentBalance) + Number(amount)) <= Number(this.creditLimit);
  }
}