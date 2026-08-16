import { Entity, Column, Index, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { Product } from '../../../database/entities/product.entity';
import { OwnerEquitySettlement } from './owner-equity-settlement.entity';

// These three enum types are CREATEd whole by the Owner Equity migration, so
// their member order is free at authoring time — but it freezes the moment that
// migration lands. verify-baseline.sh compares a migrated schema against a
// schema:sync reference built from these declarations, so any later reorder (or
// a member appended here but ALTER TYPE'd elsewhere) re-breaks that gate.
export enum OwnerEquityType {
  CAPITAL_INJECTION = 'CAPITAL_INJECTION',
  CASH_DRAWING = 'CASH_DRAWING',
  STOCK_DRAWING = 'STOCK_DRAWING',
}
export enum OwnerEquityDocumentStatus {
  DRAFT = 'DRAFT', READY = 'READY', COMPLETED = 'COMPLETED', CANCELLED = 'CANCELLED',
}
export enum OwnerEquitySettlementStatus {
  UNSETTLED = 'UNSETTLED', PARTIAL = 'PARTIAL', SETTLED = 'SETTLED', OVERSETTLED = 'OVERSETTLED',
}

@Entity('owner_equity_documents')
@Index(['equityDate'])
@Index(['type'])
@Index(['documentStatus'])
@Index(['settlementStatus'])
@Index(['productId'])
export class OwnerEquityDocument extends BaseEntity {
  @Column({ type: 'varchar', length: 30, unique: true })
  referenceNumber: string;

  @Column({ type: 'date' })
  equityDate: string;

  @Column({ type: 'enum', enum: OwnerEquityType })
  type: OwnerEquityType;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'enum', enum: OwnerEquityDocumentStatus, default: OwnerEquityDocumentStatus.DRAFT })
  documentStatus: OwnerEquityDocumentStatus;

  @Column({ type: 'enum', enum: OwnerEquitySettlementStatus, nullable: true })
  settlementStatus: OwnerEquitySettlementStatus | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  totalAmount: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  settledAmount: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  balance: string | null;

  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  quantity: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  unitCost: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  totalCost: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  completedBy: string | null;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @OneToMany(() => OwnerEquitySettlement, (s) => s.document)
  settlements: OwnerEquitySettlement[];
}
