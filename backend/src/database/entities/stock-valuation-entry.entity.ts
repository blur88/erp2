import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Product } from "./product.entity";
import { StockMovement } from "./stock-movement.entity";
import { JournalEntry } from "../../modules/accounting/entities/journal-entry.entity";

export enum StockValuationEntryKind {
  RECEIPT = "receipt",
  ISSUE = "issue",
  FOUND = "found",
  OPENING = "opening",
  DECREASE_REVERSAL = "decrease_reversal",
  INCREASE_REVERSAL = "increase_reversal",
  CUTOVER_OPENING = "cutover_opening",
  METHOD_CHANGE = "method_change",
}

@Entity("stock_valuation_entries")
@Check(
  "CHK_stock_valuation_entry_movement_or_registration",
  "\"movementId\" IS NOT NULL OR \"kind\" IN ('cutover_opening', 'method_change')",
)
@Check("CHK_stock_valuation_entry_method", "\"method\" IN ('AVERAGE', 'FIFO')")
@Index("UQ_stock_valuation_entry_movement", ["movementId"], { unique: true })
@Index("UQ_stock_valuation_entry_reverses", ["reversesEntryId"], {
  unique: true,
})
@Index("IDX_stock_valuation_entries_product", ["productId", "createdAt"])
export class StockValuationEntry {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  productId: string;

  @Column({ type: "uuid", nullable: true })
  movementId: string | null;

  @Column({ type: "varchar", length: 30 })
  kind: StockValuationEntryKind;

  @Column({ type: "varchar", length: 10 })
  method: "AVERAGE" | "FIFO";

  @Column({ type: "numeric", precision: 15, scale: 4 })
  quantity: string;

  @Column({ type: "numeric", precision: 15, scale: 2 })
  value: string;

  @Column({ type: "numeric", precision: 15, scale: 4 })
  runningQuantity: string;

  @Column({ type: "numeric", precision: 15, scale: 2 })
  runningValue: string;

  @Column({ type: "uuid", nullable: true })
  journalEntryId: string | null;

  @Column({ type: "uuid", nullable: true })
  reversesEntryId: string | null;

  @Column({ type: "numeric", precision: 15, scale: 4, nullable: true })
  defaultUnitValue: string | null;

  @Column({ type: "text", nullable: true })
  explanation: string | null;

  @Column({ type: "uuid", nullable: true })
  actorUserId: string | null;

  @CreateDateColumn({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({
    name: "productId",
    foreignKeyConstraintName: "FK_stock_valuation_entry_product",
  })
  product: Product;

  @ManyToOne(() => StockMovement, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({
    name: "movementId",
    foreignKeyConstraintName: "FK_stock_valuation_entry_movement",
  })
  movement: StockMovement | null;

  @ManyToOne(() => JournalEntry, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({
    name: "journalEntryId",
    foreignKeyConstraintName: "FK_stock_valuation_entry_journal_entry",
  })
  journalEntry: JournalEntry | null;

  @ManyToOne(() => StockValuationEntry, {
    nullable: true,
    onDelete: "RESTRICT",
  })
  @JoinColumn({
    name: "reversesEntryId",
    foreignKeyConstraintName: "FK_stock_valuation_entry_reverses_entry",
  })
  reversesEntry: StockValuationEntry | null;
}
