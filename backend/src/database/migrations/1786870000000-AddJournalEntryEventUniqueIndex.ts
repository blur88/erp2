import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Closes the idempotency race in AccountingPostingService.
 *
 * findExistingEntry() is a check-then-act: two concurrent identical posting
 * commands can both find no existing entry and both insert, producing duplicate
 * journal entries for one settlement or stock movement. This partial unique
 * index makes the database the authority; the service absorbs the resulting
 * unique violation inside a savepoint and returns the winning entry.
 *
 * Partial, deliberately:
 *  - `reversalOfEntryId IS NULL` — a reversal intentionally carries the same
 *    (sourceType, sourceEventId, postingType) as the original it reverses.
 *  - `sourceEventId IS NOT NULL` — entries with no event key (sales fulfilment
 *    revenue/COGS, opening balances) are not event-keyed and must not collide.
 */
export class AddJournalEntryEventUniqueIndex1786870000000 implements MigrationInterface {
    name = 'AddJournalEntryEventUniqueIndex1786870000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Guard against pre-existing duplicates: the index cannot be created if
        // any exist, and failing here with a clear message beats an opaque
        // "could not create unique index" from PostgreSQL.
        const duplicates = await queryRunner.query(`
            SELECT "sourceType", "sourceEventId", "postingType", COUNT(*) AS n
            FROM journal_entry
            WHERE "reversalOfEntryId" IS NULL AND "sourceEventId" IS NOT NULL
            GROUP BY "sourceType", "sourceEventId", "postingType"
            HAVING COUNT(*) > 1
        `);
        if (duplicates.length > 0) {
            throw new Error(
                `Cannot create UQ_journal_entry_source_event: ${duplicates.length} duplicate ` +
                `(sourceType, sourceEventId, postingType) group(s) already exist in journal_entry. ` +
                `These are duplicate postings from the pre-index race and must be reconciled ` +
                `manually — reverse the surplus entries — before this migration can run.`,
            );
        }

        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_journal_entry_source_event"
            ON "journal_entry" ("sourceType", "sourceEventId", "postingType")
            WHERE "reversalOfEntryId" IS NULL AND "sourceEventId" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_journal_entry_source_event"`);
    }
}
