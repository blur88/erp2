import { SESSION_PROTOCOL } from './utils/session-protocol';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
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
import { BankReconciliationService } from '../src/modules/bank-reconciliations/services/bank-reconciliation.service';
import { RECONCILIATION_TEST_HOOK } from '../src/modules/bank-reconciliations/services/bank-reconciliation.test-hooks';

function withTimeout<T>(promise: Promise<T>, ms: number, msg = 'Operation timed out'): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(msg)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

describe('Bank reconciliation complete lifecycle (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let service: BankReconciliationService;
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
    service = app.get(BankReconciliationService);

    adminUsername = `e2espec_recon_c_${runId}`;
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
    delete (service as any)[RECONCILIATION_TEST_HOOK];
    await removeSuiteTraces(ds, {
      userIds: adminUserId ? [adminUserId] : [],
      usernames: adminUsername ? [adminUsername] : [],
      entityIds: suiteReconciliationIds,
    });
    await removeSuiteBankReconciliations(ds, suiteReconciliationIds);
    await ds.query(`
      DELETE FROM journal_entry_line WHERE "entryId" IN (
        SELECT id FROM journal_entry WHERE "journalNo" LIKE 'JE-5K-%'
      )
    `);
    await ds.query(`DELETE FROM journal_entry WHERE "journalNo" LIKE 'JE-5K-%'`);
    await removeSuiteJournalEntries(ds, suiteEntryIds);
    await removeSuiteAccounts(ds, suiteAccountIds);
    if (adminUsername) {
      await removeSuiteAdmin(ds, adminUsername);
    }
    await app.close();
  });

  describe('gates', () => {
    it('completes when Difference is exactly zero cents and appends version 1', async () => {
      const acct = await seedBankAccount(ds, `${runId}-g1`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '150.00',
        journalNo: `JE-G1-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '150.00',
        matchedLineIds: [l.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.currentVersionNo).toBe(1);
      expect(res.body.data.reopened).toBe(false);
      expect(res.body.data.summary.difference).toBe('0.00');

      const versions = await ds.query(
        `SELECT * FROM bank_statement_reconciliation_versions WHERE "reconciliationId" = $1`,
        [draft.body.data.id],
      );
      expect(versions.length).toBe(1);
      expect(versions[0].versionNo).toBe(1);
      expect(versions[0].sealedAt).not.toBeNull();
    });

    it('completes an empty selection when closing equals opening', async () => {
      const acct = await seedBankAccount(ds, `${runId}-empty`);
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

      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.currentVersionNo).toBe(1);
    });

    it('rejects a non-zero Difference and leaves no version row', async () => {
      const acct = await seedBankAccount(ds, `${runId}-diff`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '100.00',
        closingBalance: '250.00', // expected 100.00 with 0 lines
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(409);

      // closing 250.00 − (opening 100.00 + nothing ticked) = 150.00. This is a
      // sequence-1 reconciliation with nothing cleared, so the opening gate
      // fails too: opening 100.00 − cleared net 0.00 = 100.00.
      expect(res.body.message.gates).toEqual({
        difference: '150.00',
        openingBalanceDifference: '100.00',
      });
      expect(res.body.message.text).toBe(
        'Cannot complete: Difference is 150.00; Opening Balance Difference is 100.00.',
      );

      const versions = await ds.query(
        `SELECT count(*)::int AS c FROM bank_statement_reconciliation_versions WHERE "reconciliationId" = $1`,
        [draft.body.data.id],
      );
      expect(versions[0].c).toBe(0);
    });

    it('follows D13: two 0.0050 debits need a closing 0.02 higher; 0.01 higher is rejected', async () => {
      const acct = await seedBankAccount(ds, `${runId}-d13`);
      suiteAccountIds.push(acct.id);

      const l1 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '0.0050',
        journalNo: `JE-D13-1-${runId}`,
      });
      const l2 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-11',
        moneyIn: '0.0050',
        journalNo: `JE-D13-2-${runId}`,
      });
      suiteEntryIds.push(l1.entryId, l2.entryId);

      // Try closingBalance 0.01 (unquantized sum is 0.01, but quantized is 0.01 + 0.01 = 0.02)
      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.01',
        matchedLineIds: [l1.lineId, l2.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(409);

      // Now update closingBalance to 0.02 -> completes!
      await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        closingBalance: '0.02',
      }).expect(200);

      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 2,
      }).expect(200);
    });

    it('sequence 1: rejects a non-zero Opening Balance Difference even when closing balances', async () => {
      const acct = await seedBankAccount(ds, `${runId}-opndiff`);
      suiteAccountIds.push(acct.id);

      const lPre = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '50.00',
        journalNo: `JE-OPN-${runId}`,
      });
      suiteEntryIds.push(lPre.entryId);

      // Opening balance 100.00, cleared net is 50.00 -> openingBalanceDifference = 50.00 != 0
      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '100.00',
        closingBalance: '100.00', // closing difference is 0
        matchedLineIds: [],
        setupChanges: [{ journalEntryLineId: lPre.lineId, classification: SetupClassification.CLEARED }],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(409);

      // opening 100.00 − cleared net 50.00 = 50.00; the closing gate passes and is absent
      expect(res.body.message.gates).toEqual({ openingBalanceDifference: '50.00' });
    });

    it('sequence 1: rejects when an OUTSTANDING pre-period entry is unclassified', async () => {
      const acct = await seedBankAccount(ds, `${runId}-uncls1`);
      suiteAccountIds.push(acct.id);

      const lPre = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-UNCL1-${runId}`,
      });
      suiteEntryIds.push(lPre.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(409);

      expect(res.body.message.gates.unclassifiedCount).toBe(1);
    });

    it('sequence 1: rejects when a TICKED pre-period entry is unclassified', async () => {
      const acct = await seedBankAccount(ds, `${runId}-tck-uncls`);
      suiteAccountIds.push(acct.id);

      const lPre = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-TCK-UNCL-${runId}`,
      });
      suiteEntryIds.push(lPre.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '0.00',
        closingBalance: '10.00',
        matchedLineIds: [lPre.lineId], // Ticked, but not setupMarked
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(409);

      expect(res.body.message.gates.unclassifiedCount).toBe(1);
    });

    it('reports each failing gate independently in one response', async () => {
      const acct = await seedBankAccount(ds, `${runId}-multi-gate`);
      suiteAccountIds.push(acct.id);

      const lPre = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '50.00',
        journalNo: `JE-MG-${runId}`,
      });
      suiteEntryIds.push(lPre.entryId);

      // Failing difference, failing openingBalanceDifference, failing unclassifiedCount
      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '100.00',
        closingBalance: '200.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(409);

      // closing 200.00 − opening 100.00 = 100.00; nothing cleared, so opening 100.00 − 0.00 = 100.00
      expect(res.body.message.gates).toEqual({
        difference: '100.00',
        openingBalanceDifference: '100.00',
        unclassifiedCount: 1,
      });
      expect(res.body.message.text).toBe(
        'Cannot complete: Difference is 100.00; Opening Balance Difference is 100.00; 1 entry is unclassified.',
      );
    });

    it('sequence 2 uses the previous closing as opening and rejects a gap or overlap', async () => {
      const acct = await seedBankAccount(ds, `${runId}-s2-gap`);
      suiteAccountIds.push(acct.id);

      // Completed sequence 1
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

      // Create sequence 2
      const draft2 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodTo: '2026-02-28',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft2.body.data.id);

      // Raw-edit periodFrom of sequence 2 to create a gap (e.g. 2026-02-05 instead of 2026-02-01)
      await ds.query(
        `UPDATE bank_statement_reconciliations SET "periodFrom" = '2026-02-05' WHERE id = $1`,
        [draft2.body.data.id],
      );

      const res = await post(`/accounting/bank-reconciliations/${draft2.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(409);

      expect(res.body.message.gates.continuity).toEqual(expect.any(String));
      expect(res.body.message.text).toContain(res.body.message.gates.continuity);
    });

    it('saves and completes a sequence-2 draft that has ticked lines', async () => {
      const acct = await seedBankAccount(ds, `${runId}-seq2save`);
      const contra = await seedContraAccount(ds, `${runId}-seq2save`);
      suiteAccountIds.push(acct.id, contra.id);
      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id, contraAccountId: contra.id, entryDate: '2026-02-10',
        moneyIn: '60.00', journalNo: `JE-SEQ2-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const first = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id, periodFrom: '2026-01-01', periodTo: '2026-01-31',
        openingBalance: '0.00', closingBalance: '0.00', matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(first.body.data.id);
      await post(`/accounting/bank-reconciliations/${first.body.data.id}/complete`, { lockVersion: 1 }).expect(200);

      const second = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id, periodTo: '2026-02-28', closingBalance: '0.00', matchedLineIds: [],
      }).expect(201);
      const id = second.body.data.id;
      suiteReconciliationIds.push(id);

      // Ticking a line on a later reconciliation must not be mistaken for a setup change.
      const saved = await patch(`/accounting/bank-reconciliations/${id}`, {
        lockVersion: 1, closingBalance: '60.00', matchedLineIds: [l.lineId],
      });
      expect(saved.status).toBe(200);
      expect(saved.body.data.summary.moneyIn).toBe('60.00');
      expect(saved.body.data.summary.difference).toBe('0.00');

      // Saving again with the same selection (a saved MATCHED line) works too.
      const again = await patch(`/accounting/bank-reconciliations/${id}`, {
        lockVersion: 2, matchedLineIds: [l.lineId],
      });
      expect(again.status).toBe(200);

      await post(`/accounting/bank-reconciliations/${id}/complete`, { lockVersion: 3 }).expect(200);
    });

    it('rejects a stale lockVersion and a non-draft', async () => {
      const acct = await seedBankAccount(ds, `${runId}-stale-c`);
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

      // Stale lockVersion
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 99,
      }).expect(409);

      // Complete successfully
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(200);

      // Second complete on already COMPLETED -> 409
      await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 2,
      }).expect(409);
    });
  });

  describe('snapshot consistency', () => {
    it('includes a posting committed at beforeSnapshot as OUTSTANDING', async () => {
      const acct = await seedBankAccount(ds, `${runId}-snap-bf`);
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

      let lateLineId = '';
      (service as any)[RECONCILIATION_TEST_HOOK] = async (phase: string) => {
        if (phase === 'beforeSnapshot') {
          const l = await seedBankJournalLine(ds, {
            bankAccountId: acct.id,
            contraAccountId: contraAccount.id,
            entryDate: '2026-01-20',
            moneyIn: '50.00',
            journalNo: `JE-SNAP-BF-${runId}`,
          });
          suiteEntryIds.push(l.entryId);
          lateLineId = l.lineId;
        }
      };

      try {
        await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
          lockVersion: 1,
        }).expect(200);

        const vLine = await ds.query(
          `SELECT * FROM bank_statement_reconciliation_version_lines
            WHERE "journalEntryLineId" = $1`,
          [lateLineId],
        );
        expect(vLine.length).toBe(1);
        expect(vLine[0].role).toBe('OUTSTANDING');
      } finally {
        delete (service as any)[RECONCILIATION_TEST_HOOK];
      }
    });

    it('excludes a posting committed at afterSnapshot, and the next draft lists it', async () => {
      const acct = await seedBankAccount(ds, `${runId}-snap-af`);
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

      let afterLineId = '';
      (service as any)[RECONCILIATION_TEST_HOOK] = async (phase: string) => {
        if (phase === 'afterSnapshot') {
          const l = await seedBankJournalLine(ds, {
            bankAccountId: acct.id,
            contraAccountId: contraAccount.id,
            entryDate: '2026-01-20',
            moneyIn: '50.00',
            journalNo: `JE-SNAP-AF-${runId}`,
          });
          suiteEntryIds.push(l.entryId);
          afterLineId = l.lineId;
        }
      };

      try {
        await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
          lockVersion: 1,
        }).expect(200);

        const vLine = await ds.query(
          `SELECT * FROM bank_statement_reconciliation_version_lines
            WHERE "journalEntryLineId" = $1`,
          [afterLineId],
        );
        expect(vLine.length).toBe(0);

        // Next draft for period 2 lists it
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
        expect(ids).toContain(afterLineId);
      } finally {
        delete (service as any)[RECONCILIATION_TEST_HOOK];
      }
    });

    it('fails when a working line would be dropped by the snapshot join', async () => {
      const acct = await seedBankAccount(ds, `${runId}-drp`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '100.00',
        journalNo: `JE-DRP-${runId}`,
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

      // Raw soft-delete the journal line
      await ds.query(`UPDATE journal_entry_line SET "deletedAt" = now() WHERE id = $1`, [l.lineId]);

      const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
        lockVersion: 1,
      }).expect(409);

      expect(res.body.message.gates.workingSetMismatchIds).toContain(l.lineId);
    });

    it('copies displayed values so a later raw edit of journal description does not change the detail', async () => {
      const acct = await seedBankAccount(ds, `${runId}-froz`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '100.00',
        journalNo: `JE-FROZ-${runId}`,
        description: 'Original Description',
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

      // Raw edit journal description
      await ds.query(`UPDATE journal_entry SET description = 'Modified Description' WHERE id = $1`, [l.entryId]);

      const linesRes = await get(`/accounting/bank-reconciliations/${draft.body.data.id}/lines?role=MATCHED`).expect(200);
      expect(linesRes.body.data[0].description).toBe('Original Description');
    });

    it('keeps the bank account name of completion time after the account is renamed', async () => {
      const acct = await seedBankAccount(ds, `${runId}-rnm`);
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

      // Rename bank account
      await ds.query(`UPDATE chart_of_account SET name = 'Renamed Account' WHERE id = $1`, [acct.id]);

      const detail = await get(`/accounting/bank-reconciliations/${draft.body.data.id}`).expect(200);
      expect(detail.body.data.bankAccount.name).toBe(acct.name);
    });
  });

  describe('completed reads', () => {
    it('list and detail show version figures and status COMPLETED with reopened false', async () => {
      const acct = await seedBankAccount(ds, `${runId}-cr-rd`);
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

      const detail = await get(`/accounting/bank-reconciliations/${draft.body.data.id}`).expect(200);
      expect(detail.body.data.status).toBe('COMPLETED');
      expect(detail.body.data.reopened).toBe(false);
      expect(detail.body.data.matched).toEqual([]);
      expect(detail.body.data.classified).toEqual([]);

      const listRes = await get(`/accounting/bank-reconciliations?bankAccountId=${acct.id}`).expect(200);
      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].status).toBe('COMPLETED');
      expect(listRes.body.data[0].reopened).toBe(false);
    });

    it('lines?role=OUTSTANDING returns the outstanding-at-completion snapshot', async () => {
      const acct = await seedBankAccount(ds, `${runId}-out-rd`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-15',
        moneyIn: '25.00',
        journalNo: `JE-OUT-RD-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

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

      const linesRes = await get(`/accounting/bank-reconciliations/${draft.body.data.id}/lines?role=OUTSTANDING`).expect(200);
      expect(linesRes.body.data.length).toBe(1);
      expect(linesRes.body.data[0].journalEntryLineId).toBe(l.lineId);
      expect(linesRes.body.data[0].role).toBe('OUTSTANDING');
    });

    it('a later version line never blocks ticking the same journal line in the next reconciliation', async () => {
      const acct = await seedBankAccount(ds, `${runId}-nxt-tk`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-15',
        moneyIn: '25.00',
        journalNo: `JE-NXT-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      // Period 1 completes leaving l as OUTSTANDING
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

      // Period 2 can tick l
      const draft2 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodTo: '2026-02-28',
        closingBalance: '25.00',
        matchedLineIds: [l.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft2.body.data.id);

      expect(draft2.body.data.matched.map((r: any) => r.journalEntryLineId)).toEqual([l.lineId]);
    });
  });

  describe('concurrency', () => {
    it('two simultaneous completes yield one version and one 409', async () => {
      const acct = await seedBankAccount(ds, `${runId}-cnc-c`);
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

      const [r1, r2] = await Promise.allSettled([
        post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, { lockVersion: 1 }),
        post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, { lockVersion: 1 }),
      ]);

      const statuses = [
        r1.status === 'fulfilled' ? (r1.value as any).status : null,
        r2.status === 'fulfilled' ? (r2.value as any).status : null,
      ].sort();

      expect(statuses).toEqual([200, 409]);

      const versions = await ds.query(
        `SELECT * FROM bank_statement_reconciliation_versions WHERE "reconciliationId" = $1`,
        [draft.body.data.id],
      );
      expect(versions.length).toBe(1);
    });

    it('a save racing a complete either lands before it or gets 409, never after', async () => {
      const acct = await seedBankAccount(ds, `${runId}-race-sc`);
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

      const [saveRes, completeRes] = await Promise.allSettled([
        patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, { lockVersion: 1, closingBalance: '10.00' }),
        post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, { lockVersion: 1 }),
      ]);

      const saveStatus = saveRes.status === 'fulfilled' ? (saveRes.value as any).status : null;
      const completeStatus = completeRes.status === 'fulfilled' ? (completeRes.value as any).status : null;

      // Either save succeeds and complete fails (409 difference or stale lock),
      // OR complete succeeds and save gets 409 (not draft)
      if (saveStatus === 200) {
        expect(completeStatus).toBe(409);
      } else {
        expect(completeStatus).toBe(200);
        expect(saveStatus).toBe(409);
      }
    });
  });

  it('completes 5,000 pre-period classified lines within the suite timeout', async () => {
    const acct = await seedBankAccount(ds, `${runId}-5k`);
    suiteAccountIds.push(acct.id);

    // Fast batch insert of 5,000 pre-period journal entries and lines
    await ds.query(`
      WITH ins_je AS (
        INSERT INTO journal_entry ("journalNo", "entryDate", "sourceType", "postingType", description, "createdBy")
        SELECT 'JE-5K-' || i, '2025-01-01', 'EXPENSE', 'EXPENSE_PAYMENT', 'bulk 5k', 'test'
        FROM generate_series(1, 5000) AS i
        RETURNING id
      )
      INSERT INTO journal_entry_line ("entryId", "accountId", debit, credit)
      SELECT id, $1, 10.0000, 0.0000
      FROM ins_je
    `, [acct.id]);

    // Create draft
    const draft = await post('/accounting/bank-reconciliations', {
      bankAccountId: acct.id,
      periodFrom: '2026-01-01',
      periodTo: '2026-01-31',
      openingBalance: '50000.00',
      closingBalance: '50000.00',
      matchedLineIds: [],
    }).expect(201);
    suiteReconciliationIds.push(draft.body.data.id);

    // Bulk insert opening cleared lines into bank_statement_reconciliation_lines
    await ds.query(`
      INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
      SELECT $1, jel.id, 'OPENING_CLEARED', 'test', now()
        FROM journal_entry_line jel
       WHERE jel."accountId" = $2
    `, [draft.body.data.id, acct.id]);

    const start = Date.now();
    const res = await post(`/accounting/bank-reconciliations/${draft.body.data.id}/complete`, {
      lockVersion: 1,
    }).expect(200);

    const duration = Date.now() - start;
    expect(res.body.data.status).toBe('COMPLETED');
    expect(duration).toBeLessThan(10000);
  });
});
