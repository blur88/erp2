import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import {
  seedBankAccount,
  seedContraAccount,
  seedBankJournalLine,
  insertReconciliationRaw,
  removeSuiteBankReconciliations,
  removeSuiteJournalEntries,
  removeSuiteAccounts,
} from './utils/bank-reconciliation-fixture';

let app: INestApplication;
let ds: DataSource;
const runId = randomUUID().slice(0, 6);

const suiteAccountIds: string[] = [];
const suiteEntryIds: string[] = [];
const suiteReconciliationIds: string[] = [];

let contraAccount: { id: string; code: string };

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  configureTestAppValidation(app);
  await app.init();
  ds = app.get(DataSource);

  contraAccount = await seedContraAccount(ds, runId);
  suiteAccountIds.push(contraAccount.id);
});

afterAll(async () => {
  await removeSuiteBankReconciliations(ds, suiteReconciliationIds);
  await removeSuiteJournalEntries(ds, suiteEntryIds);
  await removeSuiteAccounts(ds, suiteAccountIds);
  await app.close();
});

async function createTestContext(tag: string) {
  const acct = await seedBankAccount(ds, `${runId}-${tag}`.slice(0, 20));
  suiteAccountIds.push(acct.id);

  const reconId = await insertReconciliationRaw(ds, {
    reconciliationNo: `BR-${tag}-${runId}`.slice(0, 30),
    bankAccountId: acct.id,
    sequenceNo: 1,
    status: 'DRAFT',
  });
  suiteReconciliationIds.push(reconId);

  return { acct, reconId };
}

async function makeLine(bankAccountId: string, journalNo: string, date = '2025-12-15') {
  const line = await seedBankJournalLine(ds, {
    bankAccountId,
    contraAccountId: contraAccount.id,
    entryDate: date,
    moneyIn: '100.00',
    journalNo: `${journalNo}-${runId}`.slice(0, 30),
  });
  suiteEntryIds.push(line.entryId);
  return line;
}

async function constraintDef(name: string): Promise<string> {
  const rows = await ds.query(
    `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.conname = $1 AND n.nspname = current_schema()`,
    [name],
  );
  return rows[0]?.def ?? '';
}

async function enabledTriggerCount(): Promise<number> {
  const rows = await ds.query(
    `SELECT COUNT(*)::int AS count
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE t.tgname IN (
        'trg_bsr_line_classification',
        'trg_bsr_mark_classification',
        'trg_bsr_line_immutable_ids',
        'trg_bsr_mark_immutable_ids',
        'trg_bsr_version_guard',
        'trg_bsr_version_line_guard',
        'trg_bsr_version_sealed_at_commit',
        'trg_bsr_current_version_sealed'
      )
      AND t.tgenabled = 'O'
      AND n.nspname = current_schema()`,
  );
  return rows[0]?.count ?? 0;
}

