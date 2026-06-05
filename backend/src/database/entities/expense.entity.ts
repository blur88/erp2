import { Entity, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import {
  IsString,
  IsOptional,
  IsEnum,
  IsDecimal,
  IsDate,
  MaxLength,
} from "class-validator";
import { BaseEntity } from "./base.entity";
import { PaymentMethodEntity } from "./payment-method.entity";
import { ChartOfAccount } from "./chart-of-account.entity";
import { JournalEntry } from "./journal-entry.entity";

export enum ExpenseStatus {
  DRAFT = "draft",
  POSTED = "posted",
  REVERSED = "reversed",
}

@Entity("expenses")
@Index(["referenceNumber"], { unique: true })
@Index(["status"])
@Index(["expenseDate"])
@Index(["expenseAccountId"])
@Index(["paymentMethodId"])
export class Expense extends BaseEntity {
  @Column({ type: "varchar", length: 30, unique: true })
  @IsString()
  @MaxLength(30)
  referenceNumber: string;

  @Column({ type: "date" })
  @IsDate()
  expenseDate: Date;

  @Column({ type: "uuid" })
  expenseAccountId: string;

  @Column({ type: "decimal", precision: 12, scale: 4 })
  @IsDecimal({ decimal_digits: "0,4" })
  amount: number;

  @Column({ type: "uuid" })
  paymentMethodId: string;

  @Column({ type: "text", nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  vendor?: string;

  @Column({
    type: "enum",
    enum: ExpenseStatus,
    default: ExpenseStatus.DRAFT,
  })
  @IsEnum(ExpenseStatus)
  status: ExpenseStatus;

  @Column({ type: "uuid", nullable: true })
  @IsOptional()
  journalEntryId?: string;

  @ManyToOne(() => PaymentMethodEntity, { onDelete: "RESTRICT", eager: true })
  @JoinColumn({ name: "paymentMethodId" })
  paymentMethod: PaymentMethodEntity;

  @ManyToOne(() => ChartOfAccount, { onDelete: "RESTRICT", eager: true })
  @JoinColumn({ name: "expenseAccountId" })
  expenseAccount: ChartOfAccount;

  @ManyToOne(() => JournalEntry, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "journalEntryId" })
  journalEntry?: JournalEntry;
}
