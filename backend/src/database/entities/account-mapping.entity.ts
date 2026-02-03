import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  IsString,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { ChartOfAccount } from './chart-of-account.entity';

/**
 * Account Mapping entity for configuring automatic journal entry posting
 * Maps business transactions to specific general ledger accounts
 * Used in Phase 2 for auto-posting from sales, purchases, payments, etc.
 */
@Entity('account_mappings')
@Index(['mappingKey'], { unique: true })
@Index(['accountId'])
export class AccountMapping extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
    comment: 'Unique mapping key (e.g., "SALES_REVENUE", "ACCOUNTS_RECEIVABLE")',
  })
  @IsString()
  @MaxLength(100)
  mappingKey: string;

  @Column({
    type: 'uuid',
    comment: 'Chart of account ID to post to',
  })
  @IsUUID()
  accountId: string;

  @Column({
    type: 'text',
    comment: 'Description of what this mapping is for',
  })
  @IsString()
  description: string;

  // Relationships
  @ManyToOne(() => ChartOfAccount, (account) => account.accountMappings, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'accountId' })
  account: ChartOfAccount;

  // Helper methods
  static createKey(transactionType: string, accountType: string): string {
    return `${transactionType}_${accountType}`.toUpperCase();
  }

  get displayName(): string {
    return this.mappingKey.replace(/_/g, ' ');
  }
}
