import {
  Entity,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import {
  IsString,
  IsEnum,
  IsDate,
  MaxLength,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { JournalEntry } from './journal-entry.entity';
import { BankReconciliation } from './bank-reconciliation.entity';

export enum FiscalPeriodStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/**
 * Fiscal Period entity for managing accounting periods
 * Controls which periods are open for journal entry posting
 */
@Entity('fiscal_periods')
@Index(['code'], { unique: true })
@Index(['startDate'])
@Index(['endDate'])
@Index(['status'])
export class FiscalPeriod extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 50,
    unique: true,
    comment: 'Unique period code (e.g., "2026-01", "Q1-2026")',
  })
  @IsString()
  @MaxLength(50)
  code: string;

  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Period name (e.g., "January 2026")',
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @Column({
    type: 'date',
    comment: 'Period start date',
  })
  @IsDate()
  startDate: Date;

  @Column({
    type: 'date',
    comment: 'Period end date',
  })
  @IsDate()
  endDate: Date;

  @Column({
    type: 'enum',
    enum: FiscalPeriodStatus,
    default: FiscalPeriodStatus.OPEN,
    comment: 'Period status (OPEN or CLOSED)',
  })
  @IsEnum(FiscalPeriodStatus)
  status: FiscalPeriodStatus;

  // Relationships
  @OneToMany(() => JournalEntry, (entry) => entry.fiscalPeriod, {
    cascade: false,
  })
  journalEntries: JournalEntry[];

  @OneToMany(() => BankReconciliation, (reconciliation) => reconciliation.fiscalPeriod, {
    cascade: false,
  })
  bankReconciliations: BankReconciliation[];

  // Computed properties
  get isOpen(): boolean {
    return this.status === FiscalPeriodStatus.OPEN;
  }

  get isClosed(): boolean {
    return this.status === FiscalPeriodStatus.CLOSED;
  }

  get durationDays(): number {
    const start = new Date(this.startDate).getTime();
    const end = new Date(this.endDate).getTime();
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  }

  // Helper methods
  canPost(): boolean {
    const today = new Date();
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);

    return this.isOpen && today >= start && today <= end;
  }

  close(): void {
    this.status = FiscalPeriodStatus.CLOSED;
  }

  reopen(): void {
    this.status = FiscalPeriodStatus.OPEN;
  }
}
