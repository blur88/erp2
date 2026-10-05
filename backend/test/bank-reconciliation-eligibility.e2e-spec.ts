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
  insertReconciliationRaw,
  insertCompletedReconciliationRaw,
  removeSuiteBankReconciliations,
  removeSuiteJournalEntries,
  removeSuiteAccounts,
} from './utils/bank-reconciliation-fixture';
import { E2E_ADMIN_PASSWORD, removeSuiteAdmin, seedSuiteAdmin } from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';
import { SetupClassification } from '../src/modules/bank-reconciliations/entities/bank-reconciliation.entity';
import { quantizeToCents, toMinorUnits, formatMoney } from '../src/common/utils/money';

describe('Bank reconciliation eligibility and preview (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token = '';
  let post: (path: string, body?: any) => request.Test;

  const runId = randomUUID().slice(0, 6);
  let adminUserId = '';
  let adminUsername = '';

  const suiteAccountIds: string[] = [];
  const suiteEntryIds: string[] = [];
  const suiteReconciliationIds: string[] = [];

  let contraAccount: { id: string; code: string };
  let primaryBankAccount: { id: string; code: string; name: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    adminUsername = `e2espec_bsr_${runId}`;
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

    contraAccount = await seedContraAccount(ds, runId);
    suiteAccountIds.push(contraAccount.id);

    primaryBankAccount = await seedBankAccount(ds, `${runId}-prim`);
    suiteAccountIds.push(primaryBankAccount.id);
  });

  afterAll(async () => {
    // Clean up bulk entries if created
    await ds.query(`DELETE FROM journal_entry_line WHERE "entryId" IN (SELECT id FROM journal_entry WHERE "journalNo" LIKE 'JE-BULK-%')`);
    await ds.query(`DELETE FROM journal_entry WHERE "journalNo" LIKE 'JE-BULK-%'`);

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

  it('returns 401 without a token on both routes', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/accounting/bank-reconciliations/eligible-lines/search')
      .send({ bankAccountId: primaryBankAccount.id, periodTo: '2026-10-31', view: 'checklist' })
      .expect(401);

    await request(server)
      .post('/accounting/bank-reconciliations/preview')
      .send({ bankAccountId: primaryBankAccount.id, periodTo: '2026-10-31', matchedLineIds: [] })
      .expect(401);
  });

  it('lists lines on or before To and excludes later ones', async () => {
    const l1 = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-10',
      moneyIn: '10.00',
      journalNo: `JE-TO-1-${runId}`,
    });
    const l2 = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-15',
      moneyOut: '5.00',
      journalNo: `JE-TO-2-${runId}`,
    });
    const l3 = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-20',
      moneyIn: '20.00',
      journalNo: `JE-TO-3-${runId}`,
    });
    suiteEntryIds.push(l1.entryId, l2.entryId, l3.entryId);

    const res = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-15',
      view: 'checklist',
    }).expect(200);

    const ids = res.body.data.map((r: any) => r.journalEntryLineId);
    expect(ids).toContain(l1.lineId);
    expect(ids).toContain(l2.lineId);
    expect(ids).not.toContain(l3.lineId);
  });

  it('excludes soft-deleted lines and lines of other accounts', async () => {
    const otherBank = await seedBankAccount(ds, `${runId}-oth`);
    suiteAccountIds.push(otherBank.id);

    const lOther = await seedBankJournalLine(ds, {
      bankAccountId: otherBank.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-10',
      moneyIn: '15.00',
      journalNo: `JE-OTH-${runId}`,
    });
    suiteEntryIds.push(lOther.entryId);

    const lDeletedLine = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-10',
      moneyIn: '25.00',
      journalNo: `JE-DEL-L-${runId}`,
    });
    suiteEntryIds.push(lDeletedLine.entryId);
    await ds.query(`UPDATE journal_entry_line SET "deletedAt" = now() WHERE id = $1`, [lDeletedLine.lineId]);

    const lDeletedEntry = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-10',
      moneyIn: '35.00',
      journalNo: `JE-DEL-E-${runId}`,
    });
    suiteEntryIds.push(lDeletedEntry.entryId);
    await ds.query(`UPDATE journal_entry SET "deletedAt" = now() WHERE id = $1`, [lDeletedEntry.entryId]);

    const res = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-31',
      view: 'checklist',
    }).expect(200);

    const ids = res.body.data.map((r: any) => r.journalEntryLineId);
    expect(ids).not.toContain(lOther.lineId);
    expect(ids).not.toContain(lDeletedLine.lineId);
    expect(ids).not.toContain(lDeletedEntry.lineId);
  });

  it('excludes lines reserved by another reconciliation and includes the lines this reconciliation reserved', async () => {
    const acct2 = await seedBankAccount(ds, `${runId}-res`);
    suiteAccountIds.push(acct2.id);

    const l1 = await seedBankJournalLine(ds, {
      bankAccountId: acct2.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-10',
      moneyIn: '40.00',
      journalNo: `JE-RES-1-${runId}`,
    });
    const l2 = await seedBankJournalLine(ds, {
      bankAccountId: acct2.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-11',
      moneyIn: '50.00',
      journalNo: `JE-RES-2-${runId}`,
    });
    suiteEntryIds.push(l1.entryId, l2.entryId);

    // Create Draft 1 on acct2
    const recon1 = await insertReconciliationRaw(ds, {
      reconciliationNo: `BR-R1-${runId}`,
      bankAccountId: acct2.id,
      sequenceNo: 1,
      periodFrom: '2026-01-01',
      periodTo: '2026-01-31',
      status: 'DRAFT',
    });
    suiteReconciliationIds.push(recon1);

    // recon1 reserves l1
    await ds.query(
      `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
       VALUES ($1, $2, 'MATCHED', 'test', now())`,
      [recon1, l1.lineId],
    );

    // Search for recon1: should see both l1 (its own reservation) and l2
    const resOwn = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: acct2.id,
      reconciliationId: recon1,
      periodTo: '2026-01-31',
      view: 'checklist',
    }).expect(200);

    const idsOwn = resOwn.body.data.map((r: any) => r.journalEntryLineId);
    expect(idsOwn).toContain(l1.lineId);
    expect(idsOwn).toContain(l2.lineId);

    // Now if a query is run without reconciliationId for acct2, l1 is reserved by recon1, so l1 must be excluded
    const resOther = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: acct2.id,
      periodTo: '2026-01-31',
      view: 'checklist',
    }).expect(200);

    const idsOther = resOther.body.data.map((r: any) => r.journalEntryLineId);
    expect(idsOther).not.toContain(l1.lineId);
    expect(idsOther).toContain(l2.lineId);
  });

  it('shows an original and its reversal as two separate rows, never netted', async () => {
    const orig = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-12',
      moneyIn: '100.00',
      journalNo: `JE-REV-ORIG-${runId}`,
    });
    const rev = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-13',
      moneyOut: '100.00',
      journalNo: `JE-REV-REV-${runId}`,
      reversalOfEntryId: orig.entryId,
    });
    suiteEntryIds.push(orig.entryId, rev.entryId);

    const res = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-31',
      view: 'checklist',
    }).expect(200);

    const rowOrig = res.body.data.find((r: any) => r.journalEntryLineId === orig.lineId);
    const rowRev = res.body.data.find((r: any) => r.journalEntryLineId === rev.lineId);

    expect(rowOrig).toBeDefined();
    expect(rowRev).toBeDefined();
    expect(rowOrig.moneyIn).toBe('100.00');
    expect(rowOrig.moneyOut).toBe('0.00');
    expect(rowRev.moneyIn).toBe('0.00');
    expect(rowRev.moneyOut).toBe('100.00');
  });

  it('quantizes row amounts: 850.0032 → "850.00"', async () => {
    const l = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-14',
      moneyIn: '850.0032',
      journalNo: `JE-QNT-${runId}`,
    });
    suiteEntryIds.push(l.entryId);

    const res = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-31',
      view: 'checklist',
    }).expect(200);

    const row = res.body.data.find((r: any) => r.journalEntryLineId === l.lineId);
    expect(row).toBeDefined();
    expect(row.moneyIn).toBe('850.00');
    expect(row.moneyOut).toBe('0.00');
  });

  it('searches journalNo, sourceRef and description', async () => {
    const l = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-15',
      moneyIn: '77.00',
      journalNo: `JE-SRCH-${runId}`,
      sourceRef: `REF-SRCH-${runId}`,
      description: `UniqDesc-${runId}`,
    });
    suiteEntryIds.push(l.entryId);

    // Search by journalNo
    const resNo = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-31',
      view: 'checklist',
      search: `JE-SRCH-${runId}`,
    }).expect(200);
    expect(resNo.body.data.some((r: any) => r.journalEntryLineId === l.lineId)).toBe(true);

    // Search by sourceRef
    const resRef = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-31',
      view: 'checklist',
      search: `REF-SRCH-${runId}`,
    }).expect(200);
    expect(resRef.body.data.some((r: any) => r.journalEntryLineId === l.lineId)).toBe(true);

    // Search by description
    const resDesc = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-31',
      view: 'checklist',
      search: `UniqDesc-${runId}`,
    }).expect(200);
    expect(resDesc.body.data.some((r: any) => r.journalEntryLineId === l.lineId)).toBe(true);
  });

  it('setup view returns only lines dated before From and rejects sequence > 1 with 400', async () => {
    const acctSeq = await seedBankAccount(ds, `${runId}-sq1`);
    suiteAccountIds.push(acctSeq.id);

    const lPre = await seedBankJournalLine(ds, {
      bankAccountId: acctSeq.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-05',
      moneyIn: '10.00',
      journalNo: `JE-PRE-${runId}`,
    });
    const lIn = await seedBankJournalLine(ds, {
      bankAccountId: acctSeq.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-15',
      moneyIn: '20.00',
      journalNo: `JE-IN-${runId}`,
    });
    suiteEntryIds.push(lPre.entryId, lIn.entryId);

    // sequence 1 setup view with periodFrom '2026-01-10'
    const resSetup = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: acctSeq.id,
      periodFrom: '2026-01-10',
      periodTo: '2026-01-31',
      view: 'setup',
    }).expect(200);

    const idsSetup = resSetup.body.data.map((r: any) => r.journalEntryLineId);
    expect(idsSetup).toContain(lPre.lineId);
    expect(idsSetup).not.toContain(lIn.lineId);

    // Now complete a reconciliation on acctSeq so it has sequence 1 completed
    const reconCompleted = await insertCompletedReconciliationRaw(ds, {
      reconciliationNo: `BR-SQ1-CMP-${runId}`,
      bankAccountId: acctSeq.id,
      sequenceNo: 1,
      periodFrom: '2026-01-10',
      periodTo: '2026-01-31',
    });
    suiteReconciliationIds.push(reconCompleted.reconciliationId);

    // Next reconciliation on acctSeq will have sequence 2. Setup view must be rejected with 400
    await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: acctSeq.id,
      periodFrom: '2026-02-01',
      periodTo: '2026-02-28',
      view: 'setup',
    }).expect(400);
  });

  it('filters by effective classification including unsaved setupChanges', async () => {
    const acct = await seedBankAccount(ds, `${runId}-cls`);
    suiteAccountIds.push(acct.id);

    const l1 = await seedBankJournalLine(ds, {
      bankAccountId: acct.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-02',
      moneyIn: '10.00',
      journalNo: `JE-CLS-1-${runId}`,
    });
    const l2 = await seedBankJournalLine(ds, {
      bankAccountId: acct.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-03',
      moneyIn: '20.00',
      journalNo: `JE-CLS-2-${runId}`,
    });
    suiteEntryIds.push(l1.entryId, l2.entryId);

    const recon = await insertReconciliationRaw(ds, {
      reconciliationNo: `BR-CLS-${runId}`,
      bankAccountId: acct.id,
      sequenceNo: 1,
      periodFrom: '2026-01-10',
      periodTo: '2026-01-31',
      status: 'DRAFT',
    });
    suiteReconciliationIds.push(recon);

    // saved in DB: L1 has OPENING_CLEARED line
    await ds.query(
      `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
       VALUES ($1, $2, 'OPENING_CLEARED', 'test', now())`,
      [recon, l1.lineId],
    );

    // Request overlays L1 → UNCLASSIFIED, L2 → OUTSTANDING
    // classification=UNCLASSIFIED returns L1 and not L2
    const res = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: acct.id,
      reconciliationId: recon,
      periodFrom: '2026-01-10',
      periodTo: '2026-01-31',
      view: 'setup',
      classification: SetupClassification.UNCLASSIFIED,
      setupChanges: [
        { journalEntryLineId: l1.lineId, classification: SetupClassification.UNCLASSIFIED },
        { journalEntryLineId: l2.lineId, classification: SetupClassification.OUTSTANDING },
      ],
    }).expect(200);

    const ids = res.body.data.map((r: any) => r.journalEntryLineId);
    expect(ids).toContain(l1.lineId);
    expect(ids).not.toContain(l2.lineId);
  });

  it('setupSummary counts and openingBalanceDifference use the overlay', async () => {
    const acct = await seedBankAccount(ds, `${runId}-sum`);
    suiteAccountIds.push(acct.id);

    const l1 = await seedBankJournalLine(ds, {
      bankAccountId: acct.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-02',
      moneyIn: '50.00',
      journalNo: `JE-SUM-1-${runId}`,
    });
    const l2 = await seedBankJournalLine(ds, {
      bankAccountId: acct.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-03',
      moneyIn: '30.00',
      journalNo: `JE-SUM-2-${runId}`,
    });
    suiteEntryIds.push(l1.entryId, l2.entryId);

    // Request with openingBalance '100.00' and overlay: L1 is CLEARED, L2 is OUTSTANDING
    const res = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: acct.id,
      periodFrom: '2026-01-10',
      periodTo: '2026-01-31',
      openingBalance: '100.00',
      view: 'setup',
      setupChanges: [
        { journalEntryLineId: l1.lineId, classification: SetupClassification.CLEARED },
        { journalEntryLineId: l2.lineId, classification: SetupClassification.OUTSTANDING },
      ],
    }).expect(200);

    expect(res.body.setupSummary).toBeDefined();
    expect(res.body.setupSummary.prePeriodTotal).toBe(2);
    expect(res.body.setupSummary.clearedCount).toBe(1);
    expect(res.body.setupSummary.outstandingCount).toBe(1);
    expect(res.body.setupSummary.unclassifiedCount).toBe(0);
    expect(res.body.setupSummary.openingClearedNet).toBe('50.00');
    expect(res.body.setupSummary.openingBalanceDifference).toBe('50.00'); // 100.00 - 50.00
  });

  it('preview splits requested ids into matched and invalidMatched after To is shortened', async () => {
    const l1 = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-10',
      moneyIn: '10.00',
      journalNo: `JE-PRV-1-${runId}`,
    });
    const l2 = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-20',
      moneyIn: '20.00',
      journalNo: `JE-PRV-2-${runId}`,
    });
    suiteEntryIds.push(l1.entryId, l2.entryId);

    // Preview with periodTo shortened to 2026-01-15, matchedLineIds: [l1, l2]
    const res = await post('/accounting/bank-reconciliations/preview', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-15',
      matchedLineIds: [l1.lineId, l2.lineId],
    }).expect(200);

    const matchedIds = res.body.data.matched.map((r: any) => r.journalEntryLineId);
    const invalidIds = res.body.data.invalidMatched.map((r: any) => r.journalEntryLineId);

    expect(matchedIds).toContain(l1.lineId);
    expect(matchedIds).not.toContain(l2.lineId);
    expect(invalidIds).toContain(l2.lineId);
  });

  it('preview reports classifications no longer before From as invalidClassifications', async () => {
    const l1 = await seedBankJournalLine(ds, {
      bankAccountId: primaryBankAccount.id,
      contraAccountId: contraAccount.id,
      entryDate: '2026-01-10',
      moneyIn: '15.00',
      journalNo: `JE-INV-CLS-${runId}`,
    });
    suiteEntryIds.push(l1.entryId);

    // periodFrom is 2026-01-05, so l1 (dated 2026-01-10) is NOT before periodFrom!
    const res = await post('/accounting/bank-reconciliations/preview', {
      bankAccountId: primaryBankAccount.id,
      periodFrom: '2026-01-05',
      periodTo: '2026-01-31',
      matchedLineIds: [],
      setupChanges: [
        { journalEntryLineId: l1.lineId, classification: SetupClassification.CLEARED },
      ],
    }).expect(200);

    const invalidClsIds = res.body.data.invalidClassifications.map((r: any) => r.journalEntryLineId);
    expect(invalidClsIds).toContain(l1.lineId);
  });

  it('searches 5,000 pre-period lines within the suite timeout and returns meta.total = 5000', async () => {
    const bulkAcct = await seedBankAccount(ds, `${runId}-blk`);
    suiteAccountIds.push(bulkAcct.id);

    // Fast batch insert of 5,000 journal entries and lines dated 2025-01-01
    await ds.query(`
      WITH ins_je AS (
        INSERT INTO journal_entry ("journalNo", "entryDate", "sourceType", "postingType", description, "createdBy")
        SELECT 'JE-BULK-' || i, '2025-01-01', 'EXPENSE', 'EXPENSE_PAYMENT', 'bulk', 'test'
        FROM generate_series(1, 5000) AS i
        RETURNING id
      )
      INSERT INTO journal_entry_line ("entryId", "accountId", debit, credit)
      SELECT id, $1, 10.0000, 0.0000
      FROM ins_je
    `, [bulkAcct.id]);

    const start = Date.now();
    const res = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: bulkAcct.id,
      periodFrom: '2026-01-01',
      periodTo: '2026-01-31',
      view: 'setup',
      limit: 25,
      page: 1,
    }).expect(200);

    const duration = Date.now() - start;
    expect(res.body.meta.total).toBe(5000);
    expect(res.body.data.length).toBe(25);
    expect(duration).toBeLessThan(5000);
  });

  it('rejects a reconciliationId that belongs to a different bank account with 400', async () => {
    const otherAcct = await seedBankAccount(ds, `${runId}-dff`);
    suiteAccountIds.push(otherAcct.id);

    const recon = await insertReconciliationRaw(ds, {
      reconciliationNo: `BR-DFF-${runId}`,
      bankAccountId: otherAcct.id,
      status: 'DRAFT',
    });
    suiteReconciliationIds.push(recon);

    // Try to search with primaryBankAccount but reconciliationId of otherAcct
    const res = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: primaryBankAccount.id,
      reconciliationId: recon,
      periodTo: '2026-01-31',
      view: 'checklist',
    }).expect(400);

    expect(res.body.message).toBe('This reconciliation does not belong to the selected bank account.');
  });

  it('rejects search and preview for a COMPLETED reconciliation with 409', async () => {
    const acct = await seedBankAccount(ds, `${runId}-cmp`);
    suiteAccountIds.push(acct.id);

    const recon = await insertCompletedReconciliationRaw(ds, {
      reconciliationNo: `BR-CMP-${runId}`,
      bankAccountId: acct.id,
    });
    suiteReconciliationIds.push(recon.reconciliationId);

    await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: acct.id,
      reconciliationId: recon.reconciliationId,
      periodTo: '2026-01-31',
      view: 'checklist',
    }).expect(409);

    await post('/accounting/bank-reconciliations/preview', {
      bankAccountId: acct.id,
      reconciliationId: recon.reconciliationId,
      periodTo: '2026-01-31',
      matchedLineIds: [],
    }).expect(409);
  });

  it('derives sequence server-side: setup view is refused for sequence 2 whatever the request contains', async () => {
    const acct = await seedBankAccount(ds, `${runId}-sq2`);
    suiteAccountIds.push(acct.id);

    // Complete sequence 1
    const r1 = await insertCompletedReconciliationRaw(ds, {
      reconciliationNo: `BR-CMP1-${runId}`,
      bankAccountId: acct.id,
      sequenceNo: 1,
      periodFrom: '2026-01-01',
      periodTo: '2026-01-31',
    });
    suiteReconciliationIds.push(r1.reconciliationId);

    // Attempting setup view on next reconciliation (sequence 2) should fail with 400 even if request says sequence 1 or omits
    await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: acct.id,
      periodFrom: '2026-02-01',
      periodTo: '2026-02-28',
      view: 'setup',
    }).expect(400);
  });

  it('writes nothing: row counts of all five tables are unchanged after search and preview', async () => {
    const getCounts = async () => {
      const [r1] = await ds.query(`SELECT count(*)::int AS c FROM bank_statement_reconciliations`);
      const [r2] = await ds.query(`SELECT count(*)::int AS c FROM bank_statement_reconciliation_lines`);
      const [r3] = await ds.query(`SELECT count(*)::int AS c FROM bank_statement_reconciliation_setup_marks`);
      const [r4] = await ds.query(`SELECT count(*)::int AS c FROM bank_statement_reconciliation_versions`);
      const [r5] = await ds.query(`SELECT count(*)::int AS c FROM bank_statement_reconciliation_version_lines`);
      return [r1.c, r2.c, r3.c, r4.c, r5.c];
    };

    const before = await getCounts();

    await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-31',
      view: 'checklist',
    }).expect(200);

    await post('/accounting/bank-reconciliations/preview', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-31',
      matchedLineIds: [],
    }).expect(200);

    const after = await getCounts();
    expect(after).toEqual(before);
  });

  it('SQL rounding agrees with quantizeToCents on 0.0050, 0.0049, 0.0150 and 850.0032', async () => {
    const amounts = ['0.0050', '0.0049', '0.0150', '850.0032'];
    const lines: string[] = [];

    for (const amt of amounts) {
      const l = await seedBankJournalLine(ds, {
        bankAccountId: primaryBankAccount.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-05',
        moneyIn: amt,
        journalNo: `JE-RND-${amt}-${runId}`,
      });
      suiteEntryIds.push(l.entryId);
      lines.push(l.lineId);
    }

    const res = await post('/accounting/bank-reconciliations/eligible-lines/search', {
      bankAccountId: primaryBankAccount.id,
      periodTo: '2026-01-31',
      view: 'checklist',
    }).expect(200);

    for (let i = 0; i < amounts.length; i++) {
      const amt = amounts[i];
      const lineId = lines[i];
      const row = res.body.data.find((r: any) => r.journalEntryLineId === lineId);
      expect(row).toBeDefined();

      const expectedInCents = quantizeToCents(toMinorUnits(amt));
      const expectedStr = formatMoney(expectedInCents);
      expect(row.moneyIn).toBe(expectedStr);
    }
  });
});
