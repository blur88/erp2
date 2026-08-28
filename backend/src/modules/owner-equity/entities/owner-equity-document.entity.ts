import { Entity, Column, Index, OneToMany, ManyToOne, JoinColumn, Check } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import type { Product } from '../../../database/entities/product.entity';
import type { OwnerEquitySettlement } from './owner-equity-settlement.entity';

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
  DRAFT = 'DRAFT', COMPLETED = 'COMPLETED', CANCELLED = 'CANCELLED',
}
export enum OwnerEquitySettlementStatus {
  UNSETTLED = 'UNSETTLED', PARTIAL = 'PARTIAL', SETTLED = 'SETTLED', OVERSETTLED = 'OVERSETTLED',
}

@Entity('owner_equity_documents')
@Check(
  'CHK_oe_monetary_shape',
  `type = 'STOCK_DRAWING' OR ("totalAmount" IS NOT NULL AND "settledAmount" IS NOT NULL AND balance IS NOT NULL AND "settlementStatus" IS NOT NULL AND "productId" IS NULL AND quantity IS NULL AND "unitCost" IS NULL AND "totalCost" IS NULL)`,
)
@Check(
  'CHK_oe_stock_shape',
  `type <> 'STOCK_DRAWING' OR ("productId" IS NOT NULL AND quantity IS NOT NULL AND "totalAmount" IS NULL AND "settledAmount" IS NULL AND balance IS NULL AND "settlementStatus" IS NULL)`,
)
@Check(
  'CHK_oe_stock_cost_on_complete',
  `type <> 'STOCK_DRAWING' OR "documentStatus" <> 'COMPLETED' OR ("unitCost" IS NOT NULL AND "totalCost" IS NOT NULL)`,
)
@Check(
  'CHK_oe_completion_metadata',
  `("documentStatus" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedBy" IS NOT NULL) OR ("documentStatus" <> 'COMPLETED' AND "completedAt" IS NULL AND "completedBy" IS NULL)`,
)
@Check(
  'CHK_oe_values',
  `("totalAmount" IS NULL OR "totalAmount" > 0) AND (quantity IS NULL OR quantity > 0) AND ("unitCost" IS NULL OR "unitCost" >= 0) AND ("totalCost" IS NULL OR "totalCost" >= 0)`,
)
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

  @ManyToOne('Product', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @OneToMany('OwnerEquitySettlement', 'document')
  settlements: OwnerEquitySettlement[];
}
