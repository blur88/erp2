import {
  Entity,
  Column,
  Index,
  BeforeInsert,
} from 'typeorm';
import {
  IsString,
  IsBoolean,
  IsInt,
  MaxLength,
  IsIn,
} from 'class-validator';
import { BaseEntity } from './base.entity';

@Entity('payment_methods')
@Index(['code'], { unique: true })
@Index(['isActive'])
export class PaymentMethodEntity extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 20,
    unique: true,
    comment: 'Unique code e.g. CASH, TNG, SHOPEE',
  })
  @IsString()
  @MaxLength(20)
  code: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: 'Display name e.g. Touch n Go, Shopee',
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Display order in dropdowns',
  })
  @IsInt()
  sortOrder: number;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Whether this method is used for purchase order payments',
  })
  @IsBoolean()
  useForPurchases: boolean;

  @Column({
    type: 'varchar',
    length: 4,
    default: 'BANK',
    comment: 'Accounting channel: CASH or BANK',
  })
  @IsIn(['CASH', 'BANK'])
  accountingChannel: 'CASH' | 'BANK' = 'BANK';

  @BeforeInsert()
  setDefaultAccountingChannel() {
    if (this.accountingChannel === undefined) {
      this.accountingChannel = 'BANK';
    }
  }
}
