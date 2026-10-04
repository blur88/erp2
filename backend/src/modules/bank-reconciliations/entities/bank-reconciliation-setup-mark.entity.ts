import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import type { JournalEntryLine } from '../../accounting/entities/journal-entry-line.entity';
import type { BankReconciliation } from './bank-reconciliation.entity';

@Index('UQ_bsr_mark', ['reconciliationId', 'journalEntryLineId'], { unique: true })
@Index(['journalEntryLineId'])
@Entity('bank_statement_reconciliation_setup_marks')
export class BankReconciliationSetupMark extends BaseEntity {
  @Column({ type: 'uuid' })
  reconciliationId: string;

  @Column({ type: 'uuid' })
  journalEntryLineId: string;

  @Column({ type: 'varchar', length: 120 })
  markedBy: string;

  @Column({ type: 'timestamptz' })
  markedAt: Date;

  @ManyToOne('BankReconciliation', 'setupMarks', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reconciliationId' })
  reconciliation: BankReconciliation;

  @ManyToOne('JournalEntryLine', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'journalEntryLineId' })
  journalEntryLine: JournalEntryLine;
}
