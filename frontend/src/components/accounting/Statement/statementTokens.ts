/**
 * Handles for the statement colour tokens.
 *
 * NO COLOUR VALUES LIVE HERE. `statement.css` is authoritative (spec §3);
 * these are references, so there is exactly one copy of every value. Their
 * purpose is to give `sx` consumers a checked name — a typo'd
 * `var(--stmt-inkk)` fails silently to an inherited colour, and
 * `__tests__/statementTokens.test.ts` is what catches that.
 */
export const stmt = {
  paper: 'var(--stmt-paper)',
  paperEdge: 'var(--stmt-paper-edge)',
  ink: 'var(--stmt-ink)',
  inkMuted: 'var(--stmt-ink-muted)',
  rule: 'var(--stmt-rule)',
  ruleStrong: 'var(--stmt-rule-strong)',
  accent: 'var(--stmt-accent)',
  negative: 'var(--stmt-negative)',
  figureFont: 'var(--stmt-figure-font)',
} as const

export type StatementToken = keyof typeof stmt
