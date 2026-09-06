import { DataSource } from "typeorm";

/**
 * Suite-private fixture namespace for fuzzy-search.e2e-spec.ts.
 *
 * This suite previously ran, in its `beforeAll` seed:
 *
 *   TRUNCATE TABLE vendor_payments, ..., suppliers RESTART IDENTITY CASCADE
 *
 * destroying other suites' business rows on the shared e2e database (#1199).
 * It creates no users, so nothing here touches `users` or `refresh_tokens` —
 * this suite's truncate is a business-data defect only, and does NOT establish
 * the auth-cascade mechanism under investigation in #1197.
 *
 * The truncate was doing a SECOND job here beyond isolation, and dropping it
 * without compensating would quietly gut the suite. Every test misspells its
 * query so the primary `ILIKE '%q%'` path finds nothing and execution reaches
 * the fuzzy branch. `searchGlobal` returns early the moment the ILIKE path
 * matches ANY row, and the assertions only check `length > 0` — so on a
 * populated database an unrelated leftover row could satisfy the assertion via
 * the ILIKE path while the fuzzy branch never runs. The spec compensates by
 * asserting the returned result IS the seeded fixture (by id), not merely that
 * something came back.
 */
export const FUZZY_NS = "fuzzyspec";

/**
 * Single source of truth for fixture names AND cleanup predicates, so the two
 * cannot drift. Never hardcode either.
 *
 * These tokens must stay misspelling-friendly: each test queries a deliberate
 * corruption of the name below, and pg_trgm's similarity limit (default 0.3)
 * has to still match. Renaming a fixture means re-checking its paired query.
 */
export const FUZZY_TOKEN = "Qwentrix";

export const FUZZY_PRODUCT_NAME = `${FUZZY_TOKEN} Hydraulic Compressor`;
export const FUZZY_CUSTOMER_NAME = `${FUZZY_TOKEN} Ferdinand Wholesale`;
export const FUZZY_SUPPLIER_NAME = `${FUZZY_TOKEN} Bergstrom Industries`;
export const FUZZY_CATEGORY_NAME = `${FUZZY_TOKEN} Category`;

/** Derived from the same token that builds the names above. */
export const FUZZY_NAME_PREFIX = `${FUZZY_TOKEN}%`;

/**
 * Document numbers are matched by `orderNumber ILIKE`/similarity, not by name,
 * so they carry the namespace in the number itself. The year segment is fixed
 * rather than derived from the clock: a derived year would silently change the
 * string the paired misspelling test queries.
 */
export const FUZZY_SALES_ORDER_NUMBER = "SO-2091-004417";
export const FUZZY_PURCHASE_ORDER_NUMBER = "PO-2091-008852";

/**
 * The ONE destructive fixture operation fuzzy-search.e2e-spec.ts performs.
 *
 * Own-rows deletion only, children before parents. See search-fixture.ts for
 * the FK direction table this ordering satisfies — purchase_order_items ->
 * products and purchase_orders -> suppliers are both RESTRICT, so a parent
 * deleted ahead of its children fails outright rather than cascading.
 *
 * Rows with no namespaceable column of their own (purchase_order_items,
 * sales_order_items, vendor_payments, payments) are scoped through suite-owned
 * parent IDs, resolved once up front so no step depends on a row an earlier
 * step deleted.
 */
export async function resetFuzzySearchFixtures(ds: DataSource): Promise<void> {
  const supplierIds: string[] = (
    await ds.query(`SELECT id FROM suppliers WHERE "companyName" ILIKE $1`, [
      FUZZY_NAME_PREFIX,
    ])
  ).map((r: { id: string }) => r.id);

  const customerIds: string[] = (
    await ds.query(`SELECT id FROM customers WHERE "name" ILIKE $1`, [
      FUZZY_NAME_PREFIX,
    ])
  ).map((r: { id: string }) => r.id);

  const productIds: string[] = (
    await ds.query(`SELECT id FROM products WHERE "name" ILIKE $1`, [
      FUZZY_NAME_PREFIX,
    ])
  ).map((r: { id: string }) => r.id);

  const purchaseOrderIds: string[] = (
    await ds.query(`SELECT id FROM purchase_orders WHERE "orderNumber" = $1`, [
      FUZZY_PURCHASE_ORDER_NUMBER,
    ])
  ).map((r: { id: string }) => r.id);

  const salesOrderIds: string[] = (
    await ds.query(`SELECT id FROM sales_orders WHERE "orderNumber" = $1`, [
      FUZZY_SALES_ORDER_NUMBER,
    ])
  ).map((r: { id: string }) => r.id);

  // --- children first ---
  if (purchaseOrderIds.length) {
    await ds.query(
      `DELETE FROM vendor_payments WHERE "purchaseOrderId" = ANY($1)`,
      [purchaseOrderIds],
    );
    await ds.query(
      `DELETE FROM purchase_order_items WHERE "purchaseOrderId" = ANY($1)`,
      [purchaseOrderIds],
    );
  }
  if (supplierIds.length) {
    await ds.query(`DELETE FROM vendor_payments WHERE "supplierId" = ANY($1)`, [
      supplierIds,
    ]);
  }
  if (salesOrderIds.length) {
    await ds.query(`DELETE FROM payments WHERE "salesOrderId" = ANY($1)`, [
      salesOrderIds,
    ]);
    await ds.query(
      `DELETE FROM sales_order_items WHERE "salesOrderId" = ANY($1)`,
      [salesOrderIds],
    );
  }
  if (customerIds.length) {
    await ds.query(`DELETE FROM payments WHERE "customerId" = ANY($1)`, [
      customerIds,
    ]);
  }
  if (productIds.length) {
    await ds.query(`DELETE FROM stock_movements WHERE "productId" = ANY($1)`, [
      productIds,
    ]);
  }

  // --- then parents ---
  if (purchaseOrderIds.length) {
    await ds.query(`DELETE FROM purchase_orders WHERE id = ANY($1)`, [
      purchaseOrderIds,
    ]);
  }
  if (salesOrderIds.length) {
    await ds.query(`DELETE FROM sales_orders WHERE id = ANY($1)`, [
      salesOrderIds,
    ]);
  }
  if (productIds.length) {
    await ds.query(`DELETE FROM products WHERE id = ANY($1)`, [productIds]);
  }
  await ds.query(`DELETE FROM categories WHERE "name" ILIKE $1`, [
    FUZZY_NAME_PREFIX,
  ]);
  if (customerIds.length) {
    await ds.query(`DELETE FROM customers WHERE id = ANY($1)`, [customerIds]);
  }
  if (supplierIds.length) {
    await ds.query(`DELETE FROM suppliers WHERE id = ANY($1)`, [supplierIds]);
  }
}
