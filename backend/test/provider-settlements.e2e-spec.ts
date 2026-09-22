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

const runId = randomUUID().slice(0, 8);

describe('Provider settlements (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token = '';
  let post: (path: string, body?: any) => request.Test;
  let get: (path: string) => request.Test;

  let adminUserId = '';
  let adminUsername = '';
  let customerId = '';
  let productId = '';
  let categoryId = '';
  let atomeMethodId = '';
  let clearingAccountId = '';
  let bankAccountId = '';

  const ownedEntityIds: string[] = [];
  const ownedRefs: string[] = [];
  const ownedSalesOrderIds: string[] = [];
  const ownedSettlementIds: string[] = [];

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

    // BASELINE rows, shared with every other suite in a size-ordered run
    // against one database. Read them; never mutate or delete them.
    atomeMethodId = await methodIdByCode(ds, 'ATOME');
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
   * Create a sales order and record a payment with the Atome method, which
   * debits the 1240 clearing account. Returns the PAYMENT row id.
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
  async function payOrder(amount: string): Promise<{
    orderId: string;
    orderNumber: string;
    paymentId: string;
  }> {
    const res = await post('/sales-orders', {
      customerId,
      items: [{ productId, quantity: 1, unitPrice: amount }],
    }).expect(201);
    const order = res.body.data ?? res.body;
    ownedSalesOrderIds.push(order.id);
    ownedRefs.push(order.orderNumber);
    ownedEntityIds.push(order.id);

    await post(`/sales-orders/${order.id}/payments`, {
      amount,
      paymentMethodId: atomeMethodId,
      paymentDate: '2026-09-01',
    }).expect(200);

    // Read the payment row back. Newest positive row for this order.
    const [row] = await ds.query(
      `SELECT id FROM sales_order_payments
        WHERE "salesOrderId" = $1 AND amount > 0
        ORDER BY "createdAt" DESC, id DESC LIMIT 1`,
      [order.id],
    );
    expect(row?.id).toBeTruthy();

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentId: row.id,
    };
  }

  /**
   * POST /sales-orders/:id/refunds takes **{ refunds: [...] }**, returns
   * **201** (no @HttpCode override, sales-order.controller.ts:191), and returns
   * an **array** — it is a batch endpoint.
   */
  async function refundOrder(orderId: string, amount: string): Promise<string> {
    await post(`/sales-orders/${orderId}/refunds`, {
      refunds: [
        { amount, paymentMethodId: atomeMethodId, paymentDate: '2026-09-02' },
      ],
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

  function draftBody(
    paymentIds: string[],
    settlementAmount: string,
    settlementDate = '2026-09-20',
  ) {
    return {
      providerPaymentMethodId: atomeMethodId,
      bankAccountId,
      settlementDate,
      providerReference: `ATM-${runId}`,
      settlementAmount,
      paymentIds,
    };
  }

  async function createDraft(
    paymentIds: string[],
    amount: string,
    settlementDate?: string,
  ) {
    const res = await post(
      '/accounting/provider-settlements',
      draftBody(paymentIds, amount, settlementDate),
    );
    if (res.status === 201)
      ownedSettlementIds.push((res.body.data ?? res.body).id);
    return res;
  }

  async function countJournalEntries(): Promise<number> {
    const [row] = await ds.query(
      'SELECT count(*)::int AS count FROM journal_entry',
    );
    return row.count;
  }

  it('posts exactly Dr bank / Cr clearing with no fee line', async () => {
    const { paymentId } = await payOrder('98.00');
    const draft = await createDraft([paymentId], '98.00');
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
    const { paymentId } = await payOrder('50.00');
    expect((await createDraft([paymentId], '50.00')).status).toBe(201);

    const before = await countJournalEntries();
    const second = await createDraft([paymentId], '50.00');
    expect(second.status).toBe(409);
    // The filter preserves `message` verbatim when it is an object, so the
    // machine-readable ids ride INSIDE it (see Task 5).
    expect(second.body.message.unavailablePaymentIds).toEqual([paymentId]);
    expect(await countJournalEntries()).toBe(before);
  });

  it('reverses without mutating the original entry, and releases the claims', async () => {
    const { paymentId } = await payOrder('70.00');
    const draft = await createDraft([paymentId], '70.00');
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
    const { paymentId } = await payOrder('60.00');
    const first = await createDraft([paymentId], '60.00');
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
    const second = await createDraft([paymentId], '60.00');
    expect(second.status).toBe(201);
    const secondPosted = await post(
      `/accounting/provider-settlements/${(second.body.data ?? second.body).id}/post`,
    ).expect(201);
    ownedRefs.push(
      (secondPosted.body.data ?? secondPosted.body).referenceNumber,
    );
  });

  it('rejects a non-postable bank account', async () => {
    const { paymentId } = await payOrder('30.00');
    const [parent] = await ds.query(
      `SELECT id FROM chart_of_account WHERE "isPostable" = false AND "isActive" = true LIMIT 1`,
    );
    expect(parent).toBeDefined();

    const res = await post('/accounting/provider-settlements', {
      ...draftBody([paymentId], '30.00'),
      bankAccountId: parent.id,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toMatch(/not postable/);
  });

  it('rejects an unbalanced settlement before any state change', async () => {
    const { paymentId } = await payOrder('40.00');
    const draft = await createDraft([paymentId], '40.01');
    expect(draft.status).toBe(201);
    const id = (draft.body.data ?? draft.body).id;

    const before = await countJournalEntries();
    const posted = await post(`/accounting/provider-settlements/${id}/post`);
    expect(posted.status).toBe(400);
    expect(JSON.stringify(posted.body.message)).toMatch(/does not reconcile/);
    expect(await countJournalEntries()).toBe(before);

    const [row] = await ds.query(
      'SELECT status, "journalEntryId" FROM provider_settlements WHERE id = $1',
      [id],
    );
    expect(row).toMatchObject({ status: 'DRAFT', journalEntryId: null });
  });

  it('reconciles a batch mixing a payment and a refund', async () => {
    const { orderId, paymentId } = await payOrder('98.00');
    const refundId = await refundOrder(orderId, '50.00');

    // 98.00 + (-50.00) = 48.00
    const draft = await createDraft([paymentId, refundId], '48.00');
    expect(draft.status).toBe(201);
    const posted = await post(
      `/accounting/provider-settlements/${(draft.body.data ?? draft.body).id}/post`,
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
    const { paymentId: claimedId } = await payOrder('21.00');
    const draft = await createDraft([claimedId], '21.00');
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
    const { paymentId: secondClaimedId } = await payOrder('23.00');
    const secondDraft = await createDraft([secondClaimedId], '23.00', '2026-09-21');
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

    // Eligibility: a second unclaimed payment appears while the claimed one is
    // excluded — the no-settlementId branch of the claim predicate over real rows.
    const { paymentId: unclaimedId } = await payOrder('22.00');
    const eligible = await get(
      `/accounting/provider-settlements/eligible-payments?providerPaymentMethodId=${atomeMethodId}&settlementDate=2026-09-20`,
    ).expect(200);
    const eligibleIds = (eligible.body.data ?? []).map((r: any) => r.id);
    expect(eligibleIds).toContain(unclaimedId);
    expect(eligibleIds).not.toContain(claimedId);
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

      const { paymentId: firstPaymentId } = await payOrder('31.00');
      const first = await createDraft([firstPaymentId], '31.00');
      expect(first.status).toBe(201);
      const firstRef = (first.body.data ?? first.body).referenceNumber;
      ownedRefs.push(firstRef);

      // Expectation is computed from the values this test WROTE, independently
      // of the generator's own formatting inputs.
      expect(firstRef).toBe(`${firstPrefix}-${yy}-0700`);

      // Second settlement needs its OWN payment: reusing the first one hits the
      // duplicate-claim 409 that this suite already covers above.
      await configure(secondPrefix, 701);

      const { paymentId: secondPaymentId } = await payOrder('32.00');
      const second = await createDraft([secondPaymentId], '32.00');
      expect(second.status).toBe(201);
      const secondRef = (second.body.data ?? second.body).referenceNumber;
      ownedRefs.push(secondRef);

      expect(secondRef).toBe(`${secondPrefix}-${yy}-0701`);

      // The generator also advanced the stored sequence, so the row is being
      // both read and written rather than merely read.
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
}); // closes describe('Provider settlements (e2e)')
