import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DataSource, QueryRunner } from "typeorm";
import { AppModule } from "../src/app.module";

const gatedBody = `CREATE OR REPLACE FUNCTION journal_entry_open_posting_mark() RETURNS trigger AS $$ BEGIN IF (SELECT status FROM inventory_valuation_state WHERE id=true) <> 'active' THEN RETURN NEW; END IF; INSERT INTO journal_entry_open_postings("entryId") VALUES (NEW.id); RETURN NEW; END; $$ LANGUAGE plpgsql`;
const unconditionalBody = `CREATE OR REPLACE FUNCTION journal_entry_open_posting_mark() RETURNS trigger AS $$ BEGIN INSERT INTO journal_entry_open_postings("entryId") VALUES (NEW.id); RETURN NEW; END; $$ LANGUAGE plpgsql`;

describe.each([
  ["the originally applied gated body", gatedBody, true],
  ["the out-of-band unconditional body", unconditionalBody, false],
])(
  "open-posting forward migration from %s",
  (_label, initialBody, initiallyGated) => {
    let app: INestApplication;
    let dataSource: DataSource;
    let queryRunner: QueryRunner;

    beforeAll(async () => {
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      await app.init();
      dataSource = app.get(DataSource);
    });

    beforeEach(async () => {
      queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      await queryRunner.query(initialBody);
    });

    afterEach(async () => {
      if (queryRunner?.isTransactionActive)
        await queryRunner.rollbackTransaction();
      await queryRunner?.release();
    });

    afterAll(async () => app.close());

    it("up installs unconditional marking and down restores the applied gated body", async () => {
      const before = await queryRunner.query(
        `SELECT pg_get_functiondef('journal_entry_open_posting_mark()'::regprocedure) AS definition`,
      );
      expect(
        before[0].definition.includes("status FROM inventory_valuation_state"),
      ).toBe(initiallyGated);

      // Dynamic loading keeps this regression test runnable before the migration exists.

      const migrations =
        await import("../src/database/migrations/1793284800000-AlwaysMarkOpenJournalPostings");

      const Migration =
        migrations.AlwaysMarkOpenJournalPostings1793284800000 as new () => {
          up(runner: QueryRunner): Promise<void>;
          down(runner: QueryRunner): Promise<void>;
        };
      const migration = new Migration();

      await migration.up(queryRunner);
      const [afterUp] = await queryRunner.query(
        `SELECT pg_get_functiondef('journal_entry_open_posting_mark()'::regprocedure) AS definition`,
      );
      expect(afterUp.definition).not.toContain("inventory_valuation_state");

      await migration.down(queryRunner);
      const [afterDown] = await queryRunner.query(
        `SELECT pg_get_functiondef('journal_entry_open_posting_mark()'::regprocedure) AS definition`,
      );
      expect(afterDown.definition).toContain(
        "status FROM inventory_valuation_state",
      );
      expect(afterDown.definition).toMatch(/<> 'active' THEN\s+RETURN NEW/);
    });
  },
);
