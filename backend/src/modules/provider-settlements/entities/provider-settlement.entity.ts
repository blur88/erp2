import { Entity, Column, Index, OneToMany, ManyToOne, JoinColumn, Check } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import type { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import type { ChartOfAccount } from '../../accounting/entities/chart-of-account.entity';
import type { JournalEntry } from '../../accounting/entities/journal-entry.entity';
import type { ProviderSettlementLine } from './provider-settlement-line.entity';

// CREATEd whole by the Provider Settlements migration, so member order is free
// at authoring time — but frozen once that migration lands (see OwnerEquity).
export enum ProviderSettlementStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

// Two-sided lifecycle CHECKs: a row must carry exactly the metadata its status
// implies, and none of the metadata it does not. One-sided checks would let a
// DRAFT keep a stale journalEntryId after a failed transition.
@Check(
  'CHK_ps_draft_shape',
  `status <> 'DRAFT' OR ("journalEntryId" IS NULL AND "postedAt" IS NULL AND "postedBy" IS NULL AND "reversalJournalEntryId" IS NULL AND "reversedAt" IS NULL AND "reversedBy" IS NULL)`,
)
@Check(
  'CHK_ps_posted_shape',
  `status <> 'POSTED' OR ("journalEntryId" IS NOT NULL AND "postedAt" IS NOT NULL AND "postedBy" IS NOT NULL AND "reversalJournalEntryId" IS NULL AND "reversedAt" IS NULL AND "reversedBy" IS NULL)`,
)
@Check(
  'CHK_ps_reversed_shape',
  `status <> 'REVERSED' OR ("journalEntryId" IS NOT NULL AND "postedAt" IS NOT NULL AND "postedBy" IS NOT NULL AND "reversalJournalEntryId" IS NOT NULL AND "reversedAt" IS NOT NULL AND "reversedBy" IS NOT NULL)`,
)
@Check('CHK_ps_amount_positive', `"settlementAmount" > 0`)
@Index(['settlementDate'])
@Index(['providerPaymentMethodId'])
@Index(['status'])
@Index(['providerReference'])
@Entity('provider_settlements')
export class ProviderSettlement extends BaseEntity {
  @Column({ type: 'varchar', length: 30, unique: true })
  referenceNumber: string;

  @Column({ type: 'uuid' })
  providerPaymentMethodId: string;

  // Snapshot, NOT NULL from draft creation. Derived from the selected payments'
  // ORIGINAL journal entries, never from the live payment-method mapping: a
  // mapping changed after posting would otherwise make this settlement credit
  // an account those payments never debited.
  @Column({ type: 'uuid' })
  clearingAccountId: string;

  @Column({ type: 'uuid' })
  bankAccountId: string;

  @Column({ type: 'date' })
  settlementDate: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  providerReference: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  settlementAmount: string;

  @Column({ type: 'enum', enum: ProviderSettlementStatus, default: ProviderSettlementStatus.DRAFT })
  status: ProviderSettlementStatus;

  @Column({ type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @Column({ type: 'uuid', nullable: true })
  reversalJournalEntryId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  postedAt: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  postedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reversedAt: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reversedBy: string | null;

  @ManyToOne('PaymentMethodEntity', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'providerPaymentMethodId' })
  providerPaymentMethod: PaymentMethodEntity;

  @ManyToOne('ChartOfAccount', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clearingAccountId' })
  clearingAccount: ChartOfAccount;

  @ManyToOne('ChartOfAccount', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: ChartOfAccount;

  @ManyToOne('JournalEntry', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'journalEntryId' })
  journalEntry: JournalEntry | null;

  @ManyToOne('JournalEntry', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'reversalJournalEntryId' })
  reversalJournalEntry: JournalEntry | null;

  @OneToMany('ProviderSettlementLine', 'settlement')
  lines: ProviderSettlementLine[];
}
