import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import type { OwnerEquityDocument } from './owner-equity-document.entity';
import type { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';

@Entity('owner_equity_settlements')
@Index(['equityDocumentId'])
@Index(['sourceSettlementId'])
export class OwnerEquitySettlement extends BaseEntity {
  @Column({ type: 'uuid' })
  equityDocumentId: string;

  @Column({ type: 'uuid' })
  paymentMethodId: string;

  @Column({ type: 'date' })
  settlementDate: string;

  // Negative on refund rows, mirroring ExpensePayment.
  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reference: string | null;

  // Self-FK, RESTRICT: a settled row must not be removable while refunds
  // reference it. Indexed above for the refundable-remaining lookup.
  // Legacy lineage: the settlement a refund offset, for refunds recorded
  // before cross-method refunds (#1096). NULL on all new rows — a refund is
  // identified by `amount < 0`, never by this column. Retained for historical
  // display/audit.
  @Column({ type: 'uuid', nullable: true })
  sourceSettlementId: string | null;

  @ManyToOne('OwnerEquityDocument', 'settlements', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'equityDocumentId' })
  document: OwnerEquityDocument;

  // The accounting channel (CASH/BANK) is read from this method per row, which
  // is what lets one document split settlements across cash and bank.
  // Not eager: findByReference loads methods separately with withDeleted so a
  // soft-deleted method still renders on historical rows (ExpenseService.findOne
  // does the same).
  @ManyToOne('PaymentMethodEntity', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethodEntity;

  @ManyToOne('OwnerEquitySettlement', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'sourceSettlementId' })
  sourceSettlement: OwnerEquitySettlement | null;
}
