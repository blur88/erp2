import { DataSource } from "typeorm";

/**
 * Suite-private fixture namespace for search.e2e-spec.ts.
 *
 * This suite previously ran, in a `beforeEach`:
 *
 *   TRUNCATE TABLE refresh_tokens, ..., users RESTART IDENTITY CASCADE
 *
 * which destroyed every other suite's users, refresh tokens and business rows
 * on the shared e2e database (issue #1199). Everything here exists so the suite
 * can reset only what it owns.
 */
export const SEARCH_NS = "searchspec";

/**
 * The distinctive query token, and the single source of truth for BOTH the
 * fixture names and the cleanup predicates.
 *
 * Naming and cleanup must never drift apart: a renamed fixture whose cleanup
 * predicate still matches the old pattern leaks rows into a shared database
 * forever. Both are derived from this constant below — never hardcode either.
 *
 * The token is deliberately nonsense so it cannot collide with another suite's
 * data. That matters for ranking, not just cleanup: SEARCH_CANDIDATE_LIMIT is
 * 10 per entity source and the merged response is cut to SEARCH_RESPONSE_LIMIT
 * (20), so a fixture named something ordinary ("Test Customer") can be ranked
 * out by unrelated rows and make an assertion fail for reasons unrelated to the
 * behaviour under test.
 */
export const SEARCH_TOKEN = "Zylotron";

/**
 * Token-FIRST names. Customer and supplier matching is
 * `name ILIKE '%token%'` (contains), so leading position is not what makes the
 * row reachable — the token's uniqueness is. Leading position buys the score
 * tier: SCORE_STARTSWITH_NAME (85) instead of SCORE_CONTAINS (60), which is the
 * margin that keeps the fixture above the response cut.
 */
export const SEARCH_CUSTOMER_NAME = `${SEARCH_TOKEN} ${SEARCH_NS} Trading`;
export const SEARCH_SUPPLIER_NAME = `${SEARCH_TOKEN} ${SEARCH_NS} Supply`;

/**
 * Cleanup predicate, derived from the same token that builds the names above.
 * `ILIKE 'Zylotron%'` matches the token-first pattern; a trailing-suffix
 * predicate would silently stop matching if a name were ever reordered.
 */
export const SEARCH_NAME_PREFIX = `${SEARCH_TOKEN}%`;

export const SEARCH_USERNAMES: readonly string[] = [
  "admin",
  "manager",
  "sales_staff",
  "procurement_staff",
  "inventory_staff",
].map((role) => `${SEARCH_NS}_${role}`);

/**
 * The ONE destructive fixture operation search.e2e-spec.ts performs.
 *
 * Own-rows deletion only, children before parents. The dropped TRUNCATE relied
 * on CASCADE to paper over FK direction; without it the order below is load
 * bearing, because two of these FKs are RESTRICT rather than CASCADE:
 *
 *   purchase_order_items -> purchase_orders   CASCADE
 *   purchase_order_items -> products          RESTRICT  <- blocks product delete
 *   purchase_orders      -> suppliers         RESTRICT  <- blocks supplier delete
 *   vendor_payments      -> purchase_orders   NO ACTION (no onDelete declared)
 *   refresh_tokens       -> users             CASCADE
 *
 * `purchase_order_items` and `vendor_payments` carry no namespaceable text
 * column of their own, so they are scoped through suite-owned parent IDs, which
 * are resolved once up front and reused. Resolving them first means no later
 * step depends on a row a previous step already deleted.
 *
 * search-isolation cases in auth-isolation-sentinel.e2e-spec.ts call THIS
 * function, not a copy — a duplicated implementation would stop testing the
 * real path the moment the two drifted.
 */
export async function resetSearchFixtures(ds: DataSource): Promise<void> {
  const supplierIds: string[] = (
    await ds.query(`SELECT id FROM suppliers WHERE "companyName" ILIKE $1`, [
      SEARCH_NAME_PREFIX,
    ])
  ).map((r: { id: string }) => r.id);

  const customerIds: string[] = (
    await ds.query(`SELECT id FROM customers WHERE "name" ILIKE $1`, [
      SEARCH_NAME_PREFIX,
    ])
  ).map((r: { id: string }) => r.id);

  const productIds: string[] = (
    await ds.query(`SELECT id FROM products WHERE "name" ILIKE $1`, [
      SEARCH_NAME_PREFIX,
    ])
  ).map((r: { id: string }) => r.id);

  const purchaseOrderIds: string[] = supplierIds.length
    ? (
        await ds.query(
          `SELECT id FROM purchase_orders WHERE "supplierId" = ANY($1)`,
          [supplierIds],
        )
      ).map((r: { id: string }) => r.id)
    : [];

  const salesOrderIds: string[] = customerIds.length
    ? (
        await ds.query(
          `SELECT id FROM sales_orders WHERE "customerId" = ANY($1)`,
          [customerIds],
        )
      ).map((r: { id: string }) => r.id)
    : [];

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
  // payments carries its own customerId, so a payment can reference a
  // suite-owned customer without going through a sales order. Verified against
  // the live test schema — scoping only by salesOrderId would leave those rows
  // behind and then block the customer delete.
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
    SEARCH_NAME_PREFIX,
  ]);
  if (customerIds.length) {
    await ds.query(`DELETE FROM customers WHERE id = ANY($1)`, [customerIds]);
  }
  if (supplierIds.length) {
    await ds.query(`DELETE FROM suppliers WHERE id = ANY($1)`, [supplierIds]);
  }

  // Refresh tokens cascade via RefreshToken.userId (onDelete: 'CASCADE').
  await ds.query(`DELETE FROM users WHERE username = ANY($1)`, [
    [...SEARCH_USERNAMES],
  ]);
}
