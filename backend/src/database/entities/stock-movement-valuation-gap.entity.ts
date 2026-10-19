import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
} from 'typeorm';
import { IsDate, IsDecimal, IsEnum, IsUUID, Min } from 'class-validator';

export enum StockMovementValuationGapStatus {
  UNVALUED_GAP = 'unvalued_gap',
}

/**
 * Explicit uncovered fulfillment quantity. A zero posted value here means the
 * existing batch-derived COGS path assigned no value; it does not assert that
 * the stock is known to have zero cost.
 *
 * Rows are inserted atomically with the sale movement and are immutable.
 */
@Entity('stock_movement_valuation_gaps')
@Check('CHK_stock_movement_valuation_gap_quantity_positive', '"quantity" > 0')
@Check('CHK_stock_movement_valuation_gap_value_zero', '"valueScale8" = 0')
@Check('CHK_stock_movement_valuation_gap_status', '"status" = \'unvalued_gap\'')
export class StockMovementValuationGap {
  @PrimaryColumn({
    type: 'uuid',
    comment: 'Unique sale movement whose batch coverage is incomplete',
  })
  @IsUUID(4)
  movementId: string;

  @Column({
    type: 'numeric',
    precision: 15,
    scale: 4,
    comment: 'Uncovered quantity, recorded separately from batch consumption',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  quantity: string;

  @Column({
    type: 'numeric',
    precision: 24,
    scale: 8,
    default: 0,
    comment: 'Compatibility posted value; zero is explicitly unvalued, not known zero cost',
  })
  @IsDecimal({ decimal_digits: '0,8' })
  valueScale8: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: StockMovementValuationGapStatus.UNVALUED_GAP,
  })
  @IsEnum(StockMovementValuationGapStatus)
  status: StockMovementValuationGapStatus;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  @IsDate()
  readonly createdAt: Date;

  @OneToOne('StockMovement', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'movementId', foreignKeyConstraintName: 'FK_stock_movement_valuation_gap_movement' })
  movement: any;
}
