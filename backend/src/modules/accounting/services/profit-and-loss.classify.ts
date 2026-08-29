import {
  detectCycles, detectDanglingParents, isDescendantOf, findRoot, type GraphNode,
} from './profit-and-loss.graph';
import { formatScale4 } from '@/common/utils/money';
import type {
  AccountMovement, MovementComponent, PlAccount, PlAccountRow, PlAssignmentAnomaly,
  PlSection, PlStructuralFault, SectionKey,
} from './profit-and-loss.types';

export interface ClassifyInput {
  accounts: PlAccount[];
  movements: AccountMovement[];
  salesRevenueAccountId: string | null;
  cogsAccountId: string | null;
}

export interface ClassifyResult {
  assignments: Map<SectionKey, Map<string, bigint>>;
  inventoryAdjustments: bigint;
  anomalies: PlAssignmentAnomaly[];
  structuralFaults: PlStructuralFault[];
}

const SECTION_KEYS: SectionKey[] = ['revenue', 'cogs', 'otherIncome', 'expenses'];

/**
 * Audit the COMPLETED assignment maps against the movements that were
 * expected to land in them (spec §7.3).
 *
 * This must re-derive occupancy from `assignments` rather than trust a counter
 * incremented at the assignment site — such a counter is tautological: it can
 * only ever read 1 for anything it touched, so it can never report a
 * double-count. Scanning the finished maps is what makes >= 2 reachable.
 *
 * Only Income/Expense accounts are audited. Asset and Equity movements (a
 * stock adjustment's Inventory leg, an owner drawing) legitimately belong to
 * no P&L section and are not anomalies.
 */
export function auditAssignments(input: {
  accounts: PlAccount[];
  movements: AccountMovement[];
  assignments: Map<SectionKey, Map<string, bigint>>;
  counts: Map<string, number>;
  describe: (id: string) => { code: string; name: string };
}): PlAssignmentAnomaly[] {
  const { accounts, movements, assignments, counts, describe } = input;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const anomalies: PlAssignmentAnomaly[] = [];

  // How many SECTIONS actually hold a given account, read from the maps.
  const sectionsHolding = (accountId: string): number =>
    SECTION_KEYS.reduce(
      (n, k) => n + (assignments.get(k)?.has(accountId) ? 1 : 0),
      0,
    );

  for (const m of movements) {
    const account = byId.get(m.accountId);
    const isPl = account?.type === 'Income' || account?.type === 'Expense';

    // Ordinary component: expected in exactly one section.
    if (m.ordinary !== 0n) {
      if (!isPl) {
        // A P&L-relevant amount on a non-P&L account: nothing will show it.
        if (account === undefined) {
          anomalies.push({
            accountId: m.accountId, ...describe(m.accountId),
            component: 'ordinary', count: 0,
          });
        }
      } else {
        const count = sectionsHolding(m.accountId);
        if (count !== 1) {
          anomalies.push({
            accountId: m.accountId, ...describe(m.accountId),
            component: 'ordinary', count,
          });
        }
      }
    }

    // Stock-adjustment component: expected to be claimed exactly once, and
    // only on an Expense account. On Asset/Equity accounts it is the balancing
    // leg and is correctly ignored.
    if (m.stockAdjustment !== 0n && account?.type === 'Expense') {
      const count = counts.get(`${m.accountId}::stockAdjustment`) ?? 0;
      if (count !== 1) {
        anomalies.push({
          accountId: m.accountId, ...describe(m.accountId),
          component: 'stockAdjustment', count,
        });
      }
    }
  }

  return anomalies;
}

/**
 * Classification owns ALL arithmetic (spec §4.1.1). Grouping is presentation
 * only and re-reads these assignments — it never re-walks balances, which is
 * what would let an excluded subtree leak back into a sibling section.
 *
 * Order matters: stock adjustments are claimed FIRST and exclusively (§4.2),
 * so the outcome does not depend on whether cogsAccountId and
 * defaultExpenseAccountId happen to point at the same account.
 */
