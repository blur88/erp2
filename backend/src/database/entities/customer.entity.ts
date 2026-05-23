import {
  Entity,
  Column,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  MaxLength,
  IsDecimal,
  IsEmail,
  Min,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { SalesOrder } from './sales-order.entity';
import { Invoice } from './invoice.entity';
import { Payment } from './payment.entity';
import { PriceList } from './price-list.entity';

export enum CustomerType {
  INDIVIDUAL = 'individual',
  BUSINESS = 'business',
}


/**
 * Customer entity for sales management
 * Supports both individual and business customers
 * Includes credit management and pricing level assignment
 */
@Entity('customers')
@Index(['phone'])
@Index(['type'])
@Index(['priceListId'])
@Index(['isActive'])
export class Customer extends BaseEntity {

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
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9\s\-\.,'&]+$/, { message: 'Name contains invalid characters' })
  name: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'URL-friendly identifier derived from name',
  })
  @Index({ unique: true })
  slug: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Primary phone number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  // Email
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Email address',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  // Billing Address
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Billing street address line 1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  billingStreetAddress?: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Billing street address line 2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  billingStreetAddress2?: string;

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
    comment: 'Billing state or province',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingState?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Billing postal or ZIP code',
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

  // Shipping Address
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Shipping street address line 1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  shippingStreetAddress?: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Shipping street address line 2',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  shippingStreetAddress2?: string;

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
    comment: 'Shipping state or province',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingState?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Shipping postal or ZIP code',
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
    type: 'boolean',
    default: true,
    comment: 'Whether the customer is active',
  })
  @IsBoolean()
  declare isActive: boolean;

  // Normalized price list relationship
  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Foreign key to price_lists table',
  })
  @IsOptional()
  priceListId?: string;

  @ManyToOne(() => PriceList, (priceList) => priceList.customers, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'priceListId' })
  priceList?: PriceList;


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
  get averageOrderValue(): number {
    return this.totalOrders > 0 ? Number(this.totalSales) / this.totalOrders : 0;
  }

  /**
   * Updates sales metrics for the customer
   * @param orderAmount - The amount of the order
   * @param isFirstOrder - Whether this is the customer's first order
   */
  updateSalesMetrics(orderAmount: number, isFirstOrder: boolean = false): void {
    if (orderAmount < 0) {
      throw new Error('Order amount cannot be negative');
    }
    
    this.totalSales = Number(this.totalSales) + Number(orderAmount);
    this.totalOrders += 1;
    this.lastPurchaseDate = new Date();
    
    if (isFirstOrder || !this.firstPurchaseDate) {
      this.firstPurchaseDate = new Date();
    }
  }

  /**
   * Checks if customer is allowed to make purchases
   * @returns true if customer can purchase, false otherwise
   */
  canPurchase(): boolean {
    return this.isActive;
  }
}
