import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { AccountType } from './account-type.enum';
import { FormBExpenseCategory, FormBIncomeCategory } from './form-b-category.enum';

@Entity('chart_of_account')
export class ChartOfAccount extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'enum', enum: AccountType })
  type: AccountType;

  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne('ChartOfAccount', { nullable: true })
  @JoinColumn({ name: 'parentId' })
  parent?: ChartOfAccount | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // isActive is inherited from BaseEntity — do NOT redeclare.

  @Column({ type: 'varchar', length: 120, nullable: true })
  createdBy: string | null;

  @Column({ type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'boolean', default: true })
  isPostable: boolean;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  openingBalance: string;

  /**
   * Form B tax-line mapping (#1174). NULL means unmapped — an unmapped account
   * with movement falls back to N24 / N13 and is warned about, never dropped.
   *
   * Assignment requires write eligibility (form-b.eligibility.ts), but a
   * mapping is RETAINED through deactivation so historical years keep
   * classifying the way they were filed.
   */
  @Column({ type: 'enum', enum: FormBExpenseCategory, nullable: true })
  formBExpenseCategory: FormBExpenseCategory | null;

  @Column({ type: 'enum', enum: FormBIncomeCategory, nullable: true })
  formBIncomeCategory: FormBIncomeCategory | null;
}
