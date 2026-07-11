import { Entity, Column, OneToMany, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { PostingType } from './posting-type.enum';
import { AccountingSourceType } from './source-type.enum';
import { JournalEntryLine } from './journal-entry-line.entity';

@Entity('journal_entry')
export class JournalEntry extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  journalNo: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  createdBy: string | null;

  @Column({ type: 'date' })
  entryDate: string;

  @Column({ type: 'enum', enum: AccountingSourceType })
  sourceType: AccountingSourceType;

  @Column({ type: 'uuid', nullable: true })
  sourceDocumentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  sourceEventId: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  sourceRef: string | null;

  @Column({ type: 'enum', enum: PostingType })
  postingType: PostingType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index({ unique: true })
  @Column({ type: 'uuid', nullable: true })
  reversalOfEntryId: string | null;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'reversalOfEntryId' })
  reversalOf?: JournalEntry | null;

  @OneToMany(() => JournalEntryLine, (line) => line.entry, { cascade: true })
  lines: JournalEntryLine[];
}
