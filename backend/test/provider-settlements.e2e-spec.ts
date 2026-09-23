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
  let tiktokMethodId = '';
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
    tiktokMethodId = await methodIdByCode(ds, 'TIKTOK');
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
  });
}); // closes describe('Provider settlements (e2e)')