export function classify(input: ClassifyInput): ClassifyResult {
  const { accounts, movements, salesRevenueAccountId, cogsAccountId } = input;

  const byId = new Map<string, PlAccount>(accounts.map((a) => [a.id, a]));
  const graph = new Map<string, GraphNode>(
    accounts.map((a) => [a.id, { id: a.id, parentId: a.parentId }]),
  );

  const assignments = new Map<SectionKey, Map<string, bigint>>(
    SECTION_KEYS.map((k) => [k, new Map<string, bigint>()]),
  );

  // (accountId, component) -> times claimed. Counting per ACCOUNT would
  // false-positive on 6990, which legitimately holds ordinary expenses and
  // stock adjustments routed to two different rows.
  //
  // These counters are only half the audit: incremented at the assignment
  // site, they can never exceed 1. `auditAssignments` below re-derives the
  // truth from the COMPLETED assignment maps, which is what can actually
  // catch a component landing in two sections.
  const counts = new Map<string, number>();
  const key = (id: string, c: MovementComponent) => `${id}::${c}`;
  const bump = (id: string, c: MovementComponent) =>
    counts.set(key(id, c), (counts.get(key(id, c)) ?? 0) + 1);

  let inventoryAdjustments = 0n;

  for (const m of movements) {
    const account = byId.get(m.accountId);
    // Not in the chart, or not a P&L account type: this report does not
    // classify it. Asset and Equity movements are IGNORED, never anomalies —
    // a stock adjustment's Inventory side is an Asset movement and is simply
    // not our business.
    if (!account) continue;
    const isIncome = account.type === 'Income';
    const isExpense = account.type === 'Expense';
    if (!isIncome && !isExpense) continue;

    // 1. Stock adjustments: claimed first, exclusively — and only the
    // EXPENSE side. The journal is balanced (Dr Inventory / Cr Expense, or
    // the reverse), so summing this component across every account would be
    // identically zero. Only the Expense leg is a cost.
    if (isExpense && m.stockAdjustment !== 0n) {
      inventoryAdjustments += m.stockAdjustment;
      bump(m.accountId, 'stockAdjustment');
    }

    if (m.ordinary === 0n) continue;

    // 2. Ordinary movement: exactly one section, by type then subtree.
    const section: SectionKey = isIncome
      ? (salesRevenueAccountId && isDescendantOf(account.id, salesRevenueAccountId, graph)
          ? 'revenue' : 'otherIncome')
      : (cogsAccountId && isDescendantOf(account.id, cogsAccountId, graph)
          ? 'cogs' : 'expenses');

    const bucket = assignments.get(section)!;
    bucket.set(account.id, (bucket.get(account.id) ?? 0n) + m.ordinary);
    bump(account.id, 'ordinary');
  }

  const describe = (id: string) => {
    const a = byId.get(id);
    return { code: a?.code ?? '(unknown)', name: a?.name ?? '(unknown account)' };
  };
  const anomalies = auditAssignments({
    accounts, movements, assignments, counts, describe,
  });

  // Structural faults: configuration problems that tie out cleanly and would
  // otherwise go unnoticed (spec §7.3).
  const structuralFaults: PlStructuralFault[] = [];
  // Existence is not enough: a pointer aimed at the WRONG TYPE silently
  // empties its section. A salesRevenueAccountId pointing at an Expense
  // account puts all Income into Other Income and still ties out perfectly.
  const settingChecks: Array<[string, string | null, string]> = [
    ['salesRevenueAccountId', salesRevenueAccountId, 'Income'],
    ['cogsAccountId', cogsAccountId, 'Expense'],
  ];
  for (const [settingKey, value, expectedType] of settingChecks) {
    const target = value ? byId.get(value) : undefined;
    if (!target || target.type !== expectedType) {
      structuralFaults.push({ kind: 'missingConfiguredAccount', settingKey, accounts: [] });
    }
  }

  const graphNodes = [...graph.values()];
  const dangling = detectDanglingParents(graphNodes);
  if (dangling.length > 0) {
    structuralFaults.push({
      kind: 'danglingParent', settingKey: null,
      accounts: dangling.map((id) => ({ accountId: id, ...describe(id) })),
    });
  }
  const cycles = detectCycles(graphNodes);
  if (cycles.length > 0) {
    structuralFaults.push({
      kind: 'parentCycle', settingKey: null,
      accounts: cycles.map((id) => ({ accountId: id, ...describe(id) })),
    });
  }

  return { assignments, inventoryAdjustments, anomalies, structuralFaults };
}

