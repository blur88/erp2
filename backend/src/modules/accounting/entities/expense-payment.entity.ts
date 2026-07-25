import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { Expense } from './expense.entity';

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

  @Column({ type: 'uuid', nullable: true })
  sourcePaymentId: string | null;

  @ManyToOne(() => Expense, (e) => e.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expenseId' })
  expense: Expense;

  @ManyToOne(() => PaymentMethodEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethodEntity;

  @ManyToOne(() => ExpensePayment, { nullable: true })
  @JoinColumn({ name: 'sourcePaymentId' })
  sourcePayment: ExpensePayment | null;
}
