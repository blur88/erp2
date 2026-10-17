import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  IsUUID,
  IsDate,
  IsOptional,
  IsDecimal,
  Min,
} from 'class-validator';

/**
 * Per-movement, per-batch consumption provenance. Records exactly how much of
 * which batch a sale movement consumed, at what landed cost and unrounded
 * scale-8 value. Used to restore stock exactly on unfulfil.
 */
@Entity('stock_batch_consumptions')
export class StockBatchConsumption {
  @PrimaryGeneratedColumn('uuid')
  @IsOptional()
  @IsUUID(4)
  id: string;

  @Column({
    type: 'uuid',
    comment: 'Stock movement id',
  })
  @IsUUID(4)
  movementId: string;

  @Column({
    type: 'uuid',
    comment: 'Purchase cost history (batch) id',
  })
  @IsUUID(4)
  batchId: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Quantity consumed from this batch (scale-4)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Landed unit cost at consumption (scale-4)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitCost: number;

  @Column({
    type: 'decimal',
    precision: 24,
    scale: 8,
    comment: 'Unrounded value (scale-8)',
  })
  @IsDecimal({ decimal_digits: '0,8' })
  valueScale8: number;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @IsDate()
  readonly createdAt: Date;

  @ManyToOne('StockMovement', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'movementId' })
  movement: any;

  @ManyToOne('PurchaseCostHistory', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'batchId' })
  batch: any;
}
