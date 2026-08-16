import { Entity, Column, OneToMany, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { PostingType } from './posting-type.enum';
import { AccountingSourceType } from './source-type.enum';
import { JournalEntryLine } from './journal-entry-line.entity';

// Idempotency is enforced by the database, not only by the read-then-insert
// guard in AccountingPostingService.findExistingEntry(): that check-then-act
// pattern has a race window where two concurrent identical posting commands
// both find nothing and both insert. This partial unique index closes it.
//
// Partial, because it must constrain only *original* entries carrying an event
// key: reversals intentionally duplicate their original's
// (sourceType, sourceEventId, postingType), and entries with no sourceEventId
// (e.g. sales fulfilment) are not event-keyed at all.
@Index(
  'UQ_journal_entry_source_event',
  ['sourceType', 'sourceEventId', 'postingType'],
  { unique: true, where: '"reversalOfEntryId" IS NULL AND "sourceEventId" IS NOT NULL' },
)
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
