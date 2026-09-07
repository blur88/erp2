import { DataSource } from "typeorm";

/**
 * Own-rows business cleanup for the six suites that previously called
 * `truncateAll()` (issue #1199).
 *
 * ## Why a scoped delete rather than TRUNCATE ... CASCADE
 *
 * `truncateAll()` emptied 15 tables including `users` and `refresh_tokens`, so
 * it destroyed every other suite's fixtures on the shared e2e database. Probed
 * directly: a live access token and its refresh token both return 401
 * ("User not found" / "Invalid refresh token") after an unrelated suite's
 * cleanup runs.
 *
 * ## Delete order is load-bearing
 *
 * Without CASCADE the order below is dictated by the real FK delete rules,
 * read from a migrated schema rather than assumed:
 *
 *   sales_order_items.salesOrderId    -> sales_orders     CASCADE
 *   sales_order_payments.salesOrderId -> sales_orders     CASCADE
 *   payments.salesOrderId             -> sales_orders     RESTRICT  <-- blocks
 *   payments.customerId               -> customers        RESTRICT  <-- blocks
 *   sales_orders.customerId           -> customers        RESTRICT  <-- blocks
 *   purchase_order_items.purchaseOrderId -> purchase_orders CASCADE
 *   vendor_payments.purchaseOrderId   -> purchase_orders   NO ACTION <-- blocks
 *   vendor_payments.supplierId        -> suppliers         NO ACTION <-- blocks
 *   purchase_orders.supplierId        -> suppliers         RESTRICT  <-- blocks
 *   purchase_order_items.productId    -> products          RESTRICT  <-- blocks
 *   sales_order_items.productId       -> products          RESTRICT  <-- blocks
 *   stock_movements.productId         -> products          RESTRICT  <-- blocks
 *   stock_adjustment_items.productId  -> products          RESTRICT  <-- blocks
 *   owner_equity_documents.productId  -> products          RESTRICT  <-- blocks
 *   purchase_cost_history.productId   -> products          CASCADE
 *   price_list_items.productId        -> products          CASCADE
 *   products.categoryId               -> categories        RESTRICT  <-- blocks
 *   categories.parentId               -> categories        CASCADE
 *
 * A RESTRICT/NO ACTION edge raises rather than silently skipping, so a missed
 * step fails loudly instead of leaking rows.
 *
 * ## Scope
 *
 * These suites drive the real HTTP API, which assigns its own document numbers
 * and slugs, so their rows cannot all be name-namespaced up front. Everything
 * is therefore scoped through the suite-owned category and customer/supplier
 * roots created by the seed helpers, resolved once at the start so no later
 * step depends on a row an earlier step deleted.
 */
export interface SuiteBusinessScope {
  categoryIds?: string[];
  customerIds?: string[];
  supplierIds?: string[];
  productIds?: string[];
  /**
   * Stock-adjustment and price-list HEADERS the suite created.
   *
   * Deleting a product removes its `stock_adjustment_items` and
   * `price_list_items` rows, but the header they belonged to is reachable from
   * neither the product nor the category, so it survives as an orphan. Both
   * children CASCADE from their own parent, so deleting the header here is
   * sufficient — and it must be listed explicitly, because nothing else in this
   * scope can find it.
   */
  stockAdjustmentIds?: string[];
  priceListIds?: string[];
}

