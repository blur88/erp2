import {
  Entity,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsInt,
  IsEmail,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import type { PurchaseOrder } from './purchase-order.entity';

export enum SupplierType {
  LOCAL = 'local',
  INTERNATIONAL = 'international',
}

/**
 * Supplier entity for purchasing management
 * Simplified supplier information
 */
@Entity('suppliers')
@Index(['phone'])
@Index(['type'])
@Index(['isActive'])
// Trigram index for fuzzy search (#960) — see product.entity.ts for why
// synchronize:false and the `as any` cast are required.
@Index('idx_suppliers_companyname_trgm', ['companyName'], { synchronize: false } as any)
export class Supplier extends BaseEntity {
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
    length: 255,
    nullable: true,
    comment: 'URL-friendly identifier derived from companyName',
  })
  @Index({ unique: true })
  slug: string;

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
    length: 20,
    nullable: true,
    comment: 'Primary phone number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

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

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Internal notes about the supplier',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Relationships
  @OneToMany('PurchaseOrder', 'supplier', {
    cascade: false,
  })
  purchaseOrders: PurchaseOrder[];

  get averageOrderValue(): number {
    return this.totalOrders > 0 ? Number(this.totalPurchases) / this.totalOrders : 0;
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

  canPurchase(): boolean {
    return this.isActive;
  }
}
