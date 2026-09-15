import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ChartOfAccount } from './chart-of-account.entity';
import { BalanceSheetGroup } from '../services/balance-sheet-groups.resolve';

/**
 * Explicit Balance Sheet line grouping (issue #1239).
 *
 * One row per EXPLICITLY assigned account. Absence of a row means the account
 * is ungrouped — which, for the two fallback accounts, is what re-arms their
 * settings-key contribution (see balance-sheet-groups.resolve.ts).
 *
 * `accountId` IS THE PRIMARY KEY, not a surrogate id with a unique index. That
 * is what makes membership of both groups at once unrepresentable in the
 * database rather than merely rejected by a service. The service still checks
 * it first so the error names the account instead of surfacing a Postgres
 * constraint violation.
 *
 * NOT a BaseEntity, for the same reason PaymentMethodAccountMapping is not:
 * row presence is the only representation of "grouped", so an `isActive` or
 * `deletedAt` column would be a second, contradictory one — and a soft-deleted
 * row would permanently occupy the primary key, making the account
 * ungroupable forever.
 *
 * RESTRICT on the account FK: an account must not be deletable out from under
 * a grouping, which would leave the Balance Sheet reading a dangling id.
 */
@Entity('balance_sheet_account_groups')
export class BalanceSheetAccountGroup {
  @PrimaryColumn({ type: 'uuid' })
  accountId: string;

  @ManyToOne(() => ChartOfAccount, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'accountId' })
  account?: ChartOfAccount;

  @Column({ type: 'enum', enum: BalanceSheetGroup })
  groupLine: BalanceSheetGroup;
}
