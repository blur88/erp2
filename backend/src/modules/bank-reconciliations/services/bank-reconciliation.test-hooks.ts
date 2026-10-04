import { EntityManager } from 'typeorm';

export const RECONCILIATION_TEST_HOOK = Symbol('RECONCILIATION_TEST_HOOK');

export type ReconciliationTestPhase = 'afterLocks' | 'beforeSnapshot' | 'afterSnapshot';

export type ReconciliationTestHook = (
  phase: ReconciliationTestPhase,
  ctx: { reconciliationId: string | null; manager: EntityManager },
) => Promise<void>;
