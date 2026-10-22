import { MigrationInterface, QueryRunner } from "typeorm";

export class AlwaysMarkOpenJournalPostings1793284800000 implements MigrationInterface {
  name = "AlwaysMarkOpenJournalPostings1793284800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION journal_entry_open_posting_mark()
      RETURNS trigger AS $$
      BEGIN
        INSERT INTO journal_entry_open_postings("entryId") VALUES (NEW.id);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION journal_entry_open_posting_mark()
      RETURNS trigger AS $$
      BEGIN
        IF (SELECT status FROM inventory_valuation_state WHERE id = true) <> 'active' THEN
          RETURN NEW;
        END IF;
        INSERT INTO journal_entry_open_postings("entryId") VALUES (NEW.id);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
  }
}
