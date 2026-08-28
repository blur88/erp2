import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IsDecimal, IsOptional, IsString } from 'class-validator';
import type { SalesOrder } from './sales-order.entity';
import type { PaymentMethodEntity } from './payment-method.entity';

@Entity('sales_order_payments')
@Index(['salesOrderId'])
@Index(['paymentDate'])
export class SalesOrderPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  salesOrderId: string;

  @Column({ type: 'uuid' })
  paymentMethodId: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  @IsDecimal({ decimal_digits: '0,4' })
  amount: string;

  @Column({ type: 'date' })
  paymentDate: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne('SalesOrder', 'salesOrderPayments', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'salesOrderId' })
  salesOrder: SalesOrder;

  @ManyToOne('PaymentMethodEntity', { eager: false })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: PaymentMethodEntity;
}
