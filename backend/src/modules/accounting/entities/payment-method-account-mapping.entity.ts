import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { IsUUID } from 'class-validator';
import { BaseEntity } from '../../../database/entities/base.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { ChartOfAccount } from './chart-of-account.entity';

/**
 * Payment Method → Chart of Accounts posting account (issue #1237).
 *
 * No row means "unmapped": posting falls back to the channel default
 * (cashAccountId / bankAccountId). That is why clearing a mapping DELETES the
 * row rather than nulling a column — and why the delete must be hard, never
 * soft. The unique index below is enforced by Postgres regardless of
 * `deletedAt`, so a soft-deleted row would permanently block remapping the
 * same method.
 */
@Entity('payment_method_account_mappings')
@Index(['paymentMethodId'], { unique: true })
export class PaymentMethodAccountMapping extends BaseEntity {
  @Column({ type: 'uuid' })
  @IsUUID()
  paymentMethodId: string;

  @ManyToOne(() => PaymentMethodEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod?: PaymentMethodEntity;

  @Column({ type: 'uuid' })
  @IsUUID()
  accountId: string;

  // RESTRICT: an account must not be deletable out from under a live mapping,
  // which would leave a dangling id that posting reads as invalid forever.
  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accountId' })
  account?: ChartOfAccount;
}
