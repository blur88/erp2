import { Entity, Column, Index, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ChartOfAccount } from './chart-of-account.entity';
import { ExpensePayment } from './expense-payment.entity';

export enum ExpenseDocumentStatus { DRAFT = 'DRAFT', CANCELLED = 'CANCELLED' }
export enum ExpensePaymentStatus { UNPAID = 'UNPAID', PARTIAL = 'PARTIAL', PAID = 'PAID' }

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

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'expenseAccountId' })
  expenseAccount: ChartOfAccount;

  @OneToMany(() => ExpensePayment, (p) => p.expense)
  payments: ExpensePayment[];
}