describe('Bank reconciliation database guards e2e', () => {
  describe('classification consistency', () => {
    it('rejects a setup mark when an OPENING_CLEARED line exists for the pair', async () => {
      const { acct, reconId } = await createTestContext('C1');
      const { lineId } = await makeLine(acct.id, 'J-C1');

      await ds.query(
        `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
         VALUES ($1, $2, 'OPENING_CLEARED', 'test', now())`,
        [reconId, lineId],
      );

      await expect(
        ds.query(
          `INSERT INTO bank_statement_reconciliation_setup_marks ("reconciliationId", "journalEntryLineId", "markedBy", "markedAt")
           VALUES ($1, $2, 'test', now())`,
          [reconId, lineId],
        ),
      ).rejects.toThrow(/bsr:.*OPENING_CLEARED/);
    });

    it('rejects an OPENING_CLEARED line when a setup mark exists for the pair', async () => {
      const { acct, reconId } = await createTestContext('C2');
      const { lineId } = await makeLine(acct.id, 'J-C2');

      await ds.query(
        `INSERT INTO bank_statement_reconciliation_setup_marks ("reconciliationId", "journalEntryLineId", "markedBy", "markedAt")
         VALUES ($1, $2, 'test', now())`,
        [reconId, lineId],
      );

      await expect(
        ds.query(
          `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
           VALUES ($1, $2, 'OPENING_CLEARED', 'test', now())`,
          [reconId, lineId],
        ),
      ).rejects.toThrow(/bsr:.*setup mark/);
    });

    it('allows a MATCHED line to keep its setup mark', async () => {
      const { acct, reconId } = await createTestContext('C3');
      const { lineId } = await makeLine(acct.id, 'J-C3');

      await ds.query(
        `INSERT INTO bank_statement_reconciliation_setup_marks ("reconciliationId", "journalEntryLineId", "markedBy", "markedAt")
         VALUES ($1, $2, 'test', now())`,
        [reconId, lineId],
      );

      await expect(
        ds.query(
          `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
           VALUES ($1, $2, 'MATCHED', 'test', now())`,
          [reconId, lineId],
        ),
      ).resolves.toBeDefined();
    });

    it('rejects changing kind MATCHED → OPENING_CLEARED while a mark exists', async () => {
      const { acct, reconId } = await createTestContext('C4');
      const { lineId } = await makeLine(acct.id, 'J-C4');

      await ds.query(
        `INSERT INTO bank_statement_reconciliation_setup_marks ("reconciliationId", "journalEntryLineId", "markedBy", "markedAt")
         VALUES ($1, $2, 'test', now())`,
        [reconId, lineId],
      );

      const [lineRow] = await ds.query(
        `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
         VALUES ($1, $2, 'MATCHED', 'test', now()) RETURNING id`,
        [reconId, lineId],
      );

      await expect(
        ds.query(
          `UPDATE bank_statement_reconciliation_lines SET kind = 'OPENING_CLEARED' WHERE id = $1`,
          [lineRow.id],
        ),
      ).rejects.toThrow(/bsr:.*OPENING_CLEARED/);
    });

    it('lets exactly one of two opposing writes commit', async () => {
      const { acct, reconId } = await createTestContext('C5');
      const { lineId } = await makeLine(acct.id, 'J-C5');

      const qrA = ds.createQueryRunner();
      const qrB = ds.createQueryRunner();
      await qrA.connect();
      await qrB.connect();

      await qrA.startTransaction();
      await qrB.startTransaction();

      try {
        // Connection A inserts OPENING_CLEARED line (takes FOR NO KEY UPDATE on parent header)
        await qrA.query(
          `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
           VALUES ($1, $2, 'OPENING_CLEARED', 'test', now())`,
          [reconId, lineId],
        );

        // Connection B attempts to insert mark for the same pair in background
        const bPromise = qrB.query(
          `INSERT INTO bank_statement_reconciliation_setup_marks ("reconciliationId", "journalEntryLineId", "markedBy", "markedAt")
           VALUES ($1, $2, 'test', now())`,
          [reconId, lineId],
        );

        // Commit A: releases lock, B wakes up and evaluates opposing condition
        await qrA.commitTransaction();

        // B must reject
        await expect(bPromise).rejects.toThrow();
        await qrB.rollbackTransaction();

        const [linesCount] = await ds.query(
          `SELECT COUNT(*)::int AS count FROM bank_statement_reconciliation_lines
            WHERE "reconciliationId" = $1 AND "journalEntryLineId" = $2`,
          [reconId, lineId],
        );
        const [marksCount] = await ds.query(
          `SELECT COUNT(*)::int AS count FROM bank_statement_reconciliation_setup_marks
            WHERE "reconciliationId" = $1 AND "journalEntryLineId" = $2`,
          [reconId, lineId],
        );
        expect(linesCount.count + marksCount.count).toBe(1);
      } finally {
        await qrA.release();
        await qrB.release();
      }
    });

    it('rejects changing reconciliationId or journalEntryLineId on a line and on a mark', async () => {
      const { acct: acct1, reconId: reconId1 } = await createTestContext('C6A');
      const { reconId: reconId2 } = await createTestContext('C6B');
      const { lineId } = await makeLine(acct1.id, 'J-C6');

      const [line] = await ds.query(
        `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
         VALUES ($1, $2, 'MATCHED', 'test', now()) RETURNING id`,
        [reconId1, lineId],
      );

      const [mark] = await ds.query(
        `INSERT INTO bank_statement_reconciliation_setup_marks ("reconciliationId", "journalEntryLineId", "markedBy", "markedAt")
         VALUES ($1, $2, 'test', now()) RETURNING id`,
        [reconId1, lineId],
      );

      await expect(
        ds.query(
          `UPDATE bank_statement_reconciliation_lines SET "reconciliationId" = $1 WHERE id = $2`,
          [reconId2, line.id],
        ),
      ).rejects.toThrow(/bsr:.*immutable/);

      await expect(
        ds.query(
          `UPDATE bank_statement_reconciliation_setup_marks SET "reconciliationId" = $1 WHERE id = $2`,
          [reconId2, mark.id],
        ),
      ).rejects.toThrow(/bsr:.*immutable/);
    });
  });

  describe('version immutability and sealing', () => {
    it('fails the commit when a version is inserted and never sealed', async () => {
      const { acct, reconId } = await createTestContext('V1');
      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();

      try {
        await qr.query(
          `INSERT INTO bank_statement_reconciliation_versions (
             "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
             "bankAccountId", "bankAccountCode", "bankAccountName",
             "periodFrom", "periodTo", "openingBalance", "closingBalance"
           ) VALUES ($1, 1, 'BR-V-1', 1, $2, $3, $4, '2026-01-01', '2026-01-31', 0, 0)`,
          [reconId, acct.id, acct.code, acct.name],
        );
        await expect(qr.commitTransaction()).rejects.toThrow(/bsr:.*unsealed version/);
      } finally {
        if (qr.isTransactionActive) {
          await qr.rollbackTransaction();
        }
        await qr.release();
      }
    });

    it('commits when the version is sealed in the same transaction', async () => {
      const { acct, reconId } = await createTestContext('V2');
      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();

      try {
        const [v] = await qr.query(
          `INSERT INTO bank_statement_reconciliation_versions (
             "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
             "bankAccountId", "bankAccountCode", "bankAccountName",
             "periodFrom", "periodTo", "openingBalance", "closingBalance"
           ) VALUES ($1, 1, 'BR-V-2', 1, $2, $3, $4, '2026-01-01', '2026-01-31', 0, 0)
           RETURNING id`,
          [reconId, acct.id, acct.code, acct.name],
        );

        await qr.query(
          `UPDATE bank_statement_reconciliation_versions
              SET "sealedAt" = now(), "completedAt" = now(), "completedBy" = 'test'
            WHERE id = $1`,
          [v.id],
        );

        await expect(qr.commitTransaction()).resolves.toBeUndefined();
      } finally {
        if (qr.isTransactionActive) {
          await qr.rollbackTransaction();
        }
        await qr.release();
      }
    });

    it('rejects UPDATE of a sealed version and DELETE of any version', async () => {
      const { acct, reconId } = await createTestContext('V3');
      const [v] = await ds.query(
        `INSERT INTO bank_statement_reconciliation_versions (
           "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
           "bankAccountId", "bankAccountCode", "bankAccountName",
           "periodFrom", "periodTo", "openingBalance", "closingBalance", "sealedAt"
         ) VALUES ($1, 1, 'BR-V-3', 1, $2, $3, $4, '2026-01-01', '2026-01-31', 0, 0, now())
         RETURNING id`,
        [reconId, acct.id, acct.code, acct.name],
      );

      await expect(
        ds.query(
          `UPDATE bank_statement_reconciliation_versions SET "openingBalance" = 100 WHERE id = $1`,
          [v.id],
        ),
      ).rejects.toThrow(/bsr:.*sealed.*immutable/);

      await expect(
        ds.query(`DELETE FROM bank_statement_reconciliation_versions WHERE id = $1`, [v.id]),
      ).rejects.toThrow(/bsr:.*versions cannot be deleted/);
    });

    it('rejects UPDATE and DELETE of a version line', async () => {
      const { acct, reconId } = await createTestContext('V4');
      const { entryId, lineId } = await makeLine(acct.id, 'J-V4');

      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();

      const [v] = await qr.query(
        `INSERT INTO bank_statement_reconciliation_versions (
           "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
           "bankAccountId", "bankAccountCode", "bankAccountName",
           "periodFrom", "periodTo", "openingBalance", "closingBalance"
         ) VALUES ($1, 1, 'BR-V-4', 1, $2, $3, $4, '2026-01-01', '2026-01-31', 0, 0)
         RETURNING id`,
        [reconId, acct.id, acct.code, acct.name],
      );

      const [vl] = await qr.query(
        `INSERT INTO bank_statement_reconciliation_version_lines (
           "versionId", "journalEntryLineId", role, "entryDate", "journalEntryId",
           "journalNo", "sourceType", "moneyIn", "moneyOut"
         ) VALUES ($1, $2, 'MATCHED', '2026-01-10', $3, 'J-V-4', 'EXPENSE', 100, 0)
         RETURNING id`,
        [v.id, lineId, entryId],
      );

      // Now seal
      await qr.query(
        `UPDATE bank_statement_reconciliation_versions SET "sealedAt" = now() WHERE id = $1`,
        [v.id],
      );

      await qr.commitTransaction();
      await qr.release();

      await expect(
        ds.query(
          `UPDATE bank_statement_reconciliation_version_lines SET "moneyIn" = 200 WHERE id = $1`,
          [vl.id],
        ),
      ).rejects.toThrow(/bsr:.*version lines cannot be updated/);

      await expect(
        ds.query(`DELETE FROM bank_statement_reconciliation_version_lines WHERE id = $1`, [vl.id]),
      ).rejects.toThrow(/bsr:.*version lines cannot be deleted/);
    });

    it('rejects INSERT of a line under a sealed version', async () => {
      const { acct, reconId } = await createTestContext('V5');
      const { entryId, lineId } = await makeLine(acct.id, 'J-V5');

      const [v] = await ds.query(
        `INSERT INTO bank_statement_reconciliation_versions (
           "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
           "bankAccountId", "bankAccountCode", "bankAccountName",
           "periodFrom", "periodTo", "openingBalance", "closingBalance", "sealedAt"
         ) VALUES ($1, 1, 'BR-V-5', 1, $2, $3, $4, '2026-01-01', '2026-01-31', 0, 0, now())
         RETURNING id`,
        [reconId, acct.id, acct.code, acct.name],
      );

      await expect(
        ds.query(
          `INSERT INTO bank_statement_reconciliation_version_lines (
             "versionId", "journalEntryLineId", role, "entryDate", "journalEntryId",
             "journalNo", "sourceType", "moneyIn", "moneyOut"
           ) VALUES ($1, $2, 'MATCHED', '2026-01-10', $3, 'J-V-5', 'EXPENSE', 100, 0)`,
          [v.id, lineId, entryId],
        ),
      ).rejects.toThrow(/bsr:.*sealed version/);
    });

    it('a line insert racing the seal either commits before it or fails', async () => {
      const { acct, reconId } = await createTestContext('V6');
      const { entryId: e1, lineId: l1 } = await makeLine(acct.id, 'J-V6-1');
      const { entryId: e2, lineId: l2 } = await makeLine(acct.id, 'J-V6-2');

      const qrA = ds.createQueryRunner();
      await qrA.connect();
      await qrA.startTransaction();

      const [v] = await qrA.query(
        `INSERT INTO bank_statement_reconciliation_versions (
           "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
           "bankAccountId", "bankAccountCode", "bankAccountName",
           "periodFrom", "periodTo", "openingBalance", "closingBalance"
         ) VALUES ($1, 1, 'BR-V-6', 1, $2, $3, $4, '2026-01-01', '2026-01-31', 0, 0)
         RETURNING id`,
        [reconId, acct.id, acct.code, acct.name],
      );

      // Connection A inserts line L1 under unsealed version
      await qrA.query(
        `INSERT INTO bank_statement_reconciliation_version_lines (
           "versionId", "journalEntryLineId", role, "entryDate", "journalEntryId",
           "journalNo", "sourceType", "moneyIn", "moneyOut"
         ) VALUES ($1, $2, 'MATCHED', '2026-01-10', $3, 'J-V-6-1', 'EXPENSE', 100, 0)`,
        [v.id, l1, e1],
      );

      // Connection A seals
      await qrA.query(
        `UPDATE bank_statement_reconciliation_versions SET "sealedAt" = now() WHERE id = $1`,
        [v.id],
      );

      await qrA.commitTransaction();
      await qrA.release();

      // Connection B tries to insert line L2 after A committed sealed
      await expect(
        ds.query(
          `INSERT INTO bank_statement_reconciliation_version_lines (
             "versionId", "journalEntryLineId", role, "entryDate", "journalEntryId",
             "journalNo", "sourceType", "moneyIn", "moneyOut"
           ) VALUES ($1, $2, 'MATCHED', '2026-01-10', $3, 'J-V-6-2', 'EXPENSE', 100, 0)`,
          [v.id, l2, e2],
        ),
      ).rejects.toThrow(/bsr:.*sealed version/);
    });

    it('rejects currentVersionNo pointing at an unsealed version', async () => {
      const { acct, reconId } = await createTestContext('V7');
      const qr = ds.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();

      try {
        await qr.query(
          `INSERT INTO bank_statement_reconciliation_versions (
             "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
             "bankAccountId", "bankAccountCode", "bankAccountName",
             "periodFrom", "periodTo", "openingBalance", "closingBalance"
           ) VALUES ($1, 1, 'BR-V-7', 1, $2, $3, $4, '2026-01-01', '2026-01-31', 0, 0)`,
          [reconId, acct.id, acct.code, acct.name],
        );

        await expect(
          qr.query(
            `UPDATE bank_statement_reconciliations SET "currentVersionNo" = 1 WHERE id = $1`,
            [reconId],
          ),
        ).rejects.toThrow(/bsr:.*currentVersionNo.*sealed version/);
      } finally {
        await qr.rollbackTransaction();
        await qr.release();
      }
    });

    it("rejects currentVersionNo pointing at another reconciliation's version", async () => {
      const { acct: acctA, reconId: reconIdA } = await createTestContext('V8A');
      const { reconId: reconIdB } = await createTestContext('V8B');

      await ds.query(
        `INSERT INTO bank_statement_reconciliation_versions (
           "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
           "bankAccountId", "bankAccountCode", "bankAccountName",
           "periodFrom", "periodTo", "openingBalance", "closingBalance", "sealedAt"
         ) VALUES ($1, 1, 'BR-V-8A', 1, $2, $3, $4, '2026-01-01', '2026-01-31', 0, 0, now())`,
        [reconIdA, acctA.id, acctA.code, acctA.name],
      );

      // reconIdB has no version 1 of its own, so pointing currentVersionNo = 1 violates FK_bsr_current_version or trigger
      await expect(
        ds.query(
          `UPDATE bank_statement_reconciliations SET "currentVersionNo" = 1 WHERE id = $1`,
          [reconIdB],
        ),
      ).rejects.toThrow(/FK_bsr_current_version|violates foreign key constraint|bsr:.*sealed version/);
    });

    it('FK_bsr_current_version has the exact columns, target and delete rule', async () => {
      expect(await constraintDef('FK_bsr_current_version')).toBe(
        'FOREIGN KEY (id, "currentVersionNo") REFERENCES bank_statement_reconciliation_versions("reconciliationId", "versionNo") ON DELETE RESTRICT',
      );
    });
  });

  describe('reservation', () => {
    it('rejects the same journal line in two reconciliations', async () => {
      const { reconId: reconIdA } = await createTestContext('R1A');
      const { reconId: reconIdB } = await createTestContext('R1B');
      const { acct: acctShared } = await createTestContext('R1S');
      const { lineId } = await makeLine(acctShared.id, 'J-RES-1');

      await ds.query(
        `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
         VALUES ($1, $2, 'MATCHED', 'test', now())`,
        [reconIdA, lineId],
      );

      await expect(
        ds.query(
          `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
           VALUES ($1, $2, 'MATCHED', 'test', now())`,
          [reconIdB, lineId],
        ),
      ).rejects.toThrow(/UQ_bsr_line_journal_line/);
    });

    it('rejects a second DRAFT on the same bank account', async () => {
      const acct = await seedBankAccount(ds, `${runId}-draft`.slice(0, 20));
      suiteAccountIds.push(acct.id);

      const r1 = await insertReconciliationRaw(ds, {
        reconciliationNo: `BR-RES-2A-${runId}`.slice(0, 30),
        bankAccountId: acct.id,
        sequenceNo: 1,
        status: 'DRAFT',
      });
      suiteReconciliationIds.push(r1);

      await expect(
        insertReconciliationRaw(ds, {
          reconciliationNo: `BR-RES-2B-${runId}`.slice(0, 30),
          bankAccountId: acct.id,
          sequenceNo: 2,
          status: 'DRAFT',
        }),
      ).rejects.toThrow(/UQ_bsr_one_draft_per_account/);
    });
  });

  describe('fixture cleanup', () => {
    it('removes a completed reconciliation with versions and leaves the triggers enabled', async () => {
      const { acct, reconId } = await createTestContext('CLN');
      await ds.query(
        `INSERT INTO bank_statement_reconciliation_versions (
           "reconciliationId", "versionNo", "reconciliationNo", "sequenceNo",
           "bankAccountId", "bankAccountCode", "bankAccountName",
           "periodFrom", "periodTo", "openingBalance", "closingBalance", "sealedAt"
         ) VALUES ($1, 1, 'BR-CLN-1', 1, $2, $3, $4, '2026-01-01', '2026-01-31', 0, 0, now())`,
        [reconId, acct.id, acct.code, acct.name],
      );
      await ds.query(
        `UPDATE bank_statement_reconciliations SET "currentVersionNo" = 1, status = 'COMPLETED' WHERE id = $1`,
        [reconId],
      );

      await removeSuiteBankReconciliations(ds, [reconId]);
      expect(await enabledTriggerCount()).toBe(8);
    });
  });
});
