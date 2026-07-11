import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { JournalEntry } from './journal-entry.entity';
import { ChartOfAccount } from './chart-of-account.entity';

@Entity('journal_entry_line')
export class JournalEntryLine extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  entryId: string;

  @ManyToOne(() => JournalEntry, (entry) => entry.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'entryId' })
  entry: JournalEntry;

  @Index()
  @Column({ type: 'uuid' })
  accountId: string;

  @ManyToOne(() => ChartOfAccount)
  @JoinColumn({ name: 'accountId' })
  account: ChartOfAccount;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  debit: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  credit: string;
}
