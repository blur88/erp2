import { Entity, Column, Index, OneToMany, ManyToOne, JoinColumn, Check } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import type { ChartOfAccount } from '../../accounting/entities/chart-of-account.entity';
import type { BankReconciliationLine } from './bank-reconciliation-line.entity';
import type { BankReconciliationSetupMark } from './bank-reconciliation-setup-mark.entity';
import type { BankReconciliationVersion } from './bank-reconciliation-version.entity';

export enum BankReconciliationStatus {
  DRAFT = 'DRAFT',
  COMPLETED = 'COMPLETED',
}

@Check('CHK_bsr_period', `"periodFrom" <= "periodTo"`)
@Check(
  'CHK_bsr_completed_shape',
  `status <> 'COMPLETED' OR ("currentVersionNo" IS NOT NULL AND "reopenedAt" IS NULL AND "reopenedBy" IS NULL)`,
)
@Index('UQ_bsr_one_draft_per_account', ['bankAccountId'], { unique: true, where: `status = 'DRAFT'` })
@Index('UQ_bsr_account_sequence', ['bankAccountId', 'sequenceNo'], { unique: true })
@Index(['bankAccountId'])
@Index(['periodTo'])
@Index(['status'])
@Entity('bank_statement_reconciliations')
export class BankReconciliation extends BaseEntity {
  @Column({ type: 'varchar', length: 30, unique: true })
  reconciliationNo: string;

  @Column({ type: 'uuid' })
  bankAccountId: string;

  @Column({ type: 'int' })
  sequenceNo: number;

  @Column({ type: 'date' })
  periodFrom: string;

  @Column({ type: 'date' })
  periodTo: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  openingBalance: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  closingBalance: string;

  @Column({ type: 'enum', enum: BankReconciliationStatus, default: BankReconciliationStatus.DRAFT })
  status: BankReconciliationStatus;

  @Column({ type: 'int', nullable: true })
  currentVersionNo: number | null;

  @Column({ type: 'int', default: 1 })
  lockVersion: number;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  completedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reopenedAt: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  reopenedBy: string | null;

  @ManyToOne('ChartOfAccount', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: ChartOfAccount;

  @OneToMany('BankReconciliationLine', 'reconciliation')
  lines: BankReconciliationLine[];

  @OneToMany('BankReconciliationSetupMark', 'reconciliation')
  setupMarks: BankReconciliationSetupMark[];

  @OneToMany('BankReconciliationVersion', 'reconciliation')
  versions: BankReconciliationVersion[];
}
