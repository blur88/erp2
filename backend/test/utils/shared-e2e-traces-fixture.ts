import { DataSource } from "typeorm";

/**
 * Own-traces cleanup for request-driven side effects (issue #1204).
 *
 * Fixture rows (users, products, orders, …) are covered by
 * `shared-e2e-fixture.ts` (`seedSuiteAdmin` / `removeSuiteAdmin`) and
 * `shared-e2e-business-fixture.ts` (`resetSuiteBusinessRows`). What those do
 * NOT cover is the exhaust a suite's HTTP requests leave behind:
 *
 * - `audit_logs` — domain services log every CREATE/UPDATE/PAYMENT/… with the
 *   acting user's id/username (or no actor for system-attributed writes).
 * - `search_queries` — every global-search request records a row keyed by the
 *   searching user's id.
 *
 * `refresh_tokens` needs no handling here: `RefreshToken.userId` is
 * `onDelete: CASCADE`, so removing the suite's users (which every suite
 * already does) deletes its tokens.
 *
 * All deletes are scoped to ids/usernames the suite owns — never a bare
 * `username = 'admin'`, which is shared across suites. Prefer `entityIds`
 * (audit rows carry the acted-on row's id in `entityId`) wherever the actor
 * attribution is system/null rather than the suite's user.
 */
export interface SuiteTraceScope {
  /** Suite-owned user ids (uuid strings). Covers `search_queries` + user-attributed audits. */
  userIds?: string[];
  /** Suite-owned usernames. Covers username-attributed audit rows. */
  usernames?: string[];
  /** Suite-owned entity ids. Covers system-attributed audit rows by acted-on row. */
  entityIds?: string[];
}

export async function removeSuiteTraces(
  ds: DataSource,
  scope: SuiteTraceScope,
): Promise<void> {
  const userIds = [...new Set(scope.userIds ?? [])];
  const usernames = [...new Set(scope.usernames ?? [])];
  const entityIds = [...new Set(scope.entityIds ?? [])];

  if (entityIds.length) {
    await ds.query(`DELETE FROM audit_logs WHERE "entityId" = ANY($1)`, [
      entityIds,
    ]);
  }

  if (userIds.length) {
    // search_clicks references search_queries NO ACTION: clicks first.
    // (No suite creates clicks today; this keeps the helper correct if one does.)
    await ds.query(
      `DELETE FROM search_clicks WHERE "search_query_id" IN (
         SELECT id FROM search_queries WHERE "user_id" = ANY($1)
       )`,
      [userIds],
    );
    await ds.query(`DELETE FROM search_queries WHERE "user_id" = ANY($1)`, [
      userIds,
    ]);
    await ds.query(`DELETE FROM audit_logs WHERE "userId" = ANY($1)`, [
      userIds,
    ]);
  }

  if (usernames.length) {
    await ds.query(`DELETE FROM audit_logs WHERE username = ANY($1)`, [
      usernames,
    ]);
  }
}
