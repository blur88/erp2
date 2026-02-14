import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Supplier } from './supplier.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { GoodsReceivedNote } from './goods-received-note.entity';
import { PaymentMethodEntity } from './payment-method.entity';

@Entity('vendor_payments')
@Index(['supplierId', 'status'])
@Index(['paymentDate'])
@Index(['grnId'])
export class VendorPayment extends BaseEntity {
  @Column({ length: 50, unique: true })
  paymentNumber: string;

  @Column({ type: 'uuid' })
  supplierId: string;

  @Column({ type: 'uuid', nullable: true })
  purchaseOrderId: string;

  @Column({ type: 'uuid', nullable: true })
  grnId: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  amount: number;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({ type: 'uuid', nullable: true })
  paymentMethodId: string | null;

  @Column({ length: 100, nullable: true })
  referenceNumber: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ length: 20, default: 'pending' })
  status: string; // 'pending', 'completed', 'cancelled'

  // Relations
  @ManyToOne(() => Supplier, { eager: true })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @ManyToOne(() => PurchaseOrder, { nullable: true })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;

  @ManyToOne(() => GoodsReceivedNote, { nullable: true, eager: true })
  @JoinColumn({ name: 'grnId' })
  grn: GoodsReceivedNote;

  @ManyToOne(() => PaymentMethodEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethodEntity: PaymentMethodEntity;
}
