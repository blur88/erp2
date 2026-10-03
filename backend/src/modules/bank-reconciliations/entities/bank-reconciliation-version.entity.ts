import {
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import type { ChartOfAccount } from '../../accounting/entities/chart-of-account.entity';
import type { BankReconciliation } from './bank-reconciliation.entity';
import type { BankReconciliationVersionLine } from './bank-reconciliation-version-line.entity';

@Index('UQ_bsr_version_no', ['reconciliationId', 'versionNo'], { unique: true })
@Index(['bankAccountId'])
@Entity('bank_statement_reconciliation_versions')
export class BankReconciliationVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'uuid' })
  reconciliationId: string;

  @Column({ type: 'int' })
  versionNo: number;

  @Column({ type: 'varchar', length: 30 })
  reconciliationNo: string;

  @Column({ type: 'int' })
  sequenceNo: number;

  @Column({ type: 'uuid' })
  bankAccountId: string;

  @Column({ type: 'varchar', length: 50 })
  bankAccountCode: string;

  @Column({ type: 'varchar', length: 200 })
  bankAccountName: string;

  @Column({ type: 'date' })
  periodFrom: string;

  @Column({ type: 'date' })
  periodTo: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  openingBalance: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  closingBalance: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  moneyInTotal: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  moneyOutTotal: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  calculatedClosingBalance: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  difference: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  openingClearedNet: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  openingBalanceDifference: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  completedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sealedAt: Date | null;

  @ManyToOne('BankReconciliation', 'versions', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reconciliationId' })
  reconciliation: BankReconciliation;

  @ManyToOne('ChartOfAccount', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'bankAccountId' })
  bankAccount: ChartOfAccount;

  @OneToMany('BankReconciliationVersionLine', 'version')
  lines: BankReconciliationVersionLine[];
}