const SECTION_LABELS: Record<SectionKey, string> = {
  revenue: 'Revenue',
  cogs: 'Cost of Sales',
  otherIncome: 'Other Income',
  expenses: 'Operating Expenses',
};

/**
 * Presentation only (spec §4.1.1 Step 2). Values come from `assignments`,
 * which classification already computed — this NEVER re-walks account
 * balances, which is what would let an excluded subtree leak back in.
 *
 * A category is the first branch BELOW the section's top-level root. Anchoring
 * on "the top-most classified account" would be wrong: the six top-level
 * groups are non-postable (accounting-seeder sets isPostable = parentId !==
 * null), so they never appear in the classified set.
 */
export function assembleSections(
  accounts: PlAccount[],
  assignments: Map<SectionKey, Map<string, bigint>>,
): PlSection[] {
  const byId = new Map<string, PlAccount>(accounts.map((a) => [a.id, a]));
  const graph = new Map<string, GraphNode>(
    accounts.map((a) => [a.id, { id: a.id, parentId: a.parentId }]),
  );

  /** The ancestor of `id` that sits directly below its root, or `id` itself. */
  const categoryAncestorOf = (id: string): string => {
    const { rootId } = findRoot(id, graph);
    if (rootId === id) return id;

    const seen = new Set<string>();
    let current = id;
    for (;;) {
      if (seen.has(current)) return current; // cycle-safe
      seen.add(current);
      const parentId = byId.get(current)?.parentId ?? null;
      if (parentId === null || parentId === rootId || !byId.has(parentId)) return current;
      current = parentId;
    }
  };

  const toRow = (accountId: string, amount: bigint, children: PlAccountRow[]): PlAccountRow => {
    const a = byId.get(accountId);
    return {
      rowId: `account:${accountId}`,
      accountId,
      code: a?.code ?? '(unknown)',
      name: a?.name ?? '(unknown account)',
      isPostable: a?.isPostable ?? true,
      amount: formatScale4(amount),
      children,
    };
  };

  const byCode = (x: { code: string }, y: { code: string }) => x.code.localeCompare(y.code);

  return SECTION_KEYS.map((key) => {
    const classified = assignments.get(key) ?? new Map<string, bigint>();

    // Group each classified contribution under its category ancestor.
    const grouped = new Map<string, Map<string, bigint>>();
    for (const [accountId, amount] of classified) {
      const categoryId = categoryAncestorOf(accountId);
      if (!grouped.has(categoryId)) grouped.set(categoryId, new Map());
      const bucket = grouped.get(categoryId)!;
      bucket.set(accountId, (bucket.get(accountId) ?? 0n) + amount);
    }

    let total = 0n;
    const rows: PlAccountRow[] = [];

    for (const [categoryId, contributions] of grouped) {
      const categoryTotal = [...contributions.values()].reduce((s, v) => s + v, 0n);
      total += categoryTotal;

      const category = byId.get(categoryId);
      // A postable category IS the drill-through row — never list it as its own
      // child, which would render 6990 twice with the same figure.
      const children = category?.isPostable
        ? []
        : [...contributions.entries()]
            .map(([id, amt]) => toRow(id, amt, []))
            .sort(byCode);

      rows.push(toRow(categoryId, categoryTotal, children));
    }

    rows.sort(byCode);

    return {
      rowId: `${key}.section`,
      key,
      label: SECTION_LABELS[key],
      rows,
      total: formatScale4(total),
      totalRowId: `${key}.total`,
    };
  });
}
