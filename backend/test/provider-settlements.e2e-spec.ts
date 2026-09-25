import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { seedCategory, seedProduct } from './e2e/helpers/seed';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import {
  E2E_ADMIN_PASSWORD,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';
import {
  cents,
  journalLinesFor,
  methodIdByCode,
  accountIdByCode,
} from './utils/payment-method-matrix-fixture';
import { ProviderSettlementService } from '../src/modules/provider-settlements/services/provider-settlement.service';
import { SETTLEMENT_TEST_HOOK } from '../src/modules/provider-settlements/services/provider-settlement.test-hooks';

/** Race a promise against a timer, and ALWAYS clear the timer. */
async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${what}`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const runId = randomUUID().slice(0, 8);

describe('Provider settlements (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token = '';
  let post: (path: string, body?: any) => request.Test;
  let get: (path: string) => request.Test;
  let put: (path: string, body?: any) => request.Test;

  let adminUserId = '';
  let adminUsername = '';
  let customerId = '';
  let productId = '';
  let categoryId = '';
  let atomeMethodId = '';
  let tiktokMethodId = '';
  let cimbMethodId = '';
  let clearingAccountId = '';
  let bankAccountId = '';

  const ownedEntityIds: string[] = [];
  const ownedRefs: string[] = [];
  const ownedSalesOrderIds: string[] = [];
  const ownedSettlementIds: string[] = [];
  // Chart accounts this suite creates. Deleted LAST: journal lines reference them (FK).
  const ownedAccountIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);

    const category = await seedCategory(ds, `ps-e2e-${runId}`);
    categoryId = category.id;
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 500,
      baseCost: 10,
    });
    productId = product.id;
    ownedEntityIds.push(productId, categoryId);

    adminUsername = `e2espec_ps_admin_${runId}`;
    const admin = await seedSuiteAdmin(ds, adminUsername);
    adminUserId = admin.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ usernameOrEmail: adminUsername, password: E2E_ADMIN_PASSWORD });
    token = loginRes.body?.data?.accessToken ?? loginRes.body?.accessToken;
    expect(token).toBeTruthy();

    const server = app.getHttpServer();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    post = (path: string, body: any = {}) =>
      auth(request(server).post(path).send(body));
    get = (path: string) => auth(request(server).get(path));
    put = (path: string, body: any = {}) =>
      auth(request(server).put(path).send(body));

    // BASELINE rows, shared with every other suite in a size-ordered run
    // against one database. Read them; never mutate or delete them.
    atomeMethodId = await methodIdByCode(ds, 'ATOME');
    tiktokMethodId = await methodIdByCode(ds, 'TIKTOK');
    // CIMB is mapped straight to the 1200 bank account (1789658118888), so its
    // payments already debit the account this suite settles into.
    cimbMethodId = await methodIdByCode(ds, 'CIMB');
    clearingAccountId = await accountIdByCode(ds, '1240');
    bankAccountId = await accountIdByCode(ds, '1200');

    const customerRes = await post('/customers', {
      type: 'business',
      name: `PS Customer ${runId}`,
    }).expect(201);
    customerId = (customerRes.body.data ?? customerRes.body).id;
    ownedEntityIds.push(customerId);
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        // Settlements first: provider_settlement_lines FK sales_order_payments
        // ON DELETE RESTRICT, so payments cannot go while claims reference them.
        if (ownedSettlementIds.length) {
          await ds.query(
            `DELETE FROM provider_settlement_lines WHERE "settlementId" = ANY($1)`,
            [ownedSettlementIds],
          );
          await ds.query(
            `DELETE FROM provider_settlements WHERE id = ANY($1)`,
            [ownedSettlementIds],
          );
        }
        if (ownedRefs.length) {
          await ds.query(
            `DELETE FROM journal_entry_line WHERE "entryId" IN (SELECT id FROM journal_entry WHERE "sourceRef" = ANY($1))`,
            [ownedRefs],
          );
          await ds.query(`DELETE FROM journal_entry WHERE "sourceRef" = ANY($1)`, [
            ownedRefs,
          ]);
        }
        if (ownedSalesOrderIds.length) {
          await ds.query(
            `DELETE FROM sales_order_payments WHERE "salesOrderId" = ANY($1)`,
            [ownedSalesOrderIds],
          );
          await ds.query(
            `DELETE FROM sales_order_items WHERE "salesOrderId" = ANY($1)`,
            [ownedSalesOrderIds],
          );
          await ds.query(`DELETE FROM sales_orders WHERE id = ANY($1)`, [
            ownedSalesOrderIds,
          ]);
        }
        await ds.query(`DELETE FROM products WHERE id = $1`, [productId]);
        await ds.query(`DELETE FROM categories WHERE id = $1`, [categoryId]);
        await ds.query(`DELETE FROM customers WHERE id = $1`, [customerId]);
        if (ownedAccountIds.length) {
          await ds.query(`DELETE FROM chart_of_account WHERE id = ANY($1)`, [ownedAccountIds]);
        }

        // Request exhaust: every HTTP call writes audit_logs rows. Scoped to
        // ids this suite owns — never a bare username = 'admin', which is shared.
        await removeSuiteTraces(ds, {
          userIds: [adminUserId],
          entityIds: [
            ...ownedEntityIds,
            ...ownedSettlementIds,
            ...ownedSalesOrderIds,
          ],
        });
        await removeSuiteAdmin(ds, adminUsername);
      }
    } finally {
      await app.close();
    }
  });

  /**
   * Record a payment against an EXISTING order. Returns the PAYMENT row id.
   *
   * Two contracts that are easy to get wrong, both verified against the code:
   *
   * - POST /sales-orders/:id/payments returns **200**, not 201
   *   (@HttpCode(HttpStatus.OK), sales-order.controller.ts:164), and its body
   *   is the **SALES ORDER**, not the new payment
   *   (recordPayment returns findById(orderId), sales-order.service.ts:745-753).
   *   So `res.body.data.id` is the ORDER id. The payment row must be read back
   *   separately — reading it from the payment response yields an order id that
   *   silently fails eligibility later, with no obvious cause.
   */
  async function payExisting(
    orderId: string, amount: string, methodId = atomeMethodId, paymentDate = '2026-09-01',
    referenceNumber?: string,
  ): Promise<string> {
    await post(`/sales-orders/${orderId}/payments`, {
      amount, paymentMethodId: methodId, paymentDate,
      ...(referenceNumber ? { referenceNumber } : {}),
    }).expect(200);
    const [row] = await ds.query(
      `SELECT id FROM sales_order_payments
        WHERE "salesOrderId" = $1 AND amount > 0
        ORDER BY "createdAt" DESC, id DESC LIMIT 1`,
      [orderId],
    );
    expect(row?.id).toBeTruthy();
    return row.id;
  }

  async function newOrder(amount: string): Promise<{ orderId: string; orderNumber: string }> {
    const res = await post('/sales-orders', {
      customerId,
      items: [{ productId, quantity: 1, unitPrice: amount }],
    }).expect(201);
    const order = res.body.data ?? res.body;
    ownedSalesOrderIds.push(order.id);
    ownedRefs.push(order.orderNumber);
    ownedEntityIds.push(order.id);
    return { orderId: order.id, orderNumber: order.orderNumber };
  }

  async function payOrder(amount: string, methodId = atomeMethodId) {
    const { orderId, orderNumber } = await newOrder(amount);
    const paymentId = await payExisting(orderId, amount, methodId);
    return { orderId, orderNumber, paymentId };
  }

  /**
   * POST /sales-orders/:id/refunds takes **{ refunds: [...] }**, returns
   * **201** (no @HttpCode override, sales-order.controller.ts:191), and returns
   * an **array** — it is a batch endpoint.
   */
  async function refundOrder(
    orderId: string, amount: string, methodId = atomeMethodId, paymentDate = '2026-09-02',
    referenceNumber?: string,
  ): Promise<string> {
    await post(`/sales-orders/${orderId}/refunds`, {
      refunds: [{ amount, paymentMethodId: methodId, paymentDate, ...(referenceNumber ? { referenceNumber } : {}) }],
    }).expect(201);

    const [row] = await ds.query(
      `SELECT id FROM sales_order_payments
        WHERE "salesOrderId" = $1 AND amount < 0
        ORDER BY "createdAt" DESC, id DESC LIMIT 1`,
      [orderId],
    );
    expect(row?.id).toBeTruthy();
    return row.id;
  }

  async function rowsFor(orderIds: string[], extra = '', settlementDate = '2026-09-20') {
    const res = await get(
      `/accounting/provider-settlements/eligible-rows?settlementDate=${settlementDate}&salesOrderIds=${orderIds.join(',')}${extra}`,
    ).expect(200);
    return res.body.data as any[];
  }

  function draftBody(
    rows: Array<{ salesOrderId: string; paymentMethodId?: string; expectedNetAmount: string }>,
    settlementAmount: string,
    settlementDate = '2026-09-20',
  ) {
    return {
      bankAccountId, settlementDate, providerReference: `ATM-${runId}`, settlementAmount,
      rows: rows.map((r) => ({ paymentMethodId: atomeMethodId, ...r })),
    };
  }

  async function createDraft(rows: Parameters<typeof draftBody>[0], amount: string, settlementDate?: string) {
    const res = await post('/accounting/provider-settlements', draftBody(rows, amount, settlementDate));
    if (res.status === 201) ownedSettlementIds.push((res.body.data ?? res.body).id);
    return res;
  }

  async function countJournalEntries(): Promise<number> {
    const [row] = await ds.query(
      'SELECT count(*)::int AS count FROM journal_entry',
    );
    return row.count;
  }

  /**
   * Start a request NOW (supertest is lazy) and keep both handles.
   *
   * A settlement create registers its id for afterAll cleanup THE MOMENT its
   * response arrives — inside `done` itself, not after the test's assertions.
   * A request that commits while a failing test is draining would otherwise
   * leave a settlement no cleanup knows about.
   */
  function start(req: request.Test, opts: { createsSettlement?: boolean } = {}) {
    const done = req.then((r) => {
      if (opts.createsSettlement && r.status === 201) {
        ownedSettlementIds.push((r.body.data ?? r.body).id);
      }
      return r;
    }) as Promise<request.Response>;
    return { req, done };
  }

  /**
   * Cleanup for a concurrency test: wait (bounded) for every request the test
   * STARTED, whether or not its assertions ran. On timeout, abort the HTTP
   * requests, cancel the backend sessions, and then VERIFY those sessions have
   * left their transactions before teardown proceeds — a cancelled statement can
   * leave its session `idle in transaction (aborted)` still holding locks.
   * Sessions still in a transaction after a bounded wait are terminated, and the
   * wait is repeated; if one survives even that, drain fails loudly.
   */
  async function drain(
    started: Array<{ req: request.Test; done: Promise<unknown> }>,
    pids: Array<number | undefined>,
  ): Promise<void> {
    try {
      await withTimeout(Promise.allSettled(started.map((s) => s.done)), 15_000, 'draining started requests');
      return;
    } catch (err) {
      for (const s of started) s.req.abort();
      const live = pids.filter((p): p is number => p !== undefined);
      for (const pid of live) await ds.query('SELECT pg_cancel_backend($1)', [pid]);
      if (!(await sessionsLeftTransactions(live, 5_000))) {
        for (const pid of live) await ds.query('SELECT pg_terminate_backend($1)', [pid]);
        if (!(await sessionsLeftTransactions(live, 5_000))) {
          throw new Error(`sessions ${live.join(', ')} still in a transaction after cancel + terminate`);
        }
      }
      // Late responses that arrived during cancellation have registered
      // themselves through start(); settle them so none is still in flight.
      await Promise.allSettled(started.map((s) => s.done));
      throw err;
    }
  }

  /** True once none of `pids` is inside a transaction (gone, or idle outside one). */
  async function sessionsLeftTransactions(pids: number[], ms: number): Promise<boolean> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const [{ n }] = await ds.query(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE pid = ANY($1::int[]) AND (xact_start IS NOT NULL OR state <> 'idle')`,
        [pids],
      );
      if (n === 0) return true;
      await pause(100);
    }
    return false;
  }

  it('posts exactly Dr bank / Cr clearing with no fee line', async () => {
    const { orderId } = await payOrder('98.00');
    const draft = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '98.00' }], '98.00');
    expect(draft.status).toBe(201);
    const id = (draft.body.data ?? draft.body).id;

    const posted = await post(
      `/accounting/provider-settlements/${id}/post`,
    ).expect(201);
    const settlement = posted.body.data ?? posted.body;
    expect(settlement.status).toBe('POSTED');
    ownedRefs.push(settlement.referenceNumber);

    const lines = await journalLinesFor(ds, settlement.referenceNumber);
    expect(lines).toHaveLength(2); // never a provider-fee line

    const debit = lines.filter((l) => cents(l.debit) > 0);
    const credit = lines.filter((l) => cents(l.credit) > 0);
    expect(debit).toHaveLength(1);
    expect(credit).toHaveLength(1);
    expect(debit[0].accountId).toBe(bankAccountId);
    expect(cents(debit[0].debit)).toBe(cents('98.00'));
    expect(credit[0].accountId).toBe(clearingAccountId);
    expect(cents(credit[0].credit)).toBe(cents('98.00'));

    // Balanced in integer cents. cents() THROWS on a sub-cent residue rather
    // than rounding it into a pass.
    const debits = lines.reduce((n, l) => n + cents(l.debit), 0);
    const credits = lines.reduce((n, l) => n + cents(l.credit), 0);
    expect(debits).toBe(credits);
  });

  it('rejects a duplicate claim without creating journal data', async () => {
    const { orderId } = await payOrder('50.00');
    expect((await createDraft([{ salesOrderId: orderId, expectedNetAmount: '50.00' }], '50.00')).status).toBe(201);

    const before = await countJournalEntries();
    const second = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '50.00' }], '50.00');
    expect(second.status).toBe(409);
    // The filter preserves `message` verbatim when it is an object, so the
    // machine-readable rows ride INSIDE it (see Task 5). A claimed group is
    // now reported as a stale row with no current net.
    expect(second.body.message.staleRows[0]).toEqual({
      salesOrderId: orderId,
      paymentMethodId: atomeMethodId,
      currentNetAmount: null,
    });
    expect(await countJournalEntries()).toBe(before);
  });

  it('reverses without mutating the original entry, and releases the claims', async () => {
    const { orderId } = await payOrder('70.00');
    const draft = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '70.00' }], '70.00');
    const id = (draft.body.data ?? draft.body).id;
    const posted = await post(
      `/accounting/provider-settlements/${id}/post`,
    ).expect(201);
    const settlement = posted.body.data ?? posted.body;
    ownedRefs.push(settlement.referenceNumber);

    const originalLines = await ds.query(
      'SELECT "accountId", debit, credit FROM journal_entry_line WHERE "entryId" = $1 ORDER BY id',
      [settlement.journalEntryId],
    );

    const reversed = await post(
      `/accounting/provider-settlements/${id}/reverse`,
    ).expect(201);
    const after = reversed.body.data ?? reversed.body;
    expect(after.status).toBe('REVERSED');

    // Original preserved byte-for-byte.
    const afterLines = await ds.query(
      'SELECT "accountId", debit, credit FROM journal_entry_line WHERE "entryId" = $1 ORDER BY id',
      [settlement.journalEntryId],
    );
    expect(afterLines).toEqual(originalLines);

    const [rev] = await ds.query(
      'SELECT "reversalOfEntryId" FROM journal_entry WHERE id = $1',
      [after.reversalJournalEntryId],
    );
    expect(rev.reversalOfEntryId).toBe(settlement.journalEntryId);

    const released = await ds.query(
      'SELECT "releasedAt" FROM provider_settlement_lines WHERE "settlementId" = $1',
      [id],
    );
    expect(released.length).toBeGreaterThan(0);
    expect(released.every((l: any) => l.releasedAt !== null)).toBe(true);
  });

  it('re-settles a payment released by a reversal', async () => {
    const { orderId } = await payOrder('60.00');
    const first = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '60.00' }], '60.00');
    const firstId = (first.body.data ?? first.body).id;
    const posted = await post(
      `/accounting/provider-settlements/${firstId}/post`,
    ).expect(201);
    ownedRefs.push((posted.body.data ?? posted.body).referenceNumber);
    await post(`/accounting/provider-settlements/${firstId}/reverse`).expect(
      201,
    );

    // The released claim must no longer block a corrective settlement. This is
    // the proof that releasedAt (not a soft delete) actually frees the row.
    const second = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '60.00' }], '60.00');
    expect(second.status).toBe(201);
    const secondPosted = await post(
      `/accounting/provider-settlements/${(second.body.data ?? second.body).id}/post`,
    ).expect(201);
    ownedRefs.push(
      (secondPosted.body.data ?? secondPosted.body).referenceNumber,
    );
  });

  it('rejects a non-postable bank account', async () => {
    const { orderId } = await payOrder('30.00');
    const [parent] = await ds.query(
      `SELECT id FROM chart_of_account WHERE "isPostable" = false AND "isActive" = true LIMIT 1`,
    );
    expect(parent).toBeDefined();

    const res = await post('/accounting/provider-settlements', {
      ...draftBody([{ salesOrderId: orderId, expectedNetAmount: '30.00' }], '30.00'),
      bankAccountId: parent.id,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toMatch(/not postable/);
  });

  it('rejects an unbalanced settlement before any state change', async () => {
    const { orderId } = await payOrder('40.00');
    const countSettlements = async () => {
      const [row] = await ds.query(
        'SELECT count(*)::int AS count FROM provider_settlements',
      );
      return row.count;
    };
    const before = await countJournalEntries();
    const settlementsBefore = await countSettlements();

    const draft = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '40.00' }], '40.01');
    expect(draft.status).toBe(400);
    expect(JSON.stringify(draft.body.message)).toMatch(/does not equal the selected total/);
    expect(await countJournalEntries()).toBe(before);
    expect(await countSettlements()).toBe(settlementsBefore);
  });

  it('reconciles a batch mixing a payment and a refund', async () => {
    const { orderId } = await payOrder('98.00');
    await refundOrder(orderId, '50.00');

    // 98.00 + (-50.00) = 48.00
    const draft = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '48.00' }], '48.00');
    expect(draft.status).toBe(201);
    const id = (draft.body.data ?? draft.body).id;

    // Saving the group writes BOTH underlying payments as lines.
    const detail = await get(`/accounting/provider-settlements/${id}`).expect(200);
    expect(detail.body.data.lines).toHaveLength(2);

    const posted = await post(
      `/accounting/provider-settlements/${id}/post`,
    ).expect(201);
    const settlement = posted.body.data ?? posted.body;
    ownedRefs.push(settlement.referenceNumber);

    const lines = await journalLinesFor(ds, settlement.referenceNumber);
    expect(lines).toHaveLength(2);
    expect(cents(lines.find((l) => cents(l.debit) > 0)!.debit)).toBe(
      cents('48.00'),
    );
  });

  it('serves the read surface: filtered list, joined detail, branched eligibility', async () => {
    const { orderId: claimedOrderId } = await payOrder('21.00');
    const draft = await createDraft([{ salesOrderId: claimedOrderId, expectedNetAmount: '21.00' }], '21.00');
    expect(draft.status).toBe(201);
    const id = (draft.body.data ?? draft.body).id;

    // List: the new draft is visible under its provider + status filter.
    const list = await get(
      `/accounting/provider-settlements?providerPaymentMethodId=${atomeMethodId}&status=DRAFT`,
    ).expect(200);
    expect(list.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(list.body.data.map((s: any) => s.id)).toContain(id);

    // Paginated list: page/limit is a DIFFERENT query than the branch above.
    // TypeORM switches to its distinct-id strategy when skip/take meets joined
    // relations, projecting every ordering term into a `distinctAlias`
    // subquery. A pre-quoted ordering expression (`s."settlementDate"`) is
    // escaped verbatim there and emits a column that does not exist, so the
    // unpaginated getMany() branch above passes while the real list page 500s
    // (#1265). A second settlement on a LATER date makes the descending order
    // assertion below falsifiable rather than vacuous.
    const { orderId: secondOrderId } = await payOrder('23.00');
    const secondDraft = await createDraft([{ salesOrderId: secondOrderId, expectedNetAmount: '23.00' }], '23.00', '2026-09-21');
    expect(secondDraft.status).toBe(201);
    const secondId = (secondDraft.body.data ?? secondDraft.body).id;

    const paged = await get(
      `/accounting/provider-settlements?providerPaymentMethodId=${atomeMethodId}&status=DRAFT&page=1&limit=25`,
    ).expect(200);
    expect(paged.body.meta.page).toBe(1);
    expect(paged.body.meta.limit).toBe(25);
    expect(paged.body.meta.total).toBeGreaterThanOrEqual(2);

    // Both owned rows come back, and the later date sorts first. Compare the
    // two rows we own by index rather than asserting on the whole page, which
    // this suite shares with rows it does not own.
    const pagedIds: string[] = paged.body.data.map((s: any) => s.id);
    expect(pagedIds).toContain(id);
    expect(pagedIds).toContain(secondId);
    expect(pagedIds.indexOf(secondId)).toBeLessThan(pagedIds.indexOf(id));

    // Joined relations survive the distinct-id pagination strategy.
    const pagedSecond = paged.body.data.find((s: any) => s.id === secondId);
    expect(pagedSecond.providerPaymentMethod?.id).toBe(atomeMethodId);
    expect(pagedSecond.bankAccount?.code).toBe('1200');

    // Detail: the joined relations are hydrated, not left as bare ids. The
    // clearing account is DERIVED from the payment's journal history (1240),
    // distinct from the manually chosen bank account (1200).
    const detail = await get(`/accounting/provider-settlements/${id}`).expect(200);
    expect(detail.body.data.lines).toHaveLength(1);
    expect(detail.body.data.clearingAccount.code).toBe('1240');
    expect(detail.body.data.bankAccount.code).toBe('1200');
    expect(detail.body.data.providerPaymentMethod.name).toBeTruthy();

    // Each line carries its payment's order + method labels for the grouped
    // detail view. `amount` stays the line SNAPSHOT, never the live row.
    const line0 = detail.body.data.lines[0];
    expect(line0.salesOrderPayment.salesOrder.orderNumber).toBeTruthy();
    expect(line0.salesOrderPayment.paymentMethod.name).toBeTruthy();
    expect(line0.amount).toBe('21.0000'); // snapshot, not the live row

    // Eligibility: a second unclaimed payment appears while the claimed one is
    // excluded — the no-settlementId branch of the claim predicate over real rows.
    const { orderId: unclaimedOrderId } = await payOrder('22.00');
    const rows = await rowsFor([unclaimedOrderId, claimedOrderId]);
    expect(rows.map((r: any) => r.salesOrderId)).toEqual([unclaimedOrderId]);
  });

  /**
   * #1273: prove a settlement's referenceNumber derives from the CONFIGURED
   * Provider Settlements row, not from a hard-coded 'PS'.
   *
   * Asserting against whatever the row already holds would be far weaker — the
   * default prefix IS 'PS', so a hard-coded generator would pass. Writing a
   * distinctive prefix and asserting the output follows it is what makes the
   * setting demonstrably load-bearing; editing the prefix a second time and
   * watching the sequence continue is what rules out a coincidence.
   *
   * SHARED STATE. document_number_settings holds ONE global row per document
   * type, and e2e suites share a database. jest-e2e.json pins maxWorkers: 1 and
   * this is the only suite touching provider settlements, so the mutation is
   * safe within a run — but not across processes sharing the database. The
   * restore is therefore `finally`-guarded, and rewrites all four fields this
   * test disturbs. A hard interrupt between mutation and restore still leaves
   * the row drifted.
   */
  it('derives referenceNumber from the configured Provider Settlements row', async () => {
    const DOC = 'Provider Settlements';

    const [original] = await ds.query(
      `SELECT prefix, "nextNumber", "paddingDigits", "lastResetYear"
         FROM document_number_settings WHERE "documentName" = $1`,
      [DOC],
    );
    // generateDocumentNumber throws NotFoundException on a missing row rather
    // than creating a default, so assert here for a clear setup failure
    // instead of an opaque 500 out of the create below.
    expect(original).toBeTruthy();

    // lastResetYear is written EXPLICITLY to the current YY, never carried over
    // from `original`: a stale saved value makes the generator take its reset
    // branch, which overwrites nextNumber with 1 and would fail the sequence
    // assertion for a reason unrelated to what this test covers.
    const currentYY = new Date().getFullYear() % 100;
    const yy = String(currentYY).padStart(2, '0');
    const firstPrefix = `ZPSA${runId.slice(0, 4)}`.toUpperCase();
    const secondPrefix = `ZPSB${runId.slice(0, 4)}`.toUpperCase();

    async function configure(prefix: string, nextNumber: number) {
      await ds.query(
        `UPDATE document_number_settings
            SET prefix = $1, "nextNumber" = $2, "paddingDigits" = $3, "lastResetYear" = $4
          WHERE "documentName" = $5`,
        [prefix, nextNumber, 4, currentYY, DOC],
      );
    }

    // try OPENS BEFORE the first mutation: a failure inside configure() must
    // still reach the restore.
    try {
      await configure(firstPrefix, 700);

      const { orderId: firstOrderId } = await payOrder('31.00');
      const first = await createDraft([{ salesOrderId: firstOrderId, expectedNetAmount: '31.00' }], '31.00');
      expect(first.status).toBe(201);
      const firstRef = (first.body.data ?? first.body).referenceNumber;
      ownedRefs.push(firstRef);

      // Expectation is computed from the values this test WROTE, independently
      // of the generator's own formatting inputs.
      expect(firstRef).toBe(`${firstPrefix}-${yy}-0700`);

      // ONLY the prefix changes here. Rewriting nextNumber to 701 would write
      // the very number the next creation is asserted to produce, masking a
      // wrong (or absent) increment from the first creation — the second draft
      // must read whatever the first one actually left behind.
      //
      // Second settlement also needs its OWN payment: reusing the first hits
      // the duplicate-claim 409 that this suite already covers above.
      await ds.query(
        `UPDATE document_number_settings SET prefix = $1 WHERE "documentName" = $2`,
        [secondPrefix, DOC],
      );

      const { orderId: secondOrderId } = await payOrder('32.00');
      const second = await createDraft([{ salesOrderId: secondOrderId, expectedNetAmount: '32.00' }], '32.00');
      expect(second.status).toBe(201);
      const secondRef = (second.body.data ?? second.body).referenceNumber;
      ownedRefs.push(secondRef);

      expect(secondRef).toBe(`${secondPrefix}-${yy}-0701`);

      // 0701 above already proves the first creation advanced the sequence
      // (nothing rewrote it in between). This proves the second did too, so
      // the row is written as well as read.
      const [after] = await ds.query(
        `SELECT "nextNumber" FROM document_number_settings WHERE "documentName" = $1`,
        [DOC],
      );
      expect(after.nextNumber).toBe(702);
    } finally {
      await ds.query(
        `UPDATE document_number_settings
            SET prefix = $1, "nextNumber" = $2, "paddingDigits" = $3, "lastResetYear" = $4
          WHERE "documentName" = $5`,
        [
          original.prefix,
          original.nextNumber,
          original.paddingDigits,
          original.lastResetYear,
          DOC,
        ],
      );
    }
  });

  describe('eligible-rows (#1284)', () => {
    afterEach(() => { delete (app.get(ProviderSettlementService) as any)[SETTLEMENT_TEST_HOOK]; });

    async function insertDraft(
      methodId: string,
      lines: Array<{ paymentId: string; amount: string }>,
      amount: string,
    ) {
      const [s] = await ds.query(
        `INSERT INTO provider_settlements
           ("referenceNumber", "providerPaymentMethodId", "clearingAccountId", "bankAccountId",
            "settlementDate", "settlementAmount", status)
         VALUES ($1, $2, $3, $4, '2026-09-20', $5, 'DRAFT') RETURNING id`,
        [
          `PS-T-${randomUUID().slice(0, 8)}`,
          methodId,
          clearingAccountId,
          bankAccountId,
          amount,
        ],
      );
      ownedSettlementIds.push(s.id);
      for (const l of lines) {
        await ds.query(
          `INSERT INTO provider_settlement_lines ("settlementId", "salesOrderPaymentId", amount)
           VALUES ($1, $2, $3)`,
          [s.id, l.paymentId, l.amount],
        );
      }
      return s.id as string;
    }

    async function claimed(settlementId: string) {
      const res = await get(
        `/accounting/provider-settlements/eligible-rows?scope=claimed&settlementId=${settlementId}&settlementDate=2026-09-20`,
      ).expect(200);
      return res.body.data as any[];
    }

    async function putMapping(methodId: string, accountId: string | null) {
      await put('/accounting/settings/payment-method-mappings', {
        mappings: [{ paymentMethodId: methodId, accountId }],
      }).expect(200);
    }

    /** Remap `methodId` to account `code` for the duration of `fn`, then restore. */
    async function withMethodMappedTo(
      methodId: string,
      code: string,
      fn: () => Promise<void>,
    ) {
      const [current] = await ds.query(
        `SELECT "accountId" FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
        [methodId],
      );
      await putMapping(methodId, await accountIdByCode(ds, code));
      try {
        await fn();
      } finally {
        await putMapping(methodId, current?.accountId ?? null);
      }
    }

    async function withCimbMappedTo(code: string, fn: () => Promise<void>) {
      await withMethodMappedTo(cimbMethodId, code, fn);
    }

    it('SO-26-008: Atome paid and refunded, TikTok paid ⇒ only the TikTok row', async () => {
      const { orderId, orderNumber } = await newOrder('130.00');
      await payExisting(orderId, '130.00', atomeMethodId);
      await refundOrder(orderId, '130.00', atomeMethodId);
      const tiktokPaymentId = await payExisting(orderId, '130.00', tiktokMethodId, '2026-09-03');

      const rows = await rowsFor([orderId]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        salesOrderId: orderId, orderNumber, paymentMethodId: tiktokMethodId, netAmount: '130.0000',
      });
      expect(rows[0].payments.map((p: any) => p.id)).toEqual([tiktokPaymentId]);
    });

    it('partial refund leaves the remaining net, with both payments traceable', async () => {
      const { orderId } = await newOrder('100.00');
      const pay = await payExisting(orderId, '100.00', tiktokMethodId);
      const refund = await refundOrder(orderId, '30.00', tiktokMethodId);
      const [row] = await rowsFor([orderId]);
      expect(row.netAmount).toBe('70.0000');
      expect(row.payments.map((p: any) => p.id).sort()).toEqual([pay, refund].sort());
    });

    it('date cutoff splits a group', async () => {
      const { orderId } = await newOrder('100.00');
      await payExisting(orderId, '100.00', tiktokMethodId, '2026-09-01');
      await refundOrder(orderId, '30.00', tiktokMethodId, '2026-09-25');
      expect((await rowsFor([orderId], '', '2026-09-20'))[0].netAmount).toBe('100.0000');
      expect((await rowsFor([orderId], '', '2026-09-30'))[0].netAmount).toBe('70.0000');
    });

    it('search matches whole groups: matching +100 with non-matching −30 stays 70', async () => {
      const tag = `SRCH-${runId}`;
      const { orderId } = await newOrder('100.00');
      await payExisting(orderId, '100.00', tiktokMethodId, '2026-09-01', tag);
      await refundOrder(orderId, '30.00', tiktokMethodId, '2026-09-02', `OTHER-${runId}`);

      const res = await get(
        `/accounting/provider-settlements/eligible-rows?settlementDate=2026-09-20&search=${tag}`,
      ).expect(200);
      const row = res.body.data.find((r: any) => r.salesOrderId === orderId);
      expect(row.netAmount).toBe('70.0000');
      expect(row.payments).toHaveLength(2);

      const none = await get(
        `/accounting/provider-settlements/eligible-rows?settlementDate=2026-09-20&search=NOPE-${runId}`,
      ).expect(200);
      expect(none.body.data.find((r: any) => r.salesOrderId === orderId)).toBeUndefined();
    });

    it('paginates by group, each page row carrying all of its payments', async () => {
      const tag = `PAGE-${runId}`;
      const a = await newOrder('10.00');
      await payExisting(a.orderId, '10.00', tiktokMethodId, '2026-09-01', tag);
      await refundOrder(a.orderId, '4.00', tiktokMethodId, '2026-09-02', tag);
      const b = await newOrder('20.00');
      await payExisting(b.orderId, '20.00', tiktokMethodId, '2026-09-01', tag);

      const res = await get(
        `/accounting/provider-settlements/eligible-rows?settlementDate=2026-09-20&search=${tag}&page=1&limit=1`,
      ).expect(200);
      expect(res.body.meta).toMatchObject({ total: 2, page: 1, limit: 1 });
      expect(res.body.data).toHaveLength(1);
      const first = res.body.data[0];
      const expectedCount = first.salesOrderId === a.orderId ? 2 : 1;
      expect(first.payments).toHaveLength(expectedCount);
    });

    it('hides a fully refunded group', async () => {
      const { orderId } = await newOrder('50.00');
      await payExisting(orderId, '50.00', tiktokMethodId);
      await refundOrder(orderId, '50.00', tiktokMethodId);
      expect(await rowsFor([orderId])).toEqual([]);
    });

    it('claimed: an untouched group is current', async () => {
      const { orderId, paymentId } = await payOrder('40.00', atomeMethodId);
      const id = await insertDraft(
        atomeMethodId,
        [{ paymentId, amount: '40.0000' }],
        '40.0000',
      );
      const [row] = await claimed(id);
      expect(row).toMatchObject({
        salesOrderId: orderId,
        state: 'current',
        savedNetAmount: '40.0000',
        currentNetAmount: '40.0000',
      });
    });

    it('legacy partial-group draft: only the payment line is claimed ⇒ changed, current includes the refund', async () => {
      const { orderId, paymentId } = await payOrder('100.00', atomeMethodId);
      const refundId = await refundOrder(orderId, '30.00', atomeMethodId);
      const id = await insertDraft(
        atomeMethodId,
        [{ paymentId, amount: '100.0000' }],
        '100.0000',
      );
      const [row] = await claimed(id);
      expect(row.state).toBe('changed');
      expect(row.savedNetAmount).toBe('100.0000');
      expect(row.currentNetAmount).toBe('70.0000');
      expect(row.currentPayments.map((p: any) => p.id).sort()).toEqual(
        [paymentId, refundId].sort(),
      );
      expect(row.savedPayments.map((p: any) => p.id)).toEqual([paymentId]);
    });

    it('claimed: a group refunded to zero is still surfaced, as zero', async () => {
      const { orderId, paymentId } = await payOrder('25.00', atomeMethodId);
      const id = await insertDraft(
        atomeMethodId,
        [{ paymentId, amount: '25.0000' }],
        '25.0000',
      );
      await refundOrder(orderId, '25.00', atomeMethodId);
      const [row] = await claimed(id);
      expect(row).toMatchObject({
        salesOrderId: orderId,
        state: 'zero',
        currentNetAmount: '0.0000',
      });
    });

    it('claimed: payments no longer eligible (after the date) ⇒ ineligible', async () => {
      const { orderId } = await newOrder('15.00');
      const late = await payExisting(
        orderId,
        '15.00',
        atomeMethodId,
        '2026-09-25',
      );
      const id = await insertDraft(
        atomeMethodId,
        [{ paymentId: late, amount: '15.0000' }],
        '15.0000',
      );
      const [row] = await claimed(id);
      expect(row).toMatchObject({
        state: 'ineligible',
        currentNetAmount: null,
        currentPayments: [],
      });
    });

    it("salesOrderIds + settlementId: own claims eligible, other drafts' claims excluded", async () => {
      const { orderId, paymentId } = await payOrder('33.00', atomeMethodId);
      const mine = await insertDraft(
        atomeMethodId,
        [{ paymentId, amount: '33.0000' }],
        '33.0000',
      );
      expect(await rowsFor([orderId], `&settlementId=${mine}`)).toHaveLength(1);
      expect(await rowsFor([orderId])).toEqual([]); // claimed by a draft, no settlementId
      const { orderId: o2, paymentId: p2 } = await payOrder('44.00', atomeMethodId);
      await insertDraft(
        atomeMethodId,
        [{ paymentId: p2, amount: '44.0000' }],
        '44.0000',
      );
      expect(await rowsFor([o2], `&settlementId=${mine}`)).toEqual([]);
    });

    it('scope=claimed without settlementId is a 400', async () => {
      await get(
        '/accounting/provider-settlements/eligible-rows?scope=claimed&settlementDate=2026-09-20',
      ).expect(400);
    });

    it('create by rows: SO-26-008 writes exactly the TikTok payment line', async () => {
      const { orderId } = await newOrder('130.00');
      await payExisting(orderId, '130.00', atomeMethodId);
      await refundOrder(orderId, '130.00', atomeMethodId);
      const tiktok = await payExisting(orderId, '130.00', tiktokMethodId, '2026-09-03');
      const res = await createDraft([{ salesOrderId: orderId, paymentMethodId: tiktokMethodId, expectedNetAmount: '130.00' }], '130.00');
      expect(res.status).toBe(201);
      const s = res.body.data ?? res.body;
      expect(s.providerPaymentMethodId).toBe(tiktokMethodId);
      const lines = await ds.query('SELECT "salesOrderPaymentId" FROM provider_settlement_lines WHERE "settlementId" = $1', [s.id]);
      expect(lines.map((l: any) => l.salesOrderPaymentId)).toEqual([tiktok]);
    });

    it('negative residue: −30 combines with a +100 row into a 70 settlement; alone it is rejected', async () => {
      const a = await payOrder('100.00', tiktokMethodId);
      const settled = await createDraft([{ salesOrderId: a.orderId, paymentMethodId: tiktokMethodId, expectedNetAmount: '100.00' }], '100.00');
      const sid = (settled.body.data ?? settled.body).id;
      const posted = await post(`/accounting/provider-settlements/${sid}/post`).expect(201);
      ownedRefs.push((posted.body.data ?? posted.body).referenceNumber);
      await refundOrder(a.orderId, '30.00', tiktokMethodId, '2026-09-05');
      const b = await payOrder('100.00', tiktokMethodId);

      const [residue] = await rowsFor([a.orderId]);
      expect(residue.netAmount).toBe('-30.0000');

      const alone = await createDraft([{ salesOrderId: a.orderId, paymentMethodId: tiktokMethodId, expectedNetAmount: '-30.00' }], '0.01');
      expect(alone.status).toBe(400);

      const both = await createDraft([
        { salesOrderId: a.orderId, paymentMethodId: tiktokMethodId, expectedNetAmount: '-30.00' },
        { salesOrderId: b.orderId, paymentMethodId: tiktokMethodId, expectedNetAmount: '100.00' },
      ], '70.00');
      expect(both.status).toBe(201);
    });

    it('mixed payment methods ⇒ 400 naming the split', async () => {
      const a = await payOrder('10.00', atomeMethodId);
      const b = await payOrder('10.00', tiktokMethodId);
      const res = await createDraft([
        { salesOrderId: a.orderId, paymentMethodId: atomeMethodId, expectedNetAmount: '10.00' },
        { salesOrderId: b.orderId, paymentMethodId: tiktokMethodId, expectedNetAmount: '10.00' },
      ], '20.00');
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toMatch(/one provider payout/);
    });

    it('stale net ⇒ 409 whose message.staleRows survives the global exception filter', async () => {
      const { orderId } = await payOrder('60.00', tiktokMethodId);
      await refundOrder(orderId, '10.00', tiktokMethodId);
      const res = await createDraft([{ salesOrderId: orderId, paymentMethodId: tiktokMethodId, expectedNetAmount: '60.00' }], '60.00');
      expect(res.status).toBe(409);
      expect(res.body.message).toEqual({
        text: 'Some rows changed since they were loaded. Review them and save again.',
        staleRows: [{ salesOrderId: orderId, paymentMethodId: tiktokMethodId, currentNetAmount: '50.0000' }],
      });
    });

    it('update adopts the complete current group of a legacy partial draft', async () => {
      const { orderId, paymentId } = await payOrder('100.00', atomeMethodId);
      const refundId = await refundOrder(orderId, '30.00', atomeMethodId);
      const created = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '70.00' }], '70.00');
      const id = (created.body.data ?? created.body).id;
      // Simulate a pre-#1284 draft holding only the payment line.
      await ds.query('DELETE FROM provider_settlement_lines WHERE "settlementId" = $1 AND "salesOrderPaymentId" = $2', [id, refundId]);
      await request(app.getHttpServer()).patch(`/accounting/provider-settlements/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rows: [{ salesOrderId: orderId, paymentMethodId: atomeMethodId, expectedNetAmount: '70.00' }], settlementAmount: '70.00' })
        .expect(200);
      const lines = await ds.query('SELECT "salesOrderPaymentId" FROM provider_settlement_lines WHERE "settlementId" = $1', [id]);
      expect(lines.map((l: any) => l.salesOrderPaymentId).sort()).toEqual([paymentId, refundId].sort());
    });

    it('post rejects a draft whose group gained a refund after saving', async () => {
      const { orderId } = await payOrder('80.00', tiktokMethodId);
      const created = await createDraft([{ salesOrderId: orderId, paymentMethodId: tiktokMethodId, expectedNetAmount: '80.00' }], '80.00');
      const id = (created.body.data ?? created.body).id;
      await refundOrder(orderId, '80.00', tiktokMethodId, '2026-09-04'); // group now nets to zero
      const res = await post(`/accounting/provider-settlements/${id}/post`);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toMatch(/edit and re-save/);
      const [s] = await ds.query('SELECT status FROM provider_settlements WHERE id = $1', [id]);
      expect(s.status).toBe('DRAFT');
    });

    describe('same-account guard', () => {
      const SAME_ACCOUNT =
        'The selected payments already debit the destination bank account and cannot be settled into that same account.';

      async function settlementCount(): Promise<number> {
        const [row] = await ds.query('SELECT count(*)::int AS n FROM provider_settlements');
        return row.n;
      }

      it('create: rejects settling CIMB payments into the 1200 bank they already debit, persisting nothing', async () => {
        const { orderId, paymentId } = await payOrder('45.00', cimbMethodId);
        const settlementsBefore = await settlementCount();
        const journalsBefore = await countJournalEntries();

        const res = await createDraft(
          [{ salesOrderId: orderId, paymentMethodId: cimbMethodId, expectedNetAmount: '45.00' }], '45.00',
        );

        expect(res.status).toBe(400);
        expect(res.body.message).toBe(SAME_ACCOUNT);
        expect(await settlementCount()).toBe(settlementsBefore);
        expect(await countJournalEntries()).toBe(journalsBefore);
        const claims = await ds.query(
          'SELECT 1 FROM provider_settlement_lines WHERE "salesOrderPaymentId" = $1', [paymentId],
        );
        expect(claims).toHaveLength(0);
      });

      it('update: rejects moving a draft into its derived clearing account, leaving the draft untouched', async () => {
        const { orderId } = await payOrder('46.00'); // Atome → clearing 1240
        const created = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '46.00' }], '46.00');
        expect(created.status).toBe(201);
        const id = (created.body.data ?? created.body).id;
        const snapshot = async () => ({
          settlement: (await ds.query(
            `SELECT "bankAccountId", "clearingAccountId", "settlementAmount", "updatedAt"
               FROM provider_settlements WHERE id = $1`, [id],
          ))[0],
          lines: await ds.query(
            'SELECT id, "salesOrderPaymentId", amount FROM provider_settlement_lines WHERE "settlementId" = $1 ORDER BY id',
            [id],
          ),
        });
        const before = await snapshot();
        expect(before.settlement.clearingAccountId).toBe(clearingAccountId);

        const res = await request(app.getHttpServer())
          .patch(`/accounting/provider-settlements/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            rows: [{ salesOrderId: orderId, paymentMethodId: atomeMethodId, expectedNetAmount: '46.00' }],
            bankAccountId: clearingAccountId,
          });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('The destination account cannot be a provider clearing account');
        expect(await snapshot()).toEqual(before);
      });

      it('post: an existing draft that settles into its own clearing account cannot post', async () => {
        // A draft saved before the guard existed: written directly, as the API
        // now refuses to create it.
        const { paymentId } = await payOrder('47.00', cimbMethodId);
        const [s] = await ds.query(
          `INSERT INTO provider_settlements
             ("referenceNumber", "providerPaymentMethodId", "clearingAccountId", "bankAccountId",
              "settlementDate", "settlementAmount", status)
           VALUES ($1, $2, $3, $3, '2026-09-20', '47.0000', 'DRAFT') RETURNING id`,
          [`PS-T-${randomUUID().slice(0, 8)}`, cimbMethodId, bankAccountId],
        );
        ownedSettlementIds.push(s.id);
        await ds.query(
          `INSERT INTO provider_settlement_lines ("settlementId", "salesOrderPaymentId", amount)
           VALUES ($1, $2, '47.0000')`,
          [s.id, paymentId],
        );
        const journalsBefore = await countJournalEntries();

        const res = await post(`/accounting/provider-settlements/${s.id}/post`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe(SAME_ACCOUNT);
        const [after] = await ds.query(
          'SELECT status, "journalEntryId", "postedAt" FROM provider_settlements WHERE id = $1', [s.id],
        );
        expect(after).toEqual({ status: 'DRAFT', journalEntryId: null, postedAt: null });
        expect(await countJournalEntries()).toBe(journalsBefore);
      });
    });

    it('two settlements that both pass recomputation collide on the claim index: one 201, one 409, no partial claims', async () => {
      const service = app.get(ProviderSettlementService) as any;
      const { orderId } = await newOrder('90.00');
      await payExisting(orderId, '60.00', tiktokMethodId);
      await payExisting(orderId, '30.00', tiktokMethodId, '2026-09-02');
      const body = draftBody([{ salesOrderId: orderId, paymentMethodId: tiktokMethodId, expectedNetAmount: '90.00' }], '90.00');

      const pids: number[] = [];
      let arrived = 0;
      let openGate!: () => void;
      const gate = new Promise<void>((r) => (openGate = r));
      service[SETTLEMENT_TEST_HOOK] = async (phase: string, ctx: any) => {
        if (phase !== 'afterRecompute' || !ctx.salesOrderIds.includes(orderId)) return;
        const [{ pid }] = await ctx.manager.query('SELECT pg_backend_pid() AS pid');
        pids.push(pid);
        arrived += 1;
        if (arrived === 2) openGate();
        await withTimeout(gate, 10_000, 'both settlements reaching claim insertion');
      };

      const started = [
        start(post('/accounting/provider-settlements', body), { createsSettlement: true }),
        start(post('/accounting/provider-settlements', body), { createsSettlement: true }),
      ];
      let results: request.Response[] = [];
      try {
        results = await withTimeout(Promise.all(started.map((s) => s.done)), 30_000, 'claim race') as request.Response[];
      } finally {
        delete service[SETTLEMENT_TEST_HOOK];
        openGate();
        await drain(started, pids);
      }
      // Both passed stale validation, so the loser's 409 can only have come from
      // the claim index (the 23505 → staleRows path), not from recomputation.
      expect(arrived).toBe(2);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.message.staleRows).toEqual([
        { salesOrderId: orderId, paymentMethodId: tiktokMethodId, currentNetAmount: null },
      ]);

      const claims = await ds.query(
        `SELECT l."settlementId", count(*)::int AS n FROM provider_settlement_lines l
           JOIN sales_order_payments p ON p.id = l."salesOrderPaymentId"
          WHERE p."salesOrderId" = $1 GROUP BY l."settlementId"`,
        [orderId],
      );
      expect(claims).toHaveLength(1); // only the winner holds claims
      expect(claims[0].n).toBe(2);    // and it holds the whole group
      const winnerId = (results.find((r) => r.status === 201)!.body.data).id;
      expect(claims[0].settlementId).toBe(winnerId);
    });

    it('a refund recorded while a settlement holds its order lock waits on THAT settlement, then becomes unclaimed residue', async () => {
      const service = app.get(ProviderSettlementService) as any;
      const { orderId } = await payOrder('100.00', tiktokMethodId);

      let settlementPid: number | undefined;
      let refundPid: number | undefined;
      let reached!: () => void;
      const lockHeld = new Promise<void>((r) => (reached = r));
      let release!: () => void;
      const released = new Promise<void>((r) => (release = r));
      service[SETTLEMENT_TEST_HOOK] = async (phase: string, ctx: any) => {
        if (phase !== 'afterSalesOrderLock' || !ctx.salesOrderIds.includes(orderId)) return;
        [{ pid: settlementPid }] = await ctx.manager.query('SELECT pg_backend_pid() AS pid');
        reached();
        await released;
      };

      const started: Array<{ req: request.Test; done: Promise<request.Response> }> = [];
      let refundDone = false;
      let settled: request.Response | undefined;
      let refund: request.Response | undefined;
      try {
        started.push(start(post('/accounting/provider-settlements', draftBody(
          [{ salesOrderId: orderId, paymentMethodId: tiktokMethodId, expectedNetAmount: '100.00' }], '100.00',
        )), { createsSettlement: true }));
        await withTimeout(lockHeld, 10_000, 'settlement reaching its SO lock');
        expect(settlementPid).toBeDefined();

        const refundReq = start(post(`/sales-orders/${orderId}/refunds`, {
          refunds: [{ amount: '30.00', paymentMethodId: tiktokMethodId, paymentDate: '2026-09-02' }],
        }));
        refundReq.done.then(() => { refundDone = true; }, () => { refundDone = true; });
        started.push(refundReq);

        // Identify the ONE session waiting on a lock held by THIS settlement's
        // backend and reading sales_orders — not any waiting query.
        //
        // Why the pattern does not include `FOR UPDATE`: pg_stat_activity.query
        // is truncated at track_activity_query_size (default 1024 bytes; a
        // server-start setting), and the refund's lock read is longer than
        // that. It comes from lockRowForUpdate() (common/db/tx-helpers.ts),
        // which issues repo.findOne with lock mode pessimistic_write, so TypeORM
        // selects every sales_orders column by alias and appends `FOR UPDATE` at
        // the END — past the cut. To see the full statement, run with
        // `log_statement = 'all'` and read the Postgres log.
        //
        // What still makes the match specific: the session must be waiting on a
        // lock (wait_event_type = 'Lock'), blocked by this settlement's own
        // backend (pg_blocking_pids), and reading `FROM "sales_orders"`. The only
        // other request in flight is the refund, and the settlement holds
        // nothing but its FOR SHARE on this order, so exactly one row can match.
        // The `rows.length > 1` check below fails loudly if that ever changes.
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline && refundPid === undefined && !refundDone) {
          const rows: Array<{ pid: number }> = await ds.query(
            `SELECT pid FROM pg_stat_activity
              WHERE wait_event_type = 'Lock'
                AND $1 = ANY(pg_blocking_pids(pid))
                AND query ILIKE '%FROM "sales_orders"%'`,
            [settlementPid],
          );
          if (rows.length > 1) throw new Error(`expected one blocked refund session, found ${rows.length}`);
          if (rows.length === 1) refundPid = rows[0].pid;
          else await pause(50);
        }
        expect(refundDone).toBe(false);
        expect(refundPid).toBeDefined();

        release();
        [settled, refund] = await withTimeout(Promise.all(started.map((s) => s.done)), 15_000, 'commit then refund');
      } finally {
        delete service[SETTLEMENT_TEST_HOOK];
        release?.();
        await drain(started, [settlementPid, refundPid]);
      }

      expect(settled!.status).toBe(201); // its id was registered by start()
      expect(refund!.status).toBe(201);

      // The refund arrived after the claim: it is unclaimed residue, not part of the draft.
      const [residue] = await rowsFor([orderId]);
      expect(residue.netAmount).toBe('-30.0000');
    });

    describe('provider clearing eligibility (#1285)', () => {
      it('lists Shopee but not Cash, CIMB or Maybank groups, and meta.total agrees', async () => {
        const { orderId } = await newOrder('100.00');
        await payExisting(orderId, '25.00', await methodIdByCode(ds, 'SHOPEE'));
        await payExisting(orderId, '25.00', await methodIdByCode(ds, 'CASH'));
        await payExisting(orderId, '25.00', cimbMethodId);
        await payExisting(orderId, '25.00', await methodIdByCode(ds, 'MAYBANK'));
        const res = await get(`/accounting/provider-settlements/eligible-rows?salesOrderIds=${orderId}&settlementDate=2026-09-20`).expect(200);
        expect(res.body.data.map((r: any) => r.paymentMethodName)).toEqual(['Shopee']);
        expect(res.body.meta.total).toBe(1);
      });

      it('remapping CIMB to 1220 does not list an old CIMB payment', async () => {
        const { orderId } = await payOrder('31.00', cimbMethodId); // journal debits 1200
        await withCimbMappedTo('1220', async () => {
          const rows = await rowsFor([orderId]);
          expect(rows).toHaveLength(0);
        });
      });

      it("a draft's own method is still subject to the journal gate", async () => {
        // A CIMB draft (inserted directly: the API now refuses it) with an old CIMB payment.
        const { orderId, paymentId } = await payOrder('32.00', cimbMethodId);
        const draftId = await insertDraft(cimbMethodId, [{ paymentId, amount: '32.0000' }], '32.0000');
        const res = await get(`/accounting/provider-settlements/eligible-rows?settlementId=${draftId}&salesOrderIds=${orderId}&settlementDate=2026-09-20`).expect(200);
        expect(res.body.data).toHaveLength(0);
      });

      it('does not list a group whose payments derive to two different flagged accounts', async () => {
        const shopee = await methodIdByCode(ds, 'SHOPEE');
        const { orderId } = await newOrder('60.00');
        await payExisting(orderId, '30.00', shopee);          // → 1220
        await withMethodMappedTo(shopee, '1230', async () => {
          await payExisting(orderId, '30.00', shopee);        // → 1230
          expect(await rowsFor([orderId])).toHaveLength(0);
        });
      });

      const NOT_PROVIDER_1200 =
        'Account 1200 CIMB is not a provider clearing account. Only payments recorded to a provider clearing account can be settled.';

      it('create: an old CIMB payment is not saveable after CIMB is remapped to 1220', async () => {
        const { orderId, paymentId } = await payOrder('33.00', cimbMethodId);
        await withCimbMappedTo('1220', async () => {
          // Destination 1210, NOT the suite default 1200: CIMB payments debit 1200, so a
          // 1200 destination would stop at the same-account guard and never reach this check.
          const res = await post('/accounting/provider-settlements', {
            ...draftBody([{ salesOrderId: orderId, paymentMethodId: cimbMethodId, expectedNetAmount: '33.00' }], '33.00'),
            bankAccountId: await accountIdByCode(ds, '1210'),
          });
          if (res.status === 201) ownedSettlementIds.push((res.body.data ?? res.body).id);
          // Save re-computes eligibility, which shares NO mapping filter — so it reaches derivation.
          expect(res.status).toBe(400);
          expect(res.body.message).toBe(NOT_PROVIDER_1200);
        });
        expect(await ds.query('SELECT 1 FROM provider_settlement_lines WHERE "salesOrderPaymentId" = $1', [paymentId])).toHaveLength(0);
      });

      it('post: a draft holding an old CIMB payment cannot post, and nothing is written', async () => {
        // Inserted directly: the API now refuses to create it. Destination 1210, so the
        // same-account guard (1200 vs 1210) passes and the provider-clearing check decides.
        const { paymentId } = await payOrder('35.00', cimbMethodId);
        const maybankAccountId = await accountIdByCode(ds, '1210');
        const [s] = await ds.query(
          `INSERT INTO provider_settlements
             ("referenceNumber", "providerPaymentMethodId", "clearingAccountId", "bankAccountId",
              "settlementDate", "settlementAmount", status)
           VALUES ($1, $2, $3, $4, '2026-09-20', '35.0000', 'DRAFT') RETURNING id`,
          [`PS-T-${randomUUID().slice(0, 8)}`, cimbMethodId, bankAccountId, maybankAccountId],
        );
        ownedSettlementIds.push(s.id);
        await ds.query(
          `INSERT INTO provider_settlement_lines ("settlementId", "salesOrderPaymentId", amount)
           VALUES ($1, $2, '35.0000')`,
          [s.id, paymentId],
        );
        const journalsBefore = await countJournalEntries();

        const res = await post(`/accounting/provider-settlements/${s.id}/post`);

        expect(res.status).toBe(400);
        expect(res.body.message).toBe(NOT_PROVIDER_1200);
        const [after] = await ds.query(
          'SELECT status, "journalEntryId", "postedAt", "postedBy" FROM provider_settlements WHERE id = $1', [s.id],
        );
        expect(after).toEqual({ status: 'DRAFT', journalEntryId: null, postedAt: null, postedBy: null });
        expect(await countJournalEntries()).toBe(journalsBefore);
        const lines = await ds.query(
          'SELECT "releasedAt" FROM provider_settlement_lines WHERE "settlementId" = $1', [s.id],
        );
        expect(lines).toEqual([{ releasedAt: null }]);
        // Cleanup: afterAll deletes ownedSettlementIds' lines and rows; the payment's
        // order is in ownedSalesOrderIds via payOrder.
      });

      it('reverse still succeeds for a posted 1240 settlement after 1240 is unflagged', async () => {
        const { orderId } = await payOrder('36.00'); // Atome → 1240
        const draft = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '36.00' }], '36.00');
        expect(draft.status).toBe(201);
        const id = (draft.body.data ?? draft.body).id;
        const posted = await post(`/accounting/provider-settlements/${id}/post`).expect(201);
        const settlement = posted.body.data ?? posted.body;
        ownedRefs.push(settlement.referenceNumber);

        await ds.query(`UPDATE chart_of_account SET "isProviderClearing" = false WHERE code = '1240'`);
        try {
          const reversed = await post(`/accounting/provider-settlements/${id}/reverse`).expect(201);
          const after = reversed.body.data ?? reversed.body;
          expect(after.status).toBe('REVERSED');
          const [rev] = await ds.query(
            'SELECT "reversalOfEntryId" FROM journal_entry WHERE id = $1', [after.reversalJournalEntryId],
          );
          expect(rev.reversalOfEntryId).toBe(settlement.journalEntryId);
          const released = await ds.query(
            'SELECT "releasedAt" FROM provider_settlement_lines WHERE "settlementId" = $1', [id],
          );
          expect(released.length).toBeGreaterThan(0);
          expect(released.every((l: any) => l.releasedAt !== null)).toBe(true);
        } finally {
          // Baseline row shared with every suite: always restore.
          await ds.query(`UPDATE chart_of_account SET "isProviderClearing" = true WHERE code = '1240'`);
        }
      });

      it('unflagging 1240 after a draft is saved ⇒ claimed rows are not_provider_clearing and post is 400', async () => {
        const { orderId } = await payOrder('34.00'); // Atome → 1240
        const created = await createDraft([{ salesOrderId: orderId, expectedNetAmount: '34.00' }], '34.00');
        expect(created.status).toBe(201);
        const id = (created.body.data ?? created.body).id;
        await ds.query(`UPDATE chart_of_account SET "isProviderClearing" = false WHERE code = '1240'`);
        try {
          expect((await claimed(id)).map((c) => c.state)).toEqual(['not_provider_clearing']);
          const res = await post(`/accounting/provider-settlements/${id}/post`);
          expect(res.status).toBe(400);
          expect(res.body.message).toMatch(/^Account 1240 .* is not a provider clearing account\./);
        } finally {
          await ds.query(`UPDATE chart_of_account SET "isProviderClearing" = true WHERE code = '1240'`);
        }
      });
    });

    /**
     * #1288: eligibility follows the JOURNAL-DERIVED clearing account, never the
     * method's live mapping. Shopee payments recorded while Shopee maps to 1220
     * stay settleable after Shopee is remapped, unmapped or made invalid.
     */
    describe('journal-derived eligibility after the mapping changes (#1288)', () => {
      let shopeeMethodId = '';
      let shopeeClearingId = '';
      let destinationId = '';
      let invalidTargetId = '';
      const NOT_PROVIDER_1200 =
        'Account 1200 CIMB is not a provider clearing account. Only payments recorded to a provider clearing account can be settled.';

      beforeAll(async () => {
        shopeeMethodId = await methodIdByCode(ds, 'SHOPEE');
        shopeeClearingId = await accountIdByCode(ds, '1220');
        // 1210, not the suite default 1200: Shopee remapped to 1200 must not
        // collide with the same-account guard for its NEW payments' check.
        destinationId = await accountIdByCode(ds, '1210');
        // Suite-owned, so deactivating it never touches a shared baseline row.
        const [parent] = await ds.query(`SELECT id FROM chart_of_account WHERE code = '1000'`);
        const [acct] = await ds.query(
          `INSERT INTO chart_of_account (code, name, type, "parentId", "isSystem", "isPostable", "isActive")
           VALUES ($1, $2, 'Asset', $3, false, true, true) RETURNING id`,
          [`PS-INV-${runId}`.slice(0, 20), `PS Invalid Target ${runId}`, parent.id],
        );
        invalidTargetId = acct.id;
        ownedEntityIds.push(invalidTargetId);
        ownedAccountIds.push(invalidTargetId);
      });

      /** Point Shopee at `accountId` (null ⇒ unmapped) for the duration of `fn`, then restore. */
      async function withShopeeMapping(accountId: string | null, fn: () => Promise<void>, deactivate = false) {
        const [current] = await ds.query(
          `SELECT "accountId" FROM payment_method_account_mappings WHERE "paymentMethodId" = $1`,
          [shopeeMethodId],
        );
        await putMapping(shopeeMethodId, accountId);
        try {
          // A mapping cannot be SAVED invalid; it becomes invalid when its account is deactivated.
          if (deactivate) await ds.query('UPDATE chart_of_account SET "isActive" = false WHERE id = $1', [accountId]);
          await fn();
        } finally {
          if (deactivate) await ds.query('UPDATE chart_of_account SET "isActive" = true WHERE id = $1', [accountId]);
          await putMapping(shopeeMethodId, current?.accountId ?? null);
        }
      }

      async function shopeeStatus(): Promise<string> {
        const res = await get('/accounting/settings/payment-method-mappings').expect(200);
        const rows = (res.body.data ?? res.body) as any[];
        return rows.find((r) => r.paymentMethodId === shopeeMethodId).status;
      }

      function shopeeBody(orderId: string, amount: string) {
        return {
          bankAccountId: destinationId, settlementDate: '2026-09-20',
          providerReference: `SHP-${runId}`, settlementAmount: amount,
          rows: [{ salesOrderId: orderId, paymentMethodId: shopeeMethodId, expectedNetAmount: amount }],
        };
      }

      async function createShopee(orderId: string, amount: string) {
        const res = await post('/accounting/provider-settlements', shopeeBody(orderId, amount));
        if (res.status === 201) ownedSettlementIds.push((res.body.data ?? res.body).id);
        return res;
      }

      /** Post and assert exactly Dr destination / Cr 1220 for `amount`. */
      async function expectPostsFrom1220(id: string, amount: string) {
        const posted = await post(`/accounting/provider-settlements/${id}/post`).expect(201);
        const settlement = posted.body.data ?? posted.body;
        ownedRefs.push(settlement.referenceNumber);
        expect(settlement.status).toBe('POSTED');
        const lines = await journalLinesFor(ds, settlement.referenceNumber);
        expect(lines).toHaveLength(2);
        const debit = lines.find((l) => cents(l.debit) > 0)!;
        const credit = lines.find((l) => cents(l.credit) > 0)!;
        expect(debit.accountId).toBe(destinationId);
        expect(cents(debit.debit)).toBe(cents(amount));
        expect(credit.accountId).toBe(shopeeClearingId);
        expect(cents(credit.credit)).toBe(cents(amount));
      }

      /** Old Shopee payment (→ 1220) is listed, saveable and postable under the changed mapping. */
      async function expectOldShopeeSettleable(orderId: string, amount: string) {
        const rows = await rowsFor([orderId]);
        expect(rows.map((r) => [r.paymentMethodId, r.netAmount])).toEqual([[shopeeMethodId, `${amount}00`]]);
        const created = await createShopee(orderId, amount);
        expect(created.status).toBe(201);
        await expectPostsFrom1220((created.body.data ?? created.body).id, amount);
      }

      it('remapped to 1200: old payments are listed, saved and posted; new ones are neither', async () => {
        const { orderId: oldOrder } = await payOrder('41.00', shopeeMethodId); // journal debits 1220
        await withShopeeMapping(bankAccountId, async () => {
          expect(await shopeeStatus()).toBe('mapped');
          const { orderId: newOrderId } = await payOrder('42.00', shopeeMethodId); // journal debits 1200
          expect(await rowsFor([newOrderId])).toHaveLength(0);
          const rejected = await createShopee(newOrderId, '42.00');
          expect(rejected.status).toBe(400);
          expect(rejected.body.message).toBe(NOT_PROVIDER_1200);

          await expectOldShopeeSettleable(oldOrder, '41.00');
        });
      });

      it('unmapped: old payments are listed, saved and posted', async () => {
        const { orderId } = await payOrder('43.00', shopeeMethodId);
        await withShopeeMapping(null, async () => {
          expect(await shopeeStatus()).toBe('unmapped');
          await expectOldShopeeSettleable(orderId, '43.00');
        });
      });

      it('invalid: old payments are listed, saved and posted', async () => {
        const { orderId } = await payOrder('44.00', shopeeMethodId);
        await withShopeeMapping(invalidTargetId, async () => {
          expect(await shopeeStatus()).toBe('invalid');
          await expectOldShopeeSettleable(orderId, '44.00');
        }, true);
      });

      async function patchDraft(id: string, body: any) {
        return request(app.getHttpServer()).patch(`/accounting/provider-settlements/${id}`)
          .set('Authorization', `Bearer ${token}`).send(body);
      }

      for (const [label, target, deactivate] of [
        ['unmapped', () => null, false],
        ['invalid', () => invalidTargetId, true],
      ] as const) {
        it(`update: an existing Shopee draft still saves and lists after Shopee becomes ${label}`, async () => {
          const { orderId } = await payOrder('45.00', shopeeMethodId);
          const created = await createShopee(orderId, '45.00');
          expect(created.status).toBe(201);
          const id = (created.body.data ?? created.body).id;
          await withShopeeMapping(target(), async () => {
            expect(await shopeeStatus()).toBe(label);
            const listed = await rowsFor([orderId], `&settlementId=${id}`);
            expect(listed.map((r) => r.paymentMethodId)).toEqual([shopeeMethodId]);
            const res = await patchDraft(id, { ...shopeeBody(orderId, '45.00'), providerReference: `SHP-EDIT-${runId}` });
            expect(res.status).toBe(200);
            await expectPostsFrom1220(id, '45.00');
          }, deactivate);
        });

        it(`update: a draft can switch its provider to Shopee after Shopee becomes ${label}`, async () => {
          const { orderId: atomeOrder } = await payOrder('46.00'); // Atome → 1240
          const created = await createDraft([{ salesOrderId: atomeOrder, expectedNetAmount: '46.00' }], '46.00');
          expect(created.status).toBe(201);
          const id = (created.body.data ?? created.body).id;
          const { orderId: shopeeOrder } = await payOrder('46.00', shopeeMethodId); // → 1220
          await withShopeeMapping(target(), async () => {
            expect(await shopeeStatus()).toBe(label);
            const res = await patchDraft(id, shopeeBody(shopeeOrder, '46.00'));
            expect(res.status).toBe(200);
            const [row] = await ds.query(
              'SELECT "providerPaymentMethodId", "clearingAccountId" FROM provider_settlements WHERE id = $1', [id],
            );
            expect(row).toEqual({ providerPaymentMethodId: shopeeMethodId, clearingAccountId: shopeeClearingId });
          }, deactivate);
        });
      }

      /**
       * The journal gate rejects a WHOLE group when ANY of its payments fails
       * derivation. Each group below holds one valid 1220 payment plus one bad
       * one; dropping the bad row (e.g. an inner join) would leave a remainder
       * that qualifies on its own, so these fail on exactly that mistake. Each
       * first proves the group IS listed before it turns bad, so an exclusion
       * cannot be vacuous.
       */
      describe('every payment in a group must qualify', () => {
        it('rejects a group mixing a 1220 payment with one recorded to unflagged 1200', async () => {
          const { orderId } = await newOrder('60.00');
          await payExisting(orderId, '20.00', shopeeMethodId); // → 1220
          expect((await rowsFor([orderId])).map((r) => r.netAmount)).toEqual(['20.0000']);
          await withShopeeMapping(bankAccountId, async () => {
            await payExisting(orderId, '25.00', shopeeMethodId); // → 1200
            expect(await rowsFor([orderId])).toHaveLength(0);
          });
        });

        it('rejects a group where one payment has no derivable journal', async () => {
          const { orderId } = await newOrder('60.00');
          await payExisting(orderId, '20.00', shopeeMethodId);
          const bad = await payExisting(orderId, '25.00', shopeeMethodId);
          expect((await rowsFor([orderId])).map((r) => r.netAmount)).toEqual(['45.0000']);
          // A soft-deleted entry still satisfies the eligibility EXISTS (which does not
          // read deletedAt) but the derivation hides it, so the payment derives to nothing.
          await ds.query('UPDATE journal_entry SET "deletedAt" = now() WHERE "sourceEventId" = $1', [bad]);
          try {
            expect(await rowsFor([orderId])).toHaveLength(0);
          } finally {
            await ds.query('UPDATE journal_entry SET "deletedAt" = NULL WHERE "sourceEventId" = $1', [bad]);
          }
        });

        it('rejects a group where one payment derives to a soft-deleted account', async () => {
          // Suite-owned flagged account, so soft-deleting it touches no shared baseline row.
          const [parent] = await ds.query(`SELECT id FROM chart_of_account WHERE code = '1000'`);
          const [x] = await ds.query(
            `INSERT INTO chart_of_account (code, name, type, "parentId", "isSystem", "isPostable", "isActive", "isProviderClearing")
             VALUES ($1, $2, 'Asset', $3, false, true, true, true) RETURNING id`,
            [`PS-DEL-${runId}`.slice(0, 20), `PS Deleted Clearing ${runId}`, parent.id],
          );
          ownedAccountIds.push(x.id);
          ownedEntityIds.push(x.id);

          const { orderId } = await newOrder('60.00');
          await withShopeeMapping(x.id, async () => {
            await payExisting(orderId, '25.00', shopeeMethodId); // → X
          });
          expect((await rowsFor([orderId])).map((r) => r.netAmount)).toEqual(['25.0000']);
          await payExisting(orderId, '20.00', shopeeMethodId); // → 1220: two accounts now
          await ds.query('UPDATE chart_of_account SET "deletedAt" = now() WHERE id = $1', [x.id]);
          try {
            // Dropping the X payment would leave a lone, valid 1220 payment.
            expect(await rowsFor([orderId])).toHaveLength(0);
          } finally {
            await ds.query('UPDATE chart_of_account SET "deletedAt" = NULL WHERE id = $1', [x.id]);
          }
        });
      });
    });
  });
}); // closes describe('Provider settlements (e2e)')
