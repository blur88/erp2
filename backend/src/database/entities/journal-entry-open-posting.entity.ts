import { Entity, PrimaryColumn } from 'typeorm';

@Entity('journal_entry_open_postings')
export class JournalEntryOpenPosting {
  @PrimaryColumn({ type: 'uuid' }) entryId: string;
}
