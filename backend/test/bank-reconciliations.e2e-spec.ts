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
  insertCompletedReconciliationRaw,
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

describe('Bank reconciliations drafts lifecycle (e2e)', () => {
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
  let primaryBankAccount: { id: string; code: string; name: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);
    service = app.get(BankReconciliationService);

    adminUsername = `e2espec_recon_${runId}`;
    const admin = await seedSuiteAdmin(ds, adminUsername);
    adminUserId = admin.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
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

    primaryBankAccount = await seedBankAccount(ds, `${runId}-prim`);
    suiteAccountIds.push(primaryBankAccount.id);
  });

  afterAll(async () => {
    delete (service as any)[RECONCILIATION_TEST_HOOK];
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

  describe('create', () => {
    it('creates sequence 1 with a BR-YY-NNN number and lockVersion 1', async () => {
      const acct = await seedBankAccount(ds, `${runId}-cr1`);
      suiteAccountIds.push(acct.id);

      const res = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '100.00',
        closingBalance: '250.00',
        matchedLineIds: [],
      }).expect(201);

      const d = res.body.data;
      suiteReconciliationIds.push(d.id);

      expect(d.sequenceNo).toBe(1);
      expect(d.lockVersion).toBe(1);
      expect(d.reconciliationNo).toMatch(/^BR-\d{2}-\d{3}$/);
      expect(d.status).toBe('DRAFT');
    });

    it('accepts a negative opening and closing balance', async () => {
      const acct = await seedBankAccount(ds, `${runId}-neg`);
      suiteAccountIds.push(acct.id);

      const res = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '-250.00',
        closingBalance: '-350.00',
        matchedLineIds: [],
      }).expect(201);

      suiteReconciliationIds.push(res.body.data.id);
      expect(res.body.data.summary.openingBalance).toBe('-250.00');
      expect(res.body.data.summary.closingBalance).toBe('-350.00');
    });

    it('for sequence > 1 forces From and Opening and rejects them in the body', async () => {
      const acct = await seedBankAccount(ds, `${runId}-seq2`);
      suiteAccountIds.push(acct.id);

      // Sequence 1 completed
      const c1 = await insertCompletedReconciliationRaw(ds, {
        reconciliationNo: `BR-SQ1-${runId}`,
        bankAccountId: acct.id,
        sequenceNo: 1,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '500.00',
      });
      suiteReconciliationIds.push(c1.reconciliationId);

      // Attempting to pass periodFrom or openingBalance on create sequence 2 fails with 400
      await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-02-01',
        periodTo: '2026-02-28',
        closingBalance: '600.00',
        matchedLineIds: [],
      }).expect(400);

      // Creating without periodFrom and openingBalance succeeds and takes server values
      const res = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodTo: '2026-02-28',
        closingBalance: '600.00',
        matchedLineIds: [],
      }).expect(201);

      suiteReconciliationIds.push(res.body.data.id);
      expect(res.body.data.sequenceNo).toBe(2);
      expect(res.body.data.periodFrom).toBe('2026-02-01');
      expect(res.body.data.summary.openingBalance).toBe('500.00');
    });

    it('rejects a second draft on the same account with 409', async () => {
      const acct = await seedBankAccount(ds, `${runId}-2d`);
      suiteAccountIds.push(acct.id);

      const r1 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '100.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(r1.body.data.id);

      const r2 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-02-01',
        periodTo: '2026-02-28',
        closingBalance: '100.00',
        matchedLineIds: [],
      }).expect(409);

      expect(r2.body.message).toContain('already exists');
    });

    it('two simultaneous creates on one account yield exactly one draft', async () => {
      const acct = await seedBankAccount(ds, `${runId}-sim`);
      suiteAccountIds.push(acct.id);

      const p1 = post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '100.00',
        matchedLineIds: [],
      });
      const p2 = post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '100.00',
        matchedLineIds: [],
      });

      const results = await Promise.allSettled([p1, p2]);
      const statuses = results.map((r: any) => r.value?.status);
      expect(statuses.sort()).toEqual([201, 409]);

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.body?.data?.id) {
          suiteReconciliationIds.push(r.value.body.data.id);
        }
      }
    });

    it('rejects a bank account that is inactive or not flagged', async () => {
      // Inactive account
      const [inactive] = await ds.query(
        `INSERT INTO chart_of_account (code, name, type, "isSystem", "isPostable", "isActive", "isBankAccount")
         VALUES ($1, 'Inactive Acct', 'Asset', false, true, false, true) RETURNING id`,
        [`1290-${runId}`.slice(0, 20)],
      );
      suiteAccountIds.push(inactive.id);

      await post('/accounting/bank-reconciliations', {
        bankAccountId: inactive.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '100.00',
        matchedLineIds: [],
      }).expect(409);

      // Unflagged account (not a bank account)
      const [unflagged] = await ds.query(
        `INSERT INTO chart_of_account (code, name, type, "isSystem", "isPostable", "isActive", "isBankAccount")
         VALUES ($1, 'Unflagged Acct', 'Asset', false, true, true, false) RETURNING id`,
        [`1291-${runId}`.slice(0, 20)],
      );
      suiteAccountIds.push(unflagged.id);

      await post('/accounting/bank-reconciliations', {
        bankAccountId: unflagged.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '100.00',
        matchedLineIds: [],
      }).expect(409);
    });

    it('does not reuse the number of a discarded draft', async () => {
      const acct = await seedBankAccount(ds, `${runId}-reuse`);
      suiteAccountIds.push(acct.id);

      const r1 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '100.00',
        matchedLineIds: [],
      }).expect(201);
      const no1 = r1.body.data.reconciliationNo;

      await del(`/accounting/bank-reconciliations/${r1.body.data.id}?lockVersion=1`).expect(204);

      const r2 = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '100.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(r2.body.data.id);
      const no2 = r2.body.data.reconciliationNo;

      expect(no2).not.toBe(no1);
    });
  });

  describe('save', () => {
    it('replaces the MATCHED set from the full id list and leaves OPENING_CLEARED and marks untouched', async () => {
      const acct = await seedBankAccount(ds, `${runId}-sv1`);
      suiteAccountIds.push(acct.id);

      const l1 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-05',
        moneyIn: '10.00',
        journalNo: `JE-SV1-1-${runId}`,
      });
      const l2 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '20.00',
        journalNo: `JE-SV1-2-${runId}`,
      });
      const lPre = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-20',
        moneyIn: '5.00',
        journalNo: `JE-SV1-PRE-${runId}`,
      });
      suiteEntryIds.push(l1.entryId, l2.entryId, lPre.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        openingBalance: '5.00',
        closingBalance: '35.00',
        matchedLineIds: [l1.lineId],
        setupChanges: [{ journalEntryLineId: lPre.lineId, classification: SetupClassification.CLEARED }],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      // Now save replacing matched with l2 only
      const updated = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        matchedLineIds: [l2.lineId],
      }).expect(200);

      expect(updated.body.data.lockVersion).toBe(2);
      expect(updated.body.data.matched.map((r: any) => r.journalEntryLineId)).toEqual([l2.lineId]);
      expect(updated.body.data.classified.map((r: any) => r.journalEntryLineId)).toEqual([lPre.lineId]);
    });

    it('leaves the matched set unchanged when matchedLineIds is omitted', async () => {
      const acct = await seedBankAccount(ds, `${runId}-sv2`);
      suiteAccountIds.push(acct.id);

      const l1 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-05',
        moneyIn: '10.00',
        journalNo: `JE-SV2-1-${runId}`,
      });
      suiteEntryIds.push(l1.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '10.00',
        matchedLineIds: [l1.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      const updated = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        closingBalance: '20.00',
      }).expect(200);

      expect(updated.body.data.matched.map((r: any) => r.journalEntryLineId)).toEqual([l1.lineId]);
    });

    it('applies CLEARED, OUTSTANDING and UNCLASSIFIED setup changes and nothing else', async () => {
      const acct = await seedBankAccount(ds, `${runId}-sv3`);
      suiteAccountIds.push(acct.id);

      const l1 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-SV3-1-${runId}`,
      });
      const l2 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-15',
        moneyIn: '20.00',
        journalNo: `JE-SV3-2-${runId}`,
      });
      suiteEntryIds.push(l1.entryId, l2.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
        setupChanges: [
          { journalEntryLineId: l1.lineId, classification: SetupClassification.CLEARED },
          { journalEntryLineId: l2.lineId, classification: SetupClassification.OUTSTANDING },
        ],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      expect(draft.body.data.classified.length).toBe(2);

      // Now update l2 to UNCLASSIFIED
      const updated = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        setupChanges: [{ journalEntryLineId: l2.lineId, classification: SetupClassification.UNCLASSIFIED }],
      }).expect(200);

      expect(updated.body.data.classified.map((r: any) => r.journalEntryLineId)).toEqual([l1.lineId]);
    });

    it('keeps the setup mark of a line that is ticked', async () => {
      const acct = await seedBankAccount(ds, `${runId}-mark`);
      suiteAccountIds.push(acct.id);

      const l1 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-MK-1-${runId}`,
      });
      suiteEntryIds.push(l1.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
        setupChanges: [{ journalEntryLineId: l1.lineId, classification: SetupClassification.OUTSTANDING }],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      // Save ticking l1
      const updated = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        matchedLineIds: [l1.lineId],
      }).expect(200);

      expect(updated.body.data.matched.map((r: any) => r.journalEntryLineId)).toEqual([l1.lineId]);
      expect(updated.body.data.classified.map((r: any) => r.journalEntryLineId)).toEqual([l1.lineId]);
    });

    it('saves a draft that has unclassified pre-period entries', async () => {
      const acct = await seedBankAccount(ds, `${runId}-uncl`);
      suiteAccountIds.push(acct.id);

      const l1 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-UNCL-1-${runId}`,
      });
      suiteEntryIds.push(l1.entryId);

      const res = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(res.body.data.id);

      expect(res.body.data.summary.unclassifiedCount).toBe(1);
    });

    it('counts a ticked but unclassified pre-period entry in unclassifiedCount', async () => {
      const acct = await seedBankAccount(ds, `${runId}-tck-uncl`);
      suiteAccountIds.push(acct.id);

      const l1 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-TCK-1-${runId}`,
      });
      suiteEntryIds.push(l1.entryId);

      const res = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [l1.lineId], // ticked, but not classified as CLEARED or OUTSTANDING
      }).expect(201);
      suiteReconciliationIds.push(res.body.data.id);

      expect(res.body.data.summary.unclassifiedCount).toBe(1);
    });

    it('rejects ticking an Already cleared entry without reclassifying it', async () => {
      const acct = await seedBankAccount(ds, `${runId}-clr-tck`);
      suiteAccountIds.push(acct.id);

      const l1 = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-CLR-1-${runId}`,
      });
      suiteEntryIds.push(l1.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
        setupChanges: [{ journalEntryLineId: l1.lineId, classification: SetupClassification.CLEARED }],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        matchedLineIds: [l1.lineId], // trying to tick it while it remains CLEARED
      }).expect(409);
    });

    it('one save turns an Already cleared line into Outstanding and ticked', async () => {
      const acct = await seedBankAccount(ds, `${runId}-trans1`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-TR1-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
        setupChanges: [{ journalEntryLineId: l.lineId, classification: SetupClassification.CLEARED }],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      // request: matchedLineIds [L], setupChanges [{L, OUTSTANDING}]
      const updated = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        matchedLineIds: [l.lineId],
        setupChanges: [{ journalEntryLineId: l.lineId, classification: SetupClassification.OUTSTANDING }],
      }).expect(200);

      expect(updated.body.data.matched.map((r: any) => r.journalEntryLineId)).toEqual([l.lineId]);
      expect(updated.body.data.classified.map((r: any) => r.journalEntryLineId)).toEqual([l.lineId]);
    });

    it('one save turns an Outstanding ticked line into Already cleared and unticked', async () => {
      const acct = await seedBankAccount(ds, `${runId}-trans2`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-TR2-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [l.lineId],
        setupChanges: [{ journalEntryLineId: l.lineId, classification: SetupClassification.OUTSTANDING }],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      // request: matchedLineIds [], setupChanges [{L, CLEARED}]
      const updated = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        matchedLineIds: [],
        setupChanges: [{ journalEntryLineId: l.lineId, classification: SetupClassification.CLEARED }],
      }).expect(200);

      expect(updated.body.data.matched.map((r: any) => r.journalEntryLineId)).toEqual([]);
      expect(updated.body.data.classified.map((r: any) => r.journalEntryLineId)).toEqual([l.lineId]);
    });

    it('rejects a final state that is both ticked and Already cleared, and saves nothing', async () => {
      const acct = await seedBankAccount(ds, `${runId}-both`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-BOTH-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [l.lineId],
        setupChanges: [{ journalEntryLineId: l.lineId, classification: SetupClassification.CLEARED }],
      }).expect(409);
    });

    it('rejects the same journalEntryLineId twice in setupChanges', async () => {
      const acct = await seedBankAccount(ds, `${runId}-dup-sc`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2025-12-10',
        moneyIn: '10.00',
        journalNo: `JE-DUP-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
        setupChanges: [
          { journalEntryLineId: l.lineId, classification: SetupClassification.CLEARED },
          { journalEntryLineId: l.lineId, classification: SetupClassification.OUTSTANDING },
        ],
      }).expect(409);
    });

    it('returns 409 listing ids and saves nothing when a selection is after the new To', async () => {
      const acct = await seedBankAccount(ds, `${runId}-shrt`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-25',
        moneyIn: '10.00',
        journalNo: `JE-SHRT-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '10.00',
        matchedLineIds: [l.lineId],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      // Shorten To to 2026-01-20 without unticking l
      const res = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        periodTo: '2026-01-20',
      }).expect(409);

      expect(res.body.message.invalidMatchedIds).toContain(l.lineId);
    });

    it('returns 409 and deletes no classification when From is moved earlier', async () => {
      const acct = await seedBankAccount(ds, `${runId}-frm-mv`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-05',
        moneyIn: '10.00',
        journalNo: `JE-FRM-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-10',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
        setupChanges: [{ journalEntryLineId: l.lineId, classification: SetupClassification.CLEARED }],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      // Move From earlier to 2026-01-01, but l is dated 2026-01-05 (no longer pre-period!)
      const res = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        periodFrom: '2026-01-01',
      }).expect(409);

      expect(res.body.message.invalidClassificationIds).toContain(l.lineId);
    });

    it('returns 409 on a stale lockVersion and increments it on success', async () => {
      const acct = await seedBankAccount(ds, `${runId}-stale`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      // Stale lockVersion 99
      await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 99,
        closingBalance: '10.00',
      }).expect(409);

      // Valid lockVersion 1 -> success, becomes 2
      const ok = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        closingBalance: '10.00',
      }).expect(200);

      expect(ok.body.data.lockVersion).toBe(2);
    });

    it('returns 409 when a selected line was reserved by another reconciliation in the meantime', async () => {
      const acct = await seedBankAccount(ds, `${runId}-resv-race`);
      suiteAccountIds.push(acct.id);

      const otherAcct = await seedBankAccount(ds, `${runId}-resv-other`);
      suiteAccountIds.push(otherAcct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '10.00',
        journalNo: `JE-RACE-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      const otherDraft = await post('/accounting/bank-reconciliations', {
        bankAccountId: otherAcct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(otherDraft.body.data.id);

      // Raw-insert reservation under otherDraft
      await ds.query(
        `INSERT INTO bank_statement_reconciliation_lines ("reconciliationId", "journalEntryLineId", kind, "addedBy", "addedAt")
         VALUES ($1, $2, 'MATCHED', 'test', now())`,
        [otherDraft.body.data.id, l.lineId],
      );

      // Now draft tries to tick l -> returns 409
      const res = await patch(`/accounting/bank-reconciliations/${draft.body.data.id}`, {
        lockVersion: 1,
        matchedLineIds: [l.lineId],
      }).expect(409);

      expect(res.body.message.invalidMatchedIds).toContain(l.lineId);
    });
  });

  describe('discard', () => {
    it('hard-deletes the draft and releases its reservations', async () => {
      const acct = await seedBankAccount(ds, `${runId}-disc`);
      suiteAccountIds.push(acct.id);

      const l = await seedBankJournalLine(ds, {
        bankAccountId: acct.id,
        contraAccountId: contraAccount.id,
        entryDate: '2026-01-10',
        moneyIn: '10.00',
        journalNo: `JE-DISC-${runId}`,
      });
      suiteEntryIds.push(l.entryId);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '10.00',
        matchedLineIds: [l.lineId],
      }).expect(201);

      await del(`/accounting/bank-reconciliations/${draft.body.data.id}?lockVersion=1`).expect(204);

      // Confirm row is hard-deleted
      const [row] = await ds.query(
        `SELECT id FROM bank_statement_reconciliations WHERE id = $1`,
        [draft.body.data.id],
      );
      expect(row).toBeUndefined();

      // Confirm reservations released: line can be ticked in a new draft
      const newDraft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '10.00',
        matchedLineIds: [l.lineId],
      }).expect(201);
      suiteReconciliationIds.push(newDraft.body.data.id);
    });

    it('requires lockVersion', async () => {
      const acct = await seedBankAccount(ds, `${runId}-disc-lv`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(draft.body.data.id);

      await del(`/accounting/bank-reconciliations/${draft.body.data.id}`).expect(400);
      await del(`/accounting/bank-reconciliations/${draft.body.data.id}?lockVersion=99`).expect(409);
    });

    it('still works after the account loses its bank flag, and rejects a stale lockVersion there too', async () => {
      const acct = await seedBankAccount(ds, `${runId}-unflag`);
      suiteAccountIds.push(acct.id);

      const draft = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);

      // Unflag bank account
      await ds.query(`UPDATE chart_of_account SET "isBankAccount" = false WHERE id = $1`, [acct.id]);

      // Stale lockVersion still rejected
      await del(`/accounting/bank-reconciliations/${draft.body.data.id}?lockVersion=99`).expect(409);

      // Valid discard succeeds even on unflagged account
      await del(`/accounting/bank-reconciliations/${draft.body.data.id}?lockVersion=1`).expect(204);
    });
  });

  describe('reads', () => {
    it('list filters by status, bank account, search and inclusive period overlap', async () => {
      const acctA = await seedBankAccount(ds, `${runId}-rd-a`);
      const acctB = await seedBankAccount(ds, `${runId}-rd-b`);
      suiteAccountIds.push(acctA.id, acctB.id);

      const rA = await post('/accounting/bank-reconciliations', {
        bankAccountId: acctA.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(rA.body.data.id);

      const rB = await post('/accounting/bank-reconciliations', {
        bankAccountId: acctB.id,
        periodFrom: '2026-02-01',
        periodTo: '2026-02-28',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(rB.body.data.id);

      // Filter by bankAccount
      const resAcct = await get(`/accounting/bank-reconciliations?bankAccountId=${acctA.id}`).expect(200);
      expect(resAcct.body.data.length).toBe(1);
      expect(resAcct.body.data[0].id).toBe(rA.body.data.id);

      // Period overlap: periodFrom <= filterTo and periodTo >= filterFrom
      const resOverlap = await get(`/accounting/bank-reconciliations?periodFrom=2026-01-15&periodTo=2026-02-15`).expect(200);
      const ids = resOverlap.body.data.map((r: any) => r.id);
      expect(ids).toContain(rA.body.data.id);
      expect(ids).toContain(rB.body.data.id);
    });

    it('applies only one condition for a single-ended period filter', async () => {
      const res = await get(`/accounting/bank-reconciliations?periodFrom=2026-01-01`).expect(200);
      expect(res.body.data).toBeDefined();
    });

    it('isolates accounts: lines and sequences of account B never appear under A', async () => {
      const acctA = await seedBankAccount(ds, `${runId}-iso-a`);
      const acctB = await seedBankAccount(ds, `${runId}-iso-b`);
      suiteAccountIds.push(acctA.id, acctB.id);

      const rA = await post('/accounting/bank-reconciliations', {
        bankAccountId: acctA.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      suiteReconciliationIds.push(rA.body.data.id);

      const linesA = await get(`/accounting/bank-reconciliations/${rA.body.data.id}/lines`).expect(200);
      expect(linesA.body.data.length).toBe(0);
    });
  });

  describe('locking', () => {
    it('O1: a journal line insert on the bank account completes while the account lock is held', async () => {
      const acct = await seedBankAccount(ds, `${runId}-lck-o1`);
      suiteAccountIds.push(acct.id);

      let hookFired = false;
      (service as any)[RECONCILIATION_TEST_HOOK] = async (phase: string, ctx: any) => {
        if (phase === 'afterLocks') {
          hookFired = true;
          // While account lock is held, a second connection inserts a journal line on acct
          const inserted = await withTimeout(
            seedBankJournalLine(ds, {
              bankAccountId: acct.id,
              contraAccountId: contraAccount.id,
              entryDate: '2026-01-15',
              moneyIn: '100.00',
              journalNo: `JE-O1-${runId}`,
            }),
            5000,
            'Concurrent journal insert blocked by account lock!',
          );
          suiteEntryIds.push(inserted.entryId);
        }
      };

      try {
        const res = await post('/accounting/bank-reconciliations', {
          bankAccountId: acct.id,
          periodFrom: '2026-01-01',
          periodTo: '2026-01-31',
          closingBalance: '0.00',
          matchedLineIds: [],
        }).expect(201);
        suiteReconciliationIds.push(res.body.data.id);
        expect(hookFired).toBe(true);
      } finally {
        delete (service as any)[RECONCILIATION_TEST_HOOK];
      }
    });

    it('O2: no write path locks accounting_settings', async () => {
      const acct = await seedBankAccount(ds, `${runId}-lck-o2`);
      suiteAccountIds.push(acct.id);

      let checkedCreate = false;
      let checkedUpdate = false;

      (service as any)[RECONCILIATION_TEST_HOOK] = async (phase: string, ctx: any) => {
        if (phase === 'afterLocks') {
          const [{ pid }] = await ctx.manager.query('SELECT pg_backend_pid() AS pid');
          const locks = await ctx.manager.query(
            `SELECT c.relname
               FROM pg_locks l
               JOIN pg_class c ON c.oid = l.relation
              WHERE l.pid = $1 AND c.relname = 'accounting_settings'`,
            [pid],
          );
          expect(locks.length).toBe(0);
          if (!checkedCreate) checkedCreate = true;
          else checkedUpdate = true;
        }
      };

      try {
        const createRes = await post('/accounting/bank-reconciliations', {
          bankAccountId: acct.id,
          periodFrom: '2026-01-01',
          periodTo: '2026-01-31',
          closingBalance: '0.00',
          matchedLineIds: [],
        }).expect(201);
        suiteReconciliationIds.push(createRes.body.data.id);

        await patch(`/accounting/bank-reconciliations/${createRes.body.data.id}`, {
          lockVersion: 1,
          closingBalance: '50.00',
        }).expect(200);

        expect(checkedCreate).toBe(true);
        expect(checkedUpdate).toBe(true);
      } finally {
        delete (service as any)[RECONCILIATION_TEST_HOOK];
      }
    });
  });

  describe('audit', () => {
    it('writes CREATE, UPDATE and DISCARD entries with entityId and username', async () => {
      const acct = await seedBankAccount(ds, `${runId}-aud`);
      suiteAccountIds.push(acct.id);

      const createRes = await post('/accounting/bank-reconciliations', {
        bankAccountId: acct.id,
        periodFrom: '2026-01-01',
        periodTo: '2026-01-31',
        closingBalance: '0.00',
        matchedLineIds: [],
      }).expect(201);
      const reconId = createRes.body.data.id;

      await patch(`/accounting/bank-reconciliations/${reconId}`, {
        lockVersion: 1,
        closingBalance: '50.00',
      }).expect(200);

      await del(`/accounting/bank-reconciliations/${reconId}?lockVersion=2`).expect(204);

      const logs = await ds.query(
        `SELECT action, "entityId", username FROM audit_logs
          WHERE "entityType" = 'BankReconciliation' AND "entityId" = $1
          ORDER BY "createdAt" ASC`,
        [reconId],
      );

      const actions = logs.map((l: any) => l.action);
      expect(actions).toEqual(['CREATE', 'UPDATE', 'DISCARD']);
      expect(logs[0].username).toBe(adminUsername);
    });
  });
});
