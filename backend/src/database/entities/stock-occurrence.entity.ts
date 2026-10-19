import {
  Entity,
  Column,
  Index,
  Check,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  IsUUID,
  IsDate,
  IsOptional,
  IsString,
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
} from 'class-validator';

export enum StockOccurrenceKind {
  RECEIPT = 'receipt',
  FULFILMENT = 'fulfilment',
  RECEIPT_REVERSAL = 'receipt_reversal',
  FULFILMENT_REVERSAL = 'fulfilment_reversal',
}

export const RECEIPT_LINE_EVIDENCE_VERSION = 1;

/**
 * A distinct, evidenced stock occurrence (receipt, fulfilment, or a reversal
 * of one). Each occurrence owns its movements, batches, provenance and journal
 * entries. Nothing here is ever deleted.
 */
@Entity('stock_occurrences')
@Check(
  'CHK_stock_occurrence_receipt_evidence_version',
  '"receiptEvidenceVersion" IS NULL OR ("kind" = \'receipt\' AND "receiptEvidenceVersion" >= 1)',
)
@Index('UQ_stock_occurrence_reverses', ['reversesOccurrenceId'], {
  unique: true,
  where: '"reversesOccurrenceId" IS NOT NULL',
})
export class StockOccurrence {
  @PrimaryGeneratedColumn('uuid')
  @IsOptional()
  @IsUUID(4)
  id: string;

  @Column({
    type: 'enum',
    enum: StockOccurrenceKind,
    comment: 'Kind of stock occurrence',
  })
  @IsEnum(StockOccurrenceKind)
  kind: StockOccurrenceKind;

  @Column({
    type: 'varchar',
    length: 30,
    comment: "Source document type ('purchase_order' | 'sales_order')",
  })
  @IsString()
  @MaxLength(30)
  documentType: string;

  @Column({
    type: 'uuid',
    comment: 'Source document id',
  })
  @IsUUID(4)
  documentId: string;

  @Column({
    type: 'timestamptz',
    comment: 'When the occurrence happened',
  })
  @IsDate()
  occurredAt: Date;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Actor user id',
  })
  @IsOptional()
  @IsUUID(4)
  actorUserId?: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Actor username',
  })
  @IsOptional()
  @IsString()
  actorUsername?: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'The occurrence this one reverses',
  })
  @IsOptional()
  @IsUUID(4)
  reversesOccurrenceId?: string;

  @ManyToOne(() => StockOccurrence, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'reversesOccurrenceId' })
  reversesOccurrence?: StockOccurrence;

  @Column({
    type: 'numeric',
    precision: 15,
    scale: 2,
    nullable: true,
    comment: 'Posted amount in currency units',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  postedAmount?: number;

  @Column({
    type: 'smallint',
    nullable: true,
    comment: 'Receipt evidence version; null identifies receipts recorded before stable PO-line identity',
  })
  @IsOptional()
  receiptEvidenceVersion?: number;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether this occurrence refers to pre-deploy (legacy) data',
  })
  isLegacy: boolean;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Legacy journal entry id (when isLegacy)',
  })
  @IsOptional()
  @IsUUID(4)
  legacyJournalEntryId?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for a reversal occurrence',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  @IsDate()
  readonly createdAt: Date;
}
