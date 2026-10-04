import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import type { JournalEntryLine } from '../../accounting/entities/journal-entry-line.entity';
import type { BankReconciliation } from './bank-reconciliation.entity';

export enum BankReconciliationLineKind {
  MATCHED = 'MATCHED',
  OPENING_CLEARED = 'OPENING_CLEARED',
}

@Index('UQ_bsr_line_journal_line', ['journalEntryLineId'], { unique: true })
@Index(['reconciliationId'])
@Entity('bank_statement_reconciliation_lines')
export class BankReconciliationLine extends BaseEntity {
  @Column({ type: 'uuid' })
  reconciliationId: string;

  @Column({ type: 'uuid' })
  journalEntryLineId: string;

  @Column({ type: 'enum', enum: BankReconciliationLineKind })
  kind: BankReconciliationLineKind;

  @Column({ type: 'varchar', length: 120 })
  addedBy: string;

  @Column({ type: 'timestamptz' })
  addedAt: Date;

  @ManyToOne('BankReconciliation', 'lines', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reconciliationId' })
  reconciliation: BankReconciliation;

  @ManyToOne('JournalEntryLine', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'journalEntryLineId' })
  journalEntryLine: JournalEntryLine;
}
