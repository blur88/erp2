/*
 * This barrel deliberately mirrors the folder's public surface in full, the
 * way src/types/index.ts mirrors its modules. Only `Statement` and
 * `StatementRow` currently have consumers outside this folder; the rest are
 * used internally via relative imports (StatementRow.tsx, the test suite) or
 * inside their own module (types.ts, Statement.tsx).
 *
 * Knip therefore reports the re-export lines below as dead. Trimming them to
 * satisfy static analysis would leave an arbitrary hole that the next
 * contributor fills back in, so the finding is suppressed in knip.json
 * instead — see the `ignoreIssues` entry for this file, and the same
 * trade-off argued at length in fcefef005.
 *
 * That suppression is scoped to this FILE and to the `exports`/`types`
 * CATEGORIES — it is not symbol-level. A genuinely dead export added to this
 * barrel later will NOT be reported. Weigh that before adding one; other
 * files are unaffected and still report unused exports normally.
 */
export { Statement } from './Statement'
export { StatementFigure, splitFormattedAmount } from './StatementFigure'
export type { StatementRow, StatementRowKind, StatementProps } from './types'
