import { SESSION_PROTOCOL } from './utils/session-protocol';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import {
  seedBankAccount,
  seedContraAccount,
  seedBankJournalLine,
  removeSuiteBankReconciliations,
  removeSuiteJournalEntries,
  removeSuiteAccounts,
} from './utils/bank-reconciliation-fixture';
import { E2E_ADMIN_PASSWORD, removeSuiteAdmin, seedSuiteAdmin } from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';
import { SetupClassification } from '../src/modules/bank-reconciliations/entities/bank-reconciliation.entity';

async function journalFingerprint(ds: DataSource, entryIds: string[]): Promise<string> {
  if (entryIds.length === 0) return '';
  const entries = await ds.query(
    `SELECT id, "journalNo", "entryDate"::text, "sourceType"::text, description, "createdAt", "deletedAt"
       FROM journal_entry
      WHERE id = ANY($1)
      ORDER BY id`,
    [entryIds],
  );
  const lines = await ds.query(
    `SELECT id, "entryId", "accountId", debit::text, credit::text, "deletedAt"
       FROM journal_entry_line
      WHERE "entryId" = ANY($1)
      ORDER BY id`,
    [entryIds],
  );
  return JSON.stringify({ entries, lines });
}

async function countJournalRows(ds: DataSource): Promise<{ entries: number; lines: number }> {
  const [e] = await ds.query(`SELECT count(*)::int AS count FROM journal_entry`);
  const [l] = await ds.query(`SELECT count(*)::int AS count FROM journal_entry_line`);
  return { entries: e.count, lines: l.count };
}

async function versionMd5(ds: DataSource, versionId: string): Promise<string> {
  const [v] = await ds.query(
    `SELECT * FROM bank_statement_reconciliation_versions WHERE id = $1`,
    [versionId],
  );
  const lines = await ds.query(
    `SELECT * FROM bank_statement_reconciliation_version_lines WHERE "versionId" = $1 ORDER BY id`,
    [versionId],
  );
  return createHash('md5').update(JSON.stringify({ v, lines })).digest('hex');
}

