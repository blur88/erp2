import { Entity, Column, Index, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import type { ChartOfAccount } from './chart-of-account.entity';
import type { ExpensePayment } from './expense-payment.entity';

// Member order is pinned to the migration chain, NOT to the logical lifecycle
// (#1056). Genesis created the type as ('DRAFT', 'CANCELLED'); COMPLETED was
// appended later by 1786000000000-AddExpenseCompletedStatus via `ALTER TYPE
// ... ADD VALUE`, which has no BEFORE/AFTER clause and therefore lands last.
// verify-baseline.sh compares a migrated schema against a schema:sync
// reference built from this declaration, so reordering these into lifecycle
// order (DRAFT, COMPLETED, CANCELLED) re-breaks that gate.
export enum ExpenseDocumentStatus { DRAFT = 'DRAFT', CANCELLED = 'CANCELLED', COMPLETED = 'COMPLETED' }
export enum ExpensePaymentStatus { UNPAID = 'UNPAID', PARTIAL = 'PARTIAL', PAID = 'PAID', OVERPAID = 'OVERPAID' }

@Entity('expenses')
@Index(['expenseDate'])
@Index(['expenseAccountId'])
@Index(['documentStatus'])
@Index(['paymentStatus'])
export class Expense extends BaseEntity {
  @Column({ type: 'varchar', length: 30, unique: true })
  expenseNumber: string;

  @Column({ type: 'date' })
  expenseDate: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  payee: string | null;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ type: 'uuid' })
  expenseAccountId: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  totalAmount: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: '0.0000' })
  paidAmount: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  balance: string;

  @Column({ type: 'enum', enum: ExpenseDocumentStatus, default: ExpenseDocumentStatus.DRAFT })
  documentStatus: ExpenseDocumentStatus;

  @Column({ type: 'enum', enum: ExpensePaymentStatus, default: ExpensePaymentStatus.UNPAID })
  paymentStatus: ExpensePaymentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @ManyToOne('ChartOfAccount', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'expenseAccountId' })
  expenseAccount: ChartOfAccount;

  @OneToMany('ExpensePayment', 'expense')
  payments: ExpensePayment[];
}
