import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import {
  IsEnum,
  IsDecimal,
  IsDate,
  IsUUID,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { FiscalPeriod } from './fiscal-period.entity';
import { ReconciledTransaction } from './reconciled-transaction.entity';

export enum BankReconciliationStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

/**
 * Bank Reconciliation entity for reconciling bank statements with general ledger
 * Skeleton entity for Phase 4 implementation
 * Will be used to match bank statement transactions with journal entry lines
 */
@Entity('bank_reconciliations')
@Index(['accountId'])
@Index(['fiscalPeriodId'])
@Index(['reconciliationDate'])
@Index(['status'])
export class BankReconciliation extends BaseEntity {
  @Column({
    type: 'date',
    comment: 'Date of reconciliation',
  })
  @IsDate()
  reconciliationDate: Date;

  @Column({
    type: 'uuid',
    comment: 'Bank account (Chart of Account ID)',
  })
  @IsUUID()
  accountId: string;

  @Column({
    type: 'uuid',
    comment: 'Fiscal period ID',
  })
  @IsUUID()
  fiscalPeriodId: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Balance per bank statement',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  statementBalance: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Balance per books (general ledger)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  bookBalance: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Difference between statement and book balance',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  difference: number;

  @Column({
    type: 'enum',
    enum: BankReconciliationStatus,
    default: BankReconciliationStatus.IN_PROGRESS,
    comment: 'Reconciliation status',
  })
  @IsEnum(BankReconciliationStatus)
  status: BankReconciliationStatus;

  // Relationships
  @ManyToOne(() => ChartOfAccount, (account) => account.bankReconciliations, {
    onDelete: 'RESTRICT',
    eager: false,
  })
  @JoinColumn({ name: 'accountId' })
  account: ChartOfAccount;

  @ManyToOne(() => FiscalPeriod, (period) => period.bankReconciliations, {
    onDelete: 'RESTRICT',
    eager: false,
  })
  @JoinColumn({ name: 'fiscalPeriodId' })
  fiscalPeriod: FiscalPeriod;

  @OneToMany(() => ReconciledTransaction, (transaction) => transaction.reconciliation, {
    cascade: true,
    eager: false,
  })
  reconciledTransactions: ReconciledTransaction[];

  // Computed properties
  get isCompleted(): boolean {
    return this.status === BankReconciliationStatus.COMPLETED;
  }

  get isInProgress(): boolean {
    return this.status === BankReconciliationStatus.IN_PROGRESS;
  }

  get isBalanced(): boolean {
    return Math.abs(Number(this.difference)) < 0.01; // Allow for rounding differences
  }

  // Helper methods
  calculateDifference(): void {
    this.difference = Number(this.statementBalance) - Number(this.bookBalance);
  }

  complete(): void {
    if (!this.isBalanced) {
      throw new Error('Cannot complete reconciliation with unbalanced difference');
    }
    this.status = BankReconciliationStatus.COMPLETED;
  }

  reopen(): void {
    this.status = BankReconciliationStatus.IN_PROGRESS;
  }
}