describe('Bank reconciliation reopen and cancel-reopen lifecycle (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token = '';
  let post: (path: string, body?: any) => request.Test;
  let patch: (path: string, body?: any) => request.Test;
  let del: (path: string) => request.Test;
  let get: (path: string) => request.Test;

  const runId = randomUUID().slice(0, 6);
  let adminUserId = '';
  let adminUsername = '';

  const suiteAccountIds: string[] = [];
  const suiteEntryIds: string[] = [];
  const suiteReconciliationIds: string[] = [];

  let contraAccount: { id: string; code: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    adminUsername = `e2espec_recon_r_${runId}`;
    const admin = await seedSuiteAdmin(ds, adminUsername);
    adminUserId = admin.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login').set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: adminUsername, password: E2E_ADMIN_PASSWORD });
    token = loginRes.body?.data?.accessToken ?? loginRes.body?.accessToken;
    expect(token).toBeTruthy();

    const server = app.getHttpServer();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    post = (path: string, body: any = {}) => auth(request(server).post(path).send(body));
    patch = (path: string, body: any = {}) => auth(request(server).patch(path).send(body));
    del = (path: string) => auth(request(server).delete(path));
    get = (path: string) => auth(request(server).get(path));

    contraAccount = await seedContraAccount(ds, runId);
    suiteAccountIds.push(contraAccount.id);
  });

  afterAll(async () => {
    await removeSuiteTraces(ds, {
      userIds: adminUserId ? [adminUserId] : [],
      usernames: adminUsername ? [adminUsername] : [],
      entityIds: suiteReconciliationIds,
    });
    await removeSuiteBankReconciliations(ds, suiteReconciliationIds);
    await removeSuiteJournalEntries(ds, suiteEntryIds);
    await removeSuiteAccounts(ds, suiteAccountIds);
    if (adminUsername) {
      await removeSuiteAdmin(ds, adminUsername);
    }
    await app.close();
  });

  describe('reopen', () => {
    it('reopens the latest completed reconciliation and keeps its reservations', async () => {
      const acct = await seedBankAccount(ds, `${runId}-rop-1`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-15',
        moneyIn: '100.00',
        journalNo: `JE-ROP1-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '100.00',
        matchedLineIds: [l.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Reopen
      const reopenRes = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      expect(reopenRes.body.data.status).toBe('DRAFT');
      expect(reopenRes.body.data.reopened).toBe(true);
      expect(reopenRes.body.data.currentVersionNo).toBe(1);
      expect(reopenRes.body.data.lockVersion).toBe(3);
      expect(reopenRes.body.data.matched.map((r: any) => r.journalEntryLineId)).toEqual([l.lineId]);

      // Reservations kept: another reconciliation cannot create/tick l
      const otherAcct = await seedBankAccount(ds, `${runId}-rop-oth`);
      suiteAccountIds.push(otherAcct.id);

      await post('/accounting/bank-reconciliations', {
        bankAccountId: otherAcct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '100.00',
        matchedLineIds: [l.lineId],
      }).expect(409);
    });

    it('rejects reopening an earlier reconciliation when a later one exists', async () => {
      const acct = await seedBankAccount(ds, `${runId}-rop-seq`);
      suiteAccountIds.push(acct.id);

      // Sequence 1 completed
      const draft1 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft1.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft1.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Sequence 2 completed
      const draft2 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodTo: '2026-02-28',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft2.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft2.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Reopening sequence 1 -> 409
      await post(`/accounting/bank-reconciliations/${draft1.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(409);
    });

    it('rejects reopening while a draft exists on the account', async () => {
      const acct = await seedBankAccount(ds, `${runId}-rop-drf`);
      suiteAccountIds.push(acct.id);

      // Sequence 1 completed
      const draft1 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft1.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft1.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Sequence 2 in draft
      const draft2 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodTo: '2026-02-28',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft2.body.data.id);

      // Reopening sequence 1 while draft2 exists -> 409
      await post(`/accounting/bank-reconciliations/${draft1.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(409);
    });

    it('re-completing appends version 2 and leaves version 1 byte-identical', async () => {
      const acct = await seedBankAccount(ds, `${runId}-re-cmp`);
      suiteAccountIds.push(acct.id);

      const l1 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '50.00',
        journalNo: `JE-RC1-${runId}`,
      });
      const l2 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-20',
        moneyIn: '50.00',
        journalNo: `JE-RC2-${runId}`,
      });
      suiteEntryIds.push(l1.entryId, l2.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '50.00',
        matchedLineIds: [l1.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      const [v1] = await ds.query(
        `SELECT id FROM bank_statement_reconciliation_versions WHERE "reconciliationId" = $1 AND "versionNo" = 1`,
        [draft.body.data.id],
      );
      const v1HashBefore = await versionMd5(ds, v1.id);

      // Reopen
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      // Modify: untick l1, tick l2, closing balance stays 50.00
      await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 3,
        matchedLineIds: [l2.lineId],
      }).expect(200);

      // Re-complete
      const completeRes = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 4,
      }).expect(200);

      expect(completeRes.body.data.status).toBe('COMPLETED');
      expect(completeRes.body.data.currentVersionNo).toBe(2);

      // Version 1 hash must be byte-identical
      const v1HashAfter = await versionMd5(ds, v1.id);
      expect(v1HashAfter).toBe(v1HashBefore);

      // Version 2 exists
      const [v2] = await ds.query(
        `SELECT id FROM bank_statement_reconciliation_versions WHERE "reconciliationId" = $1 AND "versionNo" = 2`,
        [draft.body.data.id],
      );
      expect(v2).toBeDefined();
    });

    it('sequence 1 reopened: setup classifications are editable again', async () => {
      const acct = await seedBankAccount(ds, `${runId}-rop-setup`);
      suiteAccountIds.push(acct.id);

      const lPre = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '30.00',
        journalNo: `JE-RS1-${runId}`,
      });
      suiteEntryIds.push(lPre.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '30.00',
        closingBalance: '30.00',
        matchedLineIds: [],
        setupChanges: [{ journalEntryLineId: lPre.lineId, classification: SetupClassification.CLEARED }],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Reopen
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      // Edit setup classification: change CLEARED to OUTSTANDING + ticked
      const updateRes = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 3,
        openingBalance: '0.00',
        closingBalance: '30.00',
        matchedLineIds: [lPre.lineId],
        setupChanges: [{ journalEntryLineId: lPre.lineId, classification: SetupClassification.OUTSTANDING }],
      }).expect(200);

      expect(updateRes.body.data.matched.map((r: any) => r.journalEntryLineId)).toContain(lPre.lineId);
    });
  });

  describe('cancel reopen', () => {
    it('restores business fields, lines, marks and original audit fields', async () => {
      const acct = await seedBankAccount(ds, `${runId}-crp-full`);
      suiteAccountIds.push(acct.id);

      const lPre = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '20.00',
        journalNo: `JE-CRPF-PRE-${runId}`,
      });
      const lIn = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '40.00',
        journalNo: `JE-CRPF-IN-${runId}`,
      });
      suiteEntryIds.push(lPre.entryId, lIn.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '20.00',
        closingBalance: '60.00',
        matchedLineIds: [lIn.lineId],
        setupChanges: [{ journalEntryLineId: lPre.lineId, classification: SetupClassification.CLEARED }],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Independent capture BEFORE reopen by raw SQL
      const beforeLines = await ds.query(
        `SELECT "journalEntryLineId", kind, "addedBy", "addedAt"
           FROM bank_statement_reconciliation_lines
          WHERE "reconciliationId" = $1
          ORDER BY "journalEntryLineId" ASC`,
        [draft.body.data.id],
      );
      const beforeMarks = await ds.query(
        `SELECT "journalEntryLineId", "markedBy", "markedAt"
           FROM bank_statement_reconciliation_setup_marks
          WHERE "reconciliationId" = $1
          ORDER BY "journalEntryLineId" ASC`,
        [draft.body.data.id],
      );
      const [beforeHeader] = await ds.query(
        `SELECT "periodFrom"::text, "periodTo"::text, "openingBalance"::text, "closingBalance"::text, status
           FROM bank_statement_reconciliations
          WHERE id = $1`,
        [draft.body.data.id],
      );

      // Reopen
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      // Mutate during reopen: change closing balance, untick lIn
      await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 3,
        closingBalance: '999.00',
        matchedLineIds: [],
      }).expect(200);

      // Cancel reopen
      const cancelRes = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/cancel-reopen`, {
        lockVersion: 4,
      }).expect(200);

      expect(cancelRes.body.data.status).toBe('COMPLETED');
      expect(cancelRes.body.data.reopened).toBe(false);

      const afterLines = await ds.query(
        `SELECT "journalEntryLineId", kind, "addedBy", "addedAt"
           FROM bank_statement_reconciliation_lines
          WHERE "reconciliationId" = $1
          ORDER BY "journalEntryLineId" ASC`,
        [draft.body.data.id],
      );
      const afterMarks = await ds.query(
        `SELECT "journalEntryLineId", "markedBy", "markedAt"
           FROM bank_statement_reconciliation_setup_marks
          WHERE "reconciliationId" = $1
          ORDER BY "journalEntryLineId" ASC`,
        [draft.body.data.id],
      );
      const [afterHeader] = await ds.query(
        `SELECT "periodFrom"::text, "periodTo"::text, "openingBalance"::text, "closingBalance"::text, status
           FROM bank_statement_reconciliations
          WHERE id = $1`,
        [draft.body.data.id],
      );

      expect(afterLines).toEqual(beforeLines);
      expect(afterMarks).toEqual(beforeMarks);
      expect(afterHeader).toMatchObject({
        periodFrom: beforeHeader.periodFrom,
        periodTo: beforeHeader.periodTo,
        openingBalance: beforeHeader.openingBalance,
        closingBalance: beforeHeader.closingBalance,
        status: 'COMPLETED',
      });
    });

    it('advances lockVersion and does not restore its old value', async () => {
      const acct = await seedBankAccount(ds, `${runId}-crp-lv`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Reopen: lockVersion -> 3
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      // Cancel reopen: lockVersion -> 4
      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/cancel-reopen`, {
        lockVersion: 3,
      }).expect(200);

      expect(res.body.data.lockVersion).toBe(4);
    });

    it('appends no version and leaves currentVersionNo unchanged', async () => {
      const acct = await seedBankAccount(ds, `${runId}-crp-nov`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/cancel-reopen`, {
        lockVersion: 3,
      }).expect(200);

      expect(res.body.data.currentVersionNo).toBe(1);

      const versions = await ds.query(
        `SELECT * FROM bank_statement_reconciliation_versions WHERE "reconciliationId" = $1`,
        [draft.body.data.id],
      );
      expect(versions.length).toBe(1);
    });

    it('keeps both REOPEN and CANCEL_REOPEN in audit_logs', async () => {
      const acct = await seedBankAccount(ds, `${runId}-crp-aud`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/cancel-reopen`, {
        lockVersion: 3,
      }).expect(200);

      const logs = await ds.query(
        `SELECT action FROM audit_logs WHERE "entityType" = 'BankReconciliation' AND "entityId" = $1 ORDER BY "createdAt" ASC`,
        [draft.body.data.id],
      );
      const actions = logs.map((l: any) => l.action);
      expect(actions).toContain('REOPEN');
      expect(actions).toContain('CANCEL_REOPEN');
    });

    it('releases lines ticked during the reopen; they are eligible for the next reconciliation', async () => {
      const acct = await seedBankAccount(ds, `${runId}-crp-rel`);
      suiteAccountIds.push(acct.id);

      const l1 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '25.00',
        journalNo: `JE-REL1-${runId}`,
      });
      const l2 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-20',
        moneyIn: '25.00',
        journalNo: `JE-REL2-${runId}`,
      });
      suiteEntryIds.push(l1.entryId, l2.entryId);

      // Period 1 completes with only l1 matched
      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '25.00',
        matchedLineIds: [l1.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Reopen and tick l2
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 3,
        closingBalance: '50.00',
        matchedLineIds: [l1.lineId, l2.lineId],
      }).expect(200);

      // Cancel reopen -> l2 is released
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/cancel-reopen`, {
        lockVersion: 4,
      }).expect(200);

      // Create period 2 -> l2 is eligible to be ticked
      const draft2 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodTo: '2026-02-28',
        closingBalance: '50.00',
        matchedLineIds: [l2.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft2.body.data.id);

      expect(draft2.body.data.matched.map((r: any) => r.journalEntryLineId)).toEqual([l2.lineId]);
    });

    it('returns 409 and changes nothing when a reinsert conflicts', async () => {
      const acct = await seedBankAccount(ds, `${runId}-crp-cfl`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '30.00',
        journalNo: `JE-CFL-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '30.00',
        matchedLineIds: [l.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Reopen
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      // Untick l during reopen
      await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 3,
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(200);

      // Another bank account / draft grabs l
      const otherAcct = await seedBankAccount(ds, `${runId}-crp-oth`);
      suiteAccountIds.push(otherAcct.id);

      const otherDraft = await post('/accounting/bank-reconciliations', {
        bankAccountId: otherAcct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(otherDraft.body.data.id);

      // Raw-insert l as a line of otherDraft to create conflicting reservation
      await ds.query(
        `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
         VALUES ($1, $2, 'MATCHED', 'test', now())`,
        [otherDraft.body.data.id, l.lineId],
      );

      // Now cancel reopen on first draft -> fails with 409 because l is reserved elsewhere
      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/cancel-reopen`, {
        lockVersion: 4,
      }).expect(409);

      expect(res.body.message).toContain('Cancel Reopen could not restore');

      // Assert draft remains in status DRAFT with lockVersion 4
      const [reconRow] = await ds.query(
        `SELECT status, "lockVersion" FROM bank_statement_reconciliations WHERE id = $1`,
        [draft.body.data.id],
      );
      expect(reconRow.status).toBe('DRAFT');
      expect(reconRow.lockVersion).toBe(4);
    });

    it('still works after the account loses its bank flag', async () => {
      const acct = await seedBankAccount(ds, `${runId}-crp-unfl`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      // Unflag bank account
      await ds.query(`UPDATE chart_of_account SET "isBankAccount" = false WHERE id = $1`, [acct.id]);

      // Cancel reopen succeeds even when unflagged
      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/cancel-reopen`, {
        lockVersion: 3,
      }).expect(200);

      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('rejects save and complete on that unflagged account', async () => {
      const acct = await seedBankAccount(ds, `${runId}-crp-rej`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      // Unflag bank account
      await ds.query(`UPDATE chart_of_account SET "isBankAccount" = false WHERE id = $1`, [acct.id]);

      // Save -> 409
      await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 3,
        closingBalance: '10.00',
      }).expect(409);

      // Complete -> 409
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 3,
      }).expect(409);
    });
  });

  describe('late postings', () => {
    it('a backdated posting does not change the completed detail or version rows', async () => {
      const acct = await seedBankAccount(ds, `${runId}-late-1`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '50.00',
        journalNo: `JE-L1-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '50.00',
        matchedLineIds: [l.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      const detailBefore = await get(`/accounting/bank-reconciliations/${draft.body.data.id}`).expect(200);

      // Late posting backdated into period 1
      const late = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-15',
        moneyIn: '20.00',
        journalNo: `JE-LATE1-${runId}`,
      });
      suiteEntryIds.push(late.entryId);

      const detailAfter = await get(`/accounting/bank-reconciliations/${draft.body.data.id}`).expect(200);

      expect(detailAfter.body.data.summary).toEqual(detailBefore.body.data.summary);
      expect(detailAfter.body.data.status).toBe('COMPLETED');
    });

    it('appears as an older outstanding entry in the next draft', async () => {
      const acct = await seedBankAccount(ds, `${runId}-late-nxt`);
      suiteAccountIds.push(acct.id);

      const draft1 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft1.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft1.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Backdated entry into period 1
      const late = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-15',
        moneyIn: '20.00',
        journalNo: `JE-LATENXT-${runId}`,
      });
      suiteEntryIds.push(late.entryId);

      // Next draft for period 2
      const draft2 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodTo: '2026-02-28',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft2.body.data.id);

      const searchRes = await post('/accounting/bank-reconciliations/eligible-lines/search', {
        bankAccountId: acct.id,
        reconciliationId: draft2.body.data.id,
        periodTo: '2026-02-28',
        view: 'checklist',
      }).expect(200);

      const ids = searchRes.body.data.map((r: any) => r.journalEntryLineId);
      expect(ids).toContain(late.lineId);
    });

    it('appears unticked in a reopened draft; on sequence 1 a pre-period one is Unclassified and blocks Complete', async () => {
      const acct = await seedBankAccount(ds, `${runId}-late-rop`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Reopen
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      // Late pre-period posting
      const latePre = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-20',
        moneyIn: '10.00',
        journalNo: `JE-LATEROP-${runId}`,
      });
      suiteEntryIds.push(latePre.entryId);

      // Re-completing without classifying latePre -> 409 unclassifiedCount = 1
      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 3,
      }).expect(409);

      expect(res.body.message.gates.unclassifiedCount).toBe(1);
    });

    it('remains available after Cancel Reopen', async () => {
      const acct = await seedBankAccount(ds, `${runId}-late-crp`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 2,
      }).expect(200);

      // Late posting
      const late = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-15',
        moneyIn: '15.00',
        journalNo: `JE-LATECRP-${runId}`,
      });
      suiteEntryIds.push(late.entryId);

      // Cancel reopen
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/cancel-reopen`, {
        lockVersion: 3,
      }).expect(200);

      // Next draft can tick it
      const draft2 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodTo: '2026-02-28',
        closingBalance: '15.00',
        matchedLineIds: [late.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft2.body.data.id);

      expect(draft2.body.data.matched.map((r: any) => r.journalEntryLineId)).toEqual([late.lineId]);
    });

    it('is never auto-matched and never triggers a reopen', async () => {
      const acct = await seedBankAccount(ds, `${runId}-late-noauto`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Seed late posting
      const late = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-15',
        moneyIn: '35.00',
        journalNo: `JE-NOAUTO-${runId}`,
      });
      suiteEntryIds.push(late.entryId);

      // Status remains COMPLETED, not reopened
      const detail = await get(`/accounting/bank-reconciliations/${draft.body.data.id}`).expect(200);
      expect(detail.body.data.status).toBe('COMPLETED');
      expect(detail.body.data.reopened).toBe(false);
    });
  });

  describe('ledger is untouched', () => {
    it('journal entries and lines are identical after create, save, complete, reopen, cancel reopen, complete and discard', async () => {
      const acct = await seedBankAccount(ds, `${runId}-untouched`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '100.00',
        journalNo: `JE-UNT-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const beforeFingerprint = await journalFingerprint(ds, suiteEntryIds);
      const beforeCounts = await countJournalRows(ds);

      // 1. Create
      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '100.00',
        matchedLineIds: [l.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      // 2. Save
      await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        closingBalance: '100.00',
        matchedLineIds: [l.lineId],
      }).expect(200);

      // 3. Complete
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 2,
      }).expect(200);

      // 4. Reopen
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 3,
      }).expect(200);

      // 5. Cancel Reopen
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/cancel-reopen`, {
        lockVersion: 4,
      }).expect(200);

      // 6. Reopen again
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/reopen`, {
        lockVersion: 5,
      }).expect(200);

      // 7. Complete again
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 6,
      }).expect(200);

      // Discarding a completed draft is rejected (409)
      await del(`/accounting/bank-reconciliations/${draft.body.data.id}?lockVersion=7`).expect(409);

      // 8. Create a fresh draft and discard it
      const freshDraft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodTo: '2026-02-28',
        closingBalance: '100.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(freshDraft.body.data.id);

      await del(`/accounting/bank-reconciliations/${freshDraft.body.data.id}?lockVersion=1`).expect(204);

      // Assert ledger is completely untouched
      const afterFingerprint = await journalFingerprint(ds, suiteEntryIds);
      const afterCounts = await countJournalRows(ds);

      expect(afterFingerprint).toBe(beforeFingerprint);
      expect(afterCounts).toEqual(beforeCounts);
    });
  });
});
