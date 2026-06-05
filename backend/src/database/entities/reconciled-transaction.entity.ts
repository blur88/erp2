import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { IsBoolean, IsUUID } from "class-validator";
import { BaseEntity } from "./base.entity";
import { BankReconciliation } from "./bank-reconciliation.entity";
import { JournalEntryLine } from "./journal-entry-line.entity";

/**
 * Reconciled Transaction entity for tracking which transactions have been reconciled
 * Skeleton entity for Phase 4 implementation
 * Links journal entry lines to bank reconciliation records
 */
@Entity("reconciled_transactions")
@Index(["reconciliationId"])
@Index(["journalEntryLineId"])
@Index(["cleared"])
export class ReconciledTransaction extends BaseEntity {
  @Column({
    type: "uuid",
    comment: "Bank reconciliation ID",
  })
  @IsUUID()
  reconciliationId: string;

  @Column({
    type: "uuid",
    comment: "Journal entry line ID being reconciled",
  })
  @IsUUID()
  journalEntryLineId: string;

  @Column({
    type: "boolean",
    default: false,
    comment: "Whether the transaction has cleared the bank",
  })
  @IsBoolean()
  cleared: boolean;

  // Relationships
  @ManyToOne(
    () => BankReconciliation,
    (reconciliation) => reconciliation.reconciledTransactions,
    {
      onDelete: "CASCADE",
      eager: false,
    },
  )
  @JoinColumn({ name: "reconciliationId" })
  reconciliation: BankReconciliation;

  @ManyToOne(() => JournalEntryLine, (line) => line.reconciledTransactions, {
    onDelete: "RESTRICT",
    eager: false,
  })
  @JoinColumn({ name: "journalEntryLineId" })
  journalEntryLine: JournalEntryLine;

  // Helper methods
  clear(): void {
    this.cleared = true;
  }

  unclear(): void {
    this.cleared = false;
  }

  toggle(): void {
    this.cleared = !this.cleared;
  }
}
