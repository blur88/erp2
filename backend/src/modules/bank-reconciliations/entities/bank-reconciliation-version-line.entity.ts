import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import type { JournalEntryLine } from '../../accounting/entities/journal-entry-line.entity';
import type { BankReconciliationVersion } from './bank-reconciliation-version.entity';

export enum BankReconciliationVersionLineRole {
  MATCHED = 'MATCHED',
  OUTSTANDING = 'OUTSTANDING',
  OPENING_CLEARED = 'OPENING_CLEARED',
}

@Check('CHK_bsr_vline_cleared_unmarked', `role <> 'OPENING_CLEARED' OR "setupMarked" = false`)
@Index('UQ_bsr_version_line', ['versionId', 'journalEntryLineId'], { unique: true })
@Index(['journalEntryLineId'])
@Entity('bank_statement_reconciliation_version_lines')
export class BankReconciliationVersionLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'uuid' })
  versionId: string;

  @Column({ type: 'uuid' })
  journalEntryLineId: string;

  @Column({ type: 'enum', enum: BankReconciliationVersionLineRole })
  role: BankReconciliationVersionLineRole;

  @Column({ type: 'date' })
  entryDate: string;

  @Column({ type: 'uuid' })
  journalEntryId: string;

  @Column({ type: 'varchar', length: 50 })
  journalNo: string;

  @Column({ type: 'varchar', length: 50 })
  sourceType: string;

  @Column({ type: 'uuid', nullable: true })
  sourceDocumentId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sourceRef: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  moneyIn: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  moneyOut: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  addedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  addedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  setupMarked: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  setupMarkedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  setupMarkedAt: Date | null;

  @ManyToOne('BankReconciliationVersion', 'lines', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'versionId' })
  version: BankReconciliationVersion;

  @ManyToOne('JournalEntryLine', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'journalEntryLineId' })
  journalEntryLine: JournalEntryLine;
}
