import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import type { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import type { Expense } from './expense.entity';

@Entity('expense_payments')
@Index(['expenseId'])
@Index(['paymentDate'])
@Index(['sourcePaymentId'])
export class ExpensePayment extends BaseEntity {
  @Column({ type: 'uuid' })
  expenseId: string;

  @Column({ type: 'uuid' })
  paymentMethodId: string;

  @Column({ type: 'date' })
  paymentDate: string;

  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  /**
   * Legacy lineage: the payment a refund offset, for refunds recorded before
   * cross-method refunds (#1096). NULL on all new rows — a refund is identified
   * by `amount < 0`, never by this column. Retained for historical display/audit.
   */
  @Column({ type: 'uuid', nullable: true })
  sourcePaymentId: string | null;

  @ManyToOne('Expense', 'payments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expenseId' })
  expense: Expense;

  @ManyToOne('PaymentMethodEntity', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethodEntity;

  @ManyToOne('ExpensePayment', { nullable: true })
  @JoinColumn({ name: 'sourcePaymentId' })
  sourcePayment: ExpensePayment | null;
}
