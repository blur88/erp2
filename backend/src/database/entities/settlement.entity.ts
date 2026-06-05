import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDecimal,
  IsDate,
  MaxLength,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { PaymentMethodEntity } from './payment-method.entity';

export enum SettlementStatus {
  DRAFT = 'draft',
  POSTED = 'posted',
  REVERSED = 'reversed',
}

@Entity('settlements')
@Index(['settlementNumber'], { unique: true })
@Index(['paymentMethodId'])
@Index(['status'])
@Index(['settlementDate'])
export class Settlement extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 30,
    unique: true,
    comment: 'Unique settlement reference number',
  })
  @IsString()
  @MaxLength(30)
  settlementNumber: string;

  @Column({
    type: 'uuid',
    comment: 'Payment method ID',
  })
  paymentMethodId: string;

  @Column({
    type: 'date',
    comment: 'Date money arrived in bank',
  })
  @IsDate()
  settlementDate: Date;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Total settled amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  totalAmount: number;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Bank reference number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    default: SettlementStatus.DRAFT,
    comment: 'Settlement status',
  })
  @IsEnum(SettlementStatus)
  status: SettlementStatus;

  @ManyToOne(() => PaymentMethodEntity, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethodEntity;
}
