import { Column } from 'typeorm';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

import { BaseEntity } from './base.entity';

export abstract class BaseTransactionHeader extends BaseEntity {
  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  subtotal: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  discountAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @Column({ type: 'uuid', nullable: true })
  @IsOptional()
  createdByUserId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsString()
  createdByUsername?: string;
}
