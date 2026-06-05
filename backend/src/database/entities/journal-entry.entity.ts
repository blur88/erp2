import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
} from "typeorm";
import {
  IsString,
  IsEnum,
  IsOptional,
  IsDate,
  MaxLength,
  IsUUID,
} from "class-validator";
import { BaseEntity } from "./base.entity";
import { FiscalPeriod } from "./fiscal-period.entity";
import { JournalEntryLine } from "./journal-entry-line.entity";

export enum JournalEntryStatus {
  DRAFT = "DRAFT",
  POSTED = "POSTED",
  REVERSED = "REVERSED",
}

/**
 * Journal Entry entity for recording accounting transactions
 * Implements double-entry bookkeeping with balanced debits and credits
 */
@Entity("journal_entries")
@Index(["referenceNumber"], { unique: true })
@Index(["entryDate"])
@Index(["status"])
@Index(["fiscalPeriodId"])
@Index(["sourceType", "sourceId"])
export class JournalEntry extends BaseEntity {
  @Column({
    type: "date",
    comment: "Transaction entry date",
  })
  @IsDate()
  entryDate: Date;

  @Column({
    type: "varchar",
    length: 50,
    unique: true,
    comment: 'Unique reference number (e.g., "JE-2026-001")',
  })
  @IsString()
  @MaxLength(50)
  referenceNumber: string;

  @Column({
    type: "text",
    comment: "Journal entry description",
  })
  @IsString()
  description: string;

  @Column({
    type: "enum",
    enum: JournalEntryStatus,
    default: JournalEntryStatus.DRAFT,
    comment: "Entry status (DRAFT, POSTED, REVERSED)",
  })
  @IsEnum(JournalEntryStatus)
  status: JournalEntryStatus;

  @Column({
    type: "uuid",
    comment: "Fiscal period ID",
  })
  @IsUUID()
  fiscalPeriodId: string;

  @Column({
    type: "uuid",
    nullable: true,
    comment: "ID of the entry being reversed (if this is a reversal entry)",
  })
  @IsOptional()
  reversalOfId?: string;

  @Column({
    type: "uuid",
    nullable: true,
    comment: "ID of the reversing entry (if this entry was reversed)",
  })
  @IsOptional()
  reversedById?: string;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
    comment: 'Source transaction type (e.g., "SALES_ORDER", "PAYMENT")',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceType?: string;

  @Column({
    type: "uuid",
    nullable: true,
    comment: "Source transaction ID (references originating transaction)",
  })
  @IsOptional()
  sourceId?: string;

  // Relationships
  @ManyToOne(() => FiscalPeriod, (period) => period.journalEntries, {
    onDelete: "RESTRICT",
    eager: false,
  })
  @JoinColumn({ name: "fiscalPeriodId" })
  fiscalPeriod: FiscalPeriod;

  @OneToMany(() => JournalEntryLine, (line) => line.journalEntry, {
    cascade: true,
    eager: false,
  })
  lines: JournalEntryLine[];

  @ManyToOne(() => JournalEntry, (entry) => entry.reversedBy, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "reversalOfId" })
  reversalOf?: JournalEntry;

  @OneToOne(() => JournalEntry, (entry) => entry.reversalOf, {
    nullable: true,
  })
  @JoinColumn({ name: "reversedById" })
  reversedBy?: JournalEntry;

  // Computed properties
  get isDraft(): boolean {
    return this.status === JournalEntryStatus.DRAFT;
  }

  get isPosted(): boolean {
    return this.status === JournalEntryStatus.POSTED;
  }

  get isReversed(): boolean {
    return this.status === JournalEntryStatus.REVERSED;
  }

  get totalDebits(): number {
    if (!this.lines || this.lines.length === 0) {
      return 0;
    }
    return this.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
  }

  get totalCredits(): number {
    if (!this.lines || this.lines.length === 0) {
      return 0;
    }
    return this.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0);
  }

  get isBalanced(): boolean {
    const debits = this.totalDebits;
    const credits = this.totalCredits;
    return Math.abs(debits - credits) < 0.01; // Allow for rounding differences
  }

  // Helper methods
  post(): void {
    if (!this.isBalanced) {
      throw new Error("Cannot post unbalanced journal entry");
    }
    if (!this.isDraft) {
      throw new Error("Can only post draft entries");
    }
    this.status = JournalEntryStatus.POSTED;
  }

  reverse(): void {
    if (!this.isPosted) {
      throw new Error("Can only reverse posted entries");
    }
    this.status = JournalEntryStatus.REVERSED;
  }

  calculateTotals(): void {
    // This should be called after lines are loaded
    // Totals are computed properties, but this method validates balance
    if (!this.isBalanced) {
      throw new Error(
        `Journal entry ${this.referenceNumber} is not balanced: Debits=${this.totalDebits}, Credits=${this.totalCredits}`,
      );
    }
  }
}
