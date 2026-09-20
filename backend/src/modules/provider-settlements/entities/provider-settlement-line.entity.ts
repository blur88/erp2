import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import type { ProviderSettlement } from './provider-settlement.entity';
import type { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';

// The partial unique index is what makes duplicate settlement STRUCTURALLY
// impossible — at draft time and against concurrent users. It is predicated on
// releasedAt, so reversal releases a claim by stamping that column while the
// row itself survives verbatim for audit.
//
// NOTE: the predicate is releasedAt, NOT deletedAt. This entity extends
// BaseEntity, so softDelete() sets deletedAt and leaves the claim ACTIVE. Draft
// lines that are removed must therefore be HARD-deleted. See the service.
@Index(['salesOrderPaymentId'], { unique: true, where: '"releasedAt" IS NULL' })
@Index(['settlementId'])
@Entity('provider_settlement_lines')
export class ProviderSettlementLine extends BaseEntity {
  @Column({ type: 'uuid' })
  settlementId: string;

  @Column({ type: 'uuid' })
  salesOrderPaymentId: string;

  // Snapshot of the payment row's signed amount, so a settlement's historical
  // total is stable. Revalidated against the live row at post time.
  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount: string;

  // Stamped by reversal of a POSTED settlement. NULL means the claim is live.
  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @ManyToOne('ProviderSettlement', 'lines', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'settlementId' })
  settlement: ProviderSettlement;

  @ManyToOne('SalesOrderPayment', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'salesOrderPaymentId' })
  salesOrderPayment: SalesOrderPayment;
}
