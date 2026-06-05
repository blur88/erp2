import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  MaxLength,
} from "class-validator";
import { BaseEntity } from "./base.entity";
import { JournalEntryLine } from "./journal-entry-line.entity";
import { AccountMapping } from "./account-mapping.entity";
import { BankReconciliation } from "./bank-reconciliation.entity";

export enum AccountType {
  ASSET = "ASSET",
  LIABILITY = "LIABILITY",
  EQUITY = "EQUITY",
  REVENUE = "REVENUE",
  EXPENSE = "EXPENSE",
}

/**
 * Chart of Account entity for managing general ledger accounts
 * Supports hierarchical account structure (parent/child relationships)
 */
@Entity("chart_of_accounts")
@Index(["code"], { unique: true })
@Index(["type"])
@Index(["parentId"])
@Index(["isActive"])
export class ChartOfAccount extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
    comment: 'Unique account code (e.g., "1000", "4000")',
  })
  @IsString()
  @MaxLength(50)
  code: string;

  @Column({
    type: "varchar",
    length: 255,
    comment: 'Account name (e.g., "Cash", "Sales Revenue")',
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @Column({
    type: "enum",
    enum: AccountType,
    comment: "Account type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)",
  })
  @IsEnum(AccountType)
  type: AccountType;

  @Column({
    type: "uuid",
    nullable: true,
    comment: "Parent account ID for hierarchical accounts",
  })
  @IsOptional()
  parentId?: string;

  @Column({
    type: "boolean",
    default: true,
    comment: "Whether the account is active",
  })
  @IsBoolean()
  declare isActive: boolean;

  @Column({
    type: "boolean",
    default: false,
    comment:
      "Marks account as eligible for fund transfers (cash/bank accounts)",
  })
  @IsBoolean()
  isCashEquivalent: boolean;

  // Relationships
  @ManyToOne(() => ChartOfAccount, (account) => account.children, {
    onDelete: "SET NULL",
    nullable: true,
  })
  @JoinColumn({ name: "parentId" })
  parent?: ChartOfAccount;

  @OneToMany(() => ChartOfAccount, (account) => account.parent, {
    cascade: false,
  })
  children: ChartOfAccount[];

  @OneToMany(() => JournalEntryLine, (line) => line.account, {
    cascade: false,
  })
  journalEntryLines: JournalEntryLine[];

  @OneToMany(() => AccountMapping, (mapping) => mapping.account, {
    cascade: false,
  })
  accountMappings: AccountMapping[];

  @OneToMany(
    () => BankReconciliation,
    (reconciliation) => reconciliation.account,
    {
      cascade: false,
    },
  )
  bankReconciliations: BankReconciliation[];

  // Computed properties
  get fullCode(): string {
    // Build hierarchical code (e.g., "1000-1010")
    if (this.parent) {
      return `${this.parent.code}-${this.code}`;
    }
    return this.code;
  }

  get isParent(): boolean {
    return this.children && this.children.length > 0;
  }
}
