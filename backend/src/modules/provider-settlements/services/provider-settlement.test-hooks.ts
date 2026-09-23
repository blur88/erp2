import type { EntityManager } from 'typeorm';

/**
 * Internal synchronization points for the real-Postgres concurrency tests
 * (#1284). Not exported from the module, not reachable over HTTP, and inert
 * unless a test assigns a function to this symbol on the service instance.
 *
 * - afterSalesOrderLock: the FOR SHARE locks are held; eligibility not yet read.
 * - afterRecompute: every requested group passed stale validation; no document
 *   number generated and no claim line inserted yet.
 *
 * `manager` is the settlement's transaction manager, so a test can read
 * pg_backend_pid() of the exact session holding the locks.
 */
export const SETTLEMENT_TEST_HOOK: unique symbol = Symbol('providerSettlementTestHook');
export type SettlementTestPhase = 'afterSalesOrderLock' | 'afterRecompute';
export type SettlementTestHook = (
  phase: SettlementTestPhase,
  ctx: { salesOrderIds: string[]; manager: EntityManager },
) => Promise<void>;
