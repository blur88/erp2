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
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { GoodsReceivedNote } from './goods-received-note.entity';

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
    comment: 'Street address',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetAddress?: string;

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
    comment: 'State/Province',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Postal/ZIP code',
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
  @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.supplier, {
    cascade: false,
  })
  purchaseOrders: PurchaseOrder[];

  @OneToMany(() => GoodsReceivedNote, (grn) => grn.supplier, {
    cascade: false,
  })
  goodsReceivedNotes: GoodsReceivedNote[];

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