import { Column } from 'typeorm';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

import { BaseEntity } from './base.entity';

export abstract class BaseTransactionItem extends BaseEntity {
  @Column({ type: 'uuid' })
  @IsUUID()
  productId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'percentage' })
  @IsOptional()
  @IsString()
  discountType?: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  @IsNumber()
  @Min(0)
  discountValue: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  taxRate: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  subtotal: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  totalAmount: number;
}