export async function resetSuiteBusinessRows(
  ds: DataSource,
  scope: SuiteBusinessScope,
): Promise<void> {
  const categoryIds = scope.categoryIds ?? [];
  const customerIds = scope.customerIds ?? [];
  const supplierIds = scope.supplierIds ?? [];
  const stockAdjustmentIds = scope.stockAdjustmentIds ?? [];
  const priceListIds = scope.priceListIds ?? [];

  // Resolve every dependent id up front, before anything is deleted.
  const productIds: string[] = [
    ...new Set([
      ...(scope.productIds ?? []),
      ...(categoryIds.length
        ? (
            await ds.query(
              `SELECT id FROM products WHERE "categoryId" = ANY($1)`,
              [categoryIds],
            )
          ).map((r: { id: string }) => r.id)
        : []),
    ]),
  ];

  const salesOrderIds: string[] = customerIds.length
    ? (
        await ds.query(
          `SELECT id FROM sales_orders WHERE "customerId" = ANY($1)`,
          [customerIds],
        )
      ).map((r: { id: string }) => r.id)
    : [];

  const purchaseOrderIds: string[] = supplierIds.length
    ? (
        await ds.query(
          `SELECT id FROM purchase_orders WHERE "supplierId" = ANY($1)`,
          [supplierIds],
        )
      ).map((r: { id: string }) => r.id)
    : [];

  // --- payments (RESTRICT toward both sales_orders and customers) ---
  if (salesOrderIds.length) {
    await ds.query(`DELETE FROM payments WHERE "salesOrderId" = ANY($1)`, [
      salesOrderIds,
    ]);
    await ds.query(
      `DELETE FROM sales_order_payments WHERE "salesOrderId" = ANY($1)`,
      [salesOrderIds],
    );
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

  // --- vendor payments (NO ACTION toward both parents) ---
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

  // --- orders ---
  if (salesOrderIds.length) {
    await ds.query(`DELETE FROM sales_orders WHERE id = ANY($1)`, [
      salesOrderIds,
    ]);
  }
  if (purchaseOrderIds.length) {
    await ds.query(`DELETE FROM purchase_orders WHERE id = ANY($1)`, [
      purchaseOrderIds,
    ]);
  }

  // --- suite-owned headers, before products ---
  //
  // Order matters: stock_adjustment_items.productId is RESTRICT, so deleting
  // the header (which CASCADEs to its items) must happen before the products
  // DELETE below. Doing it after would leave the header orphaned AND could
  // block the product delete.
  if (stockAdjustmentIds.length) {
    await ds.query(`DELETE FROM stock_adjustments WHERE id = ANY($1)`, [
      stockAdjustmentIds,
    ]);
  }
  if (priceListIds.length) {
    // customers.priceListId is SET NULL, so an unrelated customer pointing at
    // this list is nulled rather than deleted. price_list_items CASCADEs.
    await ds.query(`DELETE FROM price_lists WHERE id = ANY($1)`, [
      priceListIds,
    ]);
  }

  // --- product dependents that RESTRICT ---
  //
  // Line items are reached through TWO independent roots: the order (supplier /
  // customer) and the product (category). A suite can own the product via its
  // category while the order belongs to a supplier it does not own — purchasing
  // does exactly this. Scoping these by order id alone left the rows behind and
  // the products DELETE then hit
  //   FK_f87b1b82a3aff16d1cb5e49a656 ... violates RESTRICT
  // rather than leaking silently, which is why the RESTRICT edges are worth
  // keeping.
  if (productIds.length) {
    await ds.query(
      `DELETE FROM purchase_order_items WHERE "productId" = ANY($1)`,
      [productIds],
    );
    await ds.query(
      `DELETE FROM sales_order_items WHERE "productId" = ANY($1)`,
      [productIds],
    );
    await ds.query(`DELETE FROM stock_movements WHERE "productId" = ANY($1)`, [
      productIds,
    ]);
    await ds.query(
      `DELETE FROM stock_adjustment_items WHERE "productId" = ANY($1)`,
      [productIds],
    );
    await ds.query(
      `DELETE FROM owner_equity_documents WHERE "productId" = ANY($1)`,
      [productIds],
    );
    await ds.query(`DELETE FROM price_list_items WHERE "productId" = ANY($1)`, [
      productIds,
    ]);
    await ds.query(
      `DELETE FROM purchase_cost_history WHERE "productId" = ANY($1)`,
      [productIds],
    );
    await ds.query(`DELETE FROM products WHERE id = ANY($1)`, [productIds]);
  }

  // --- roots ---
  if (customerIds.length) {
    await ds.query(`DELETE FROM customers WHERE id = ANY($1)`, [customerIds]);
  }
  if (supplierIds.length) {
    await ds.query(`DELETE FROM suppliers WHERE id = ANY($1)`, [supplierIds]);
  }
  if (categoryIds.length) {
    // categories.parentId CASCADEs, so children go with the roots.
    await ds.query(`DELETE FROM categories WHERE id = ANY($1)`, [categoryIds]);
  }
}
