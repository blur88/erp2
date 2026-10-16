import { Entity, Column, ManyToOne, JoinColumn, Index, Check } from 'typeorm';
import { BaseEntity } from './base.entity';
import type { Supplier } from './supplier.entity';
import type { PurchaseOrder } from './purchase-order.entity';
import type { PaymentMethodEntity } from './payment-method.entity';
import type { JournalEntry } from '../../modules/accounting/entities/journal-entry.entity';

@Entity('vendor_payments')
@Index(['supplierId', 'status'])
@Index(['paymentDate'])
// Trigram index for fuzzy search (#960) — see product.entity.ts for why
// synchronize:false and the `as any` cast are required.
@Index('idx_vendor_payments_referencenumber_trgm', ['referenceNumber'], { synchronize: false } as any)
// #1401: void replaces soft delete. A voided row is the only inactive row
// allowed, and it must carry the moment it was voided.
@Check(
  'CHK_vendor_payments_void_state',
  `("status" = 'voided') = ("voidedAt" IS NOT NULL) AND ("status" = 'voided') = (NOT "isActive")`,
)
@Check('CHK_vendor_payments_never_soft_deleted', `"deletedAt" IS NULL`)
export class VendorPayment extends BaseEntity {
  @Column({ type: 'uuid' })
  supplierId: string;

  @Column({ type: 'uuid', nullable: true })
  purchaseOrderId: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  amount: string;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({ type: 'uuid', nullable: true })
  paymentMethodId: string | null;

  @Column({ length: 100, nullable: true })
  referenceNumber: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ length: 20, default: 'pending' })
  status: string; // 'pending' | 'completed' | 'voided'

  @Column({ type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  voidedByUserId: string | null;

  @Column({ type: 'uuid', nullable: true })
  voidReversalEntryId: string | null;

  // Relations
  @ManyToOne('Supplier', { eager: true })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @ManyToOne('PurchaseOrder', { nullable: true })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;

  @ManyToOne('PaymentMethodEntity', { nullable: true, eager: true })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethodEntity: PaymentMethodEntity;

  // The journal entry that reversed this payment's original, when the void
  // was a true reversal. RESTRICT: history that reversed a payment must not
  // vanish while the void still points at it.
  @ManyToOne('JournalEntry', { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'voidReversalEntryId',
    foreignKeyConstraintName: 'FK_vendor_payments_void_reversal',
  })
  voidReversalEntry: JournalEntry | null;
}
