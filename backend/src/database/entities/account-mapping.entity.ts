import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  IsString,
  IsEnum,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { ChartOfAccount } from './chart-of-account.entity';

export enum MappingType {
  SALES_REVENUE = 'sales_revenue',
  SALES_AR = 'sales_ar',
  SALES_COGS = 'sales_cogs',
  SALES_INVENTORY = 'sales_inventory',
  PURCHASE_INVENTORY = 'purchase_inventory',
  PURCHASE_AP = 'purchase_ap',
  PAYMENT_AR = 'payment_ar',
  VENDOR_PAYMENT_AP = 'vendor_payment_ap',
  INVENTORY_ASSET = 'inventory_asset',
  INVENTORY_ADJUSTMENT_GAIN = 'inventory_adjustment_gain',
  INVENTORY_ADJUSTMENT_LOSS = 'inventory_adjustment_loss',
  EQUITY_OWNERS_EQUITY = 'equity_owners_equity',
  EQUITY_DRAWINGS = 'equity_drawings',
  OPENING_BALANCE_EQUITY = 'opening_balance_equity',
}

/**
 * Account Mapping entity for configuring automatic journal entry posting
 * Maps business transactions to specific general ledger accounts
 * Used in Phase 2 for auto-posting from sales, purchases, payments, etc.
 */
@Entity('account_mappings')
@Index(['mappingType'], { unique: true })
@Index(['accountId'])
export class AccountMapping extends BaseEntity {
  @Column({
    name: 'mappingKey',
    type: 'varchar',
    length: 100,
    unique: true,
    comment: 'Mapping type (e.g., SALES_REVENUE, SALES_AR)',
  })
  @IsString()
  mappingType: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Chart of account ID to post to',
  })
  @IsUUID()
  accountId: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Description of what this mapping is for',
  })
  @IsString()
  description?: string;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Whether the mapping is active',
  })
  @IsBoolean()
  declare isActive: boolean;

  // Relationships
  @ManyToOne(() => ChartOfAccount, (account) => account.accountMappings, {
    onDelete: 'RESTRICT',
    eager: false,
    nullable: true,
  })
  @JoinColumn({ name: 'accountId' })
  account: ChartOfAccount;
}
