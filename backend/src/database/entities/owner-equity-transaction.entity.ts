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
import { JournalEntry } from "./journal-entry.entity";

export enum OwnerEquityTransactionType {
  CAPITAL_INJECTION = "capital_injection",
  OWNER_DRAWING = "owner_drawing",
}

export enum OwnerEquityTransactionStatus {
  DRAFT = "draft",
  POSTED = "posted",
  REVERSED = "reversed",
}

@Entity("owner_equity_transactions")
@Index(["referenceNumber"], { unique: true })
@Index(["type"])
@Index(["status"])
@Index(["transactionDate"])
@Index(["paymentMethodId"])
export class OwnerEquityTransaction extends BaseEntity {
  @Column({ type: "varchar", length: 30, unique: true })
  @IsString()
  @MaxLength(30)
  referenceNumber: string;

  @Column({ type: "date" })
  @IsDate()
  transactionDate: Date;

  @Column({
    type: "enum",
    enum: OwnerEquityTransactionType,
  })
  @IsEnum(OwnerEquityTransactionType)
  type: OwnerEquityTransactionType;

  @Column({ type: "decimal", precision: 12, scale: 4 })
  @IsDecimal({ decimal_digits: "0,4" })
  amount: number;

  @Column({ type: "uuid" })
  paymentMethodId: string;

  @Column({ type: "text", nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({
    type: "enum",
    enum: OwnerEquityTransactionStatus,
    default: OwnerEquityTransactionStatus.DRAFT,
  })
  @IsEnum(OwnerEquityTransactionStatus)
  status: OwnerEquityTransactionStatus;

  @Column({ type: "uuid", nullable: true })
  @IsOptional()
  journalEntryId?: string;

  @ManyToOne(() => PaymentMethodEntity, { onDelete: "RESTRICT", eager: true })
  @JoinColumn({ name: "paymentMethodId" })
  paymentMethod: PaymentMethodEntity;

  @ManyToOne(() => JournalEntry, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "journalEntryId" })
  journalEntry?: JournalEntry;
}
