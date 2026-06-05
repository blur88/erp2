import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import { IsString, IsOptional, IsDecimal, IsUUID } from "class-validator";
import { BaseEntity } from "./base.entity";
import { JournalEntry } from "./journal-entry.entity";
import { ChartOfAccount } from "./chart-of-account.entity";
import { ReconciledTransaction } from "./reconciled-transaction.entity";

/**
 * Journal Entry Line entity for individual debit/credit line items
 * Each line represents one account affected by the journal entry
 */
@Entity("journal_entry_lines")
@Index(["journalEntryId"])
@Index(["accountId"])
export class JournalEntryLine extends BaseEntity {
  @Column({
    type: "uuid",
    comment: "Journal entry ID",
  })
  @IsUUID()
  journalEntryId: string;

  @Column({
    type: "uuid",
    comment: "Chart of account ID",
  })
  @IsUUID()
  accountId: string;

  @Column({
    type: "decimal",
    precision: 15,
    scale: 4,
    default: 0,
    comment: "Debit amount",
  })
  @IsDecimal({ decimal_digits: "0,4" })
  debitAmount: number;

  @Column({
    type: "decimal",
    precision: 15,
    scale: 4,
    default: 0,
    comment: "Credit amount",
  })
  @IsDecimal({ decimal_digits: "0,4" })
  creditAmount: number;

  @Column({
    type: "text",
    nullable: true,
    comment: "Line item memo/description",
  })
  @IsOptional()
  @IsString()
  memo?: string;

  // Relationships
  @ManyToOne(() => JournalEntry, (entry) => entry.lines, {
    onDelete: "CASCADE",
    eager: false,
  })
  @JoinColumn({ name: "journalEntryId" })
  journalEntry: JournalEntry;

  @ManyToOne(() => ChartOfAccount, (account) => account.journalEntryLines, {
    onDelete: "RESTRICT",
    eager: false,
  })
  @JoinColumn({ name: "accountId" })
  account: ChartOfAccount;

  @OneToMany(
    () => ReconciledTransaction,
    (reconciled) => reconciled.journalEntryLine,
    {
      cascade: false,
    },
  )
  reconciledTransactions: ReconciledTransaction[];

  // Computed properties
  get isDebit(): boolean {
    return Number(this.debitAmount) > 0;
  }

  get isCredit(): boolean {
    return Number(this.creditAmount) > 0;
  }

  get amount(): number {
    return Number(this.debitAmount) || Number(this.creditAmount);
  }

  get type(): "debit" | "credit" {
    return this.isDebit ? "debit" : "credit";
  }

  // Helper methods
  validate(): void {
    const debit = Number(this.debitAmount);
    const credit = Number(this.creditAmount);

    // A line must have either debit or credit, but not both
    if (debit > 0 && credit > 0) {
      throw new Error(
        "A journal entry line cannot have both debit and credit amounts",
      );
    }

    if (debit === 0 && credit === 0) {
      throw new Error(
        "A journal entry line must have either a debit or credit amount",
      );
    }
  }
}
