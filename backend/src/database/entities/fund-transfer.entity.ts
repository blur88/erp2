import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import {
  IsString,
  IsEnum,
  IsOptional,
  IsDate,
  IsNumber,
  Min,
  MaxLength,
  IsUUID,
} from "class-validator";
import { BaseEntity } from "./base.entity";
import { ChartOfAccount } from "./chart-of-account.entity";
import { JournalEntry } from "./journal-entry.entity";
import { FiscalPeriod } from "./fiscal-period.entity";

export enum FundTransferStatus {
  DRAFT = "draft",
  POSTED = "posted",
  REVERSED = "reversed",
}

@Entity("fund_transfers")
@Index(["referenceNumber"], { unique: true })
@Index(["transferDate"])
@Index(["status"])
@Index(["sourceAccountId"])
@Index(["destinationAccountId"])
@Index(["fiscalPeriodId"])
export class FundTransfer extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
    comment: "Auto-generated reference number e.g. TRF-26-001",
  })
  @IsString()
  @MaxLength(50)
  referenceNumber: string;

  @Column({
    type: "date",
    comment: "Date of the transfer",
  })
  @IsDate()
  transferDate: Date;

  @Column({
    type: "uuid",
    comment: "Source (From) account — must have isCashEquivalent=true",
  })
  @IsUUID()
  sourceAccountId: string;

  @Column({
    type: "uuid",
    comment: "Destination (To) account — must have isCashEquivalent=true",
  })
  @IsUUID()
  destinationAccountId: string;

  @Column({
    type: "decimal",
    precision: 15,
    scale: 2,
    comment: "Transfer amount — must be > 0",
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @Column({
    type: "text",
    nullable: true,
    comment: "Optional memo/notes",
  })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({
    type: "enum",
    enum: FundTransferStatus,
    default: FundTransferStatus.DRAFT,
    comment: "Transfer status",
  })
  @IsEnum(FundTransferStatus)
  status: FundTransferStatus;

  @Column({
    type: "uuid",
    nullable: true,
    comment:
      "Linked journal entry — nullable until JE is posted inside transaction",
  })
  @IsOptional()
  @IsUUID()
  journalEntryId?: string;

  @Column({
    type: "uuid",
    comment: "Fiscal period auto-detected from transferDate",
  })
  @IsUUID()
  fiscalPeriodId: string;

  // Relationships
  @ManyToOne(() => ChartOfAccount, { eager: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "sourceAccountId" })
  sourceAccount: ChartOfAccount;

  @ManyToOne(() => ChartOfAccount, { eager: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "destinationAccountId" })
  destinationAccount: ChartOfAccount;

  @ManyToOne(() => JournalEntry, {
    eager: false,
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "journalEntryId" })
  journalEntry?: JournalEntry;

  @ManyToOne(() => FiscalPeriod, { eager: false, onDelete: "RESTRICT" })
  @JoinColumn({ name: "fiscalPeriodId" })
  fiscalPeriod: FiscalPeriod;
}
