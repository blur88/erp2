// balance-sheet-groups.resolve.ts
import { BadRequestException } from '@nestjs/common';

/**
 * The two explicit Balance Sheet groups of issue #1239.
 *
 * Stored as the `groupLine` enum on balance_sheet_account_groups. The names are
 * the LHDN concepts, not the line codes, so a future taxonomy renumbering
 * changes BALANCE_SHEET_GROUP_LINE below and nothing else.
 */
export enum BalanceSheetGroup {
  BANK_BALANCE = 'BANK_BALANCE',
  OTHER_CURRENT_ASSETS = 'OTHER_CURRENT_ASSETS',
}

/** Group -> the LHDN line it populates. */
export const BALANCE_SHEET_GROUP_LINE: Record<BalanceSheetGroup, string> = {
  [BalanceSheetGroup.BANK_BALANCE]: 'N38',
  [BalanceSheetGroup.OTHER_CURRENT_ASSETS]: 'N39',
};

/**
 * The settings key each group REPLACES when it is non-empty, and falls back to
 * when it is empty. This pairing is the whole of the resolution rule, and it is
 * written down once so the report, the group writer and the settings writer
 * cannot disagree about it.
 */
export const GROUP_FALLBACK_SETTING: Record<BalanceSheetGroup, string> = {
  [BalanceSheetGroup.BANK_BALANCE]: 'bankAccountId',
  [BalanceSheetGroup.OTHER_CURRENT_ASSETS]: 'supplierDepositAccountId',
};

/**
 * Balance-sheet settings keys that have NO group of their own, so they always
 * resolve to their line. cashAccountId (N37) and inventoryAccountId (N34) are
 * unconditional: nothing can displace them, which is why an account in either
 * one can never also join a group.
 *
 * The other SETTINGS_KEY_LINE entries are deliberately absent. N44
 * (customerDepositAccountId) is a Liability and N46/N49 are Equity, so an
 * Asset-only group can never collide with them; listing them would imply a
 * check that Asset-type validation already makes unreachable.
 */
export const UNCONDITIONAL_SETTING_LINE: Record<string, string> = {
  cashAccountId: 'N37',
  inventoryAccountId: 'N34',
};

export interface GroupAssignment {
  accountId: string;
  group: BalanceSheetGroup;
}

export interface EffectiveLineInput {
  /** The POST-WRITE settings values, keyed as in AccountingSettings. */
  settingsAccountIds: Record<string, string | null | undefined>;
  /** The POST-WRITE complete set of group rows. */
  groups: GroupAssignment[];
}

/**
 * Account id -> the set of LHDN lines it effectively contributes to.
 *
 * This is the authoritative rule, and it is computed from post-write state
 * ONLY. Validating raw settings-key membership instead is what produced two
 * bugs in review:
 *
 *   1. It rejected supplierDepositAccountId from N39 and bankAccountId from
 *      N38 — SAME-line overlap, which is not a conflict at all and is exactly
 *      how an operator keeps the default contributor once a group replaces it.
 *   2. It rejected bankAccountId from N39 unconditionally. The bank fallback
 *      only contributes to N38 when the N38 group is EMPTY; a non-empty N38
 *      group that excludes bankAccountId leaves it free to belong to N39.
 *
 * Both fall out of computing effective assignment rather than pattern-matching
 * on which key an id appears under.
 */
export function effectiveLines(input: EffectiveLineInput): Map<string, Set<string>> {
  const { settingsAccountIds, groups } = input;
  const lines = new Map<string, Set<string>>();

  const add = (accountId: string | null | undefined, line: string) => {
    if (!accountId) return;
    const set = lines.get(accountId) ?? new Set<string>();
    set.add(line);
    lines.set(accountId, set);
  };

  for (const [key, line] of Object.entries(UNCONDITIONAL_SETTING_LINE)) {
    add(settingsAccountIds[key], line);
  }

  for (const group of Object.values(BalanceSheetGroup)) {
    const line = BALANCE_SHEET_GROUP_LINE[group];
    const members = groups.filter((g) => g.group === group);
    if (members.length > 0) {
      // Non-empty group REPLACES the fallback: the fallback account
      // contributes to this line only if it is itself a member.
      for (const member of members) add(member.accountId, line);
    } else {
      // Empty group re-arms the fallback. This is why emptying a group can
      // CREATE a conflict that did not exist before, and why validation must
      // run against post-write state.
      add(settingsAccountIds[GROUP_FALLBACK_SETTING[group]], line);
    }
  }

  return lines;
}

export interface ConflictAccountRef {
  accountId: string;
  code?: string;
  name?: string;
}

/**
 * Rejects any account that effectively contributes to MORE THAN ONE line.
 *
 * Shared by both write paths (group replacement and settings update) so a
 * change from either side is held to the same invariant. `describe` renders an
 * account for the message; it is optional because the pure rule does not need
 * the chart of accounts to decide anything.
 */
export function assertNoLineConflicts(
  input: EffectiveLineInput,
  describe?: (accountId: string) => string,
): void {
  const lines = effectiveLines(input);
  const conflicts: string[] = [];

  for (const [accountId, set] of lines) {
    if (set.size < 2) continue;
    const label = describe?.(accountId) ?? accountId;
    const sorted = [...set].sort();
    conflicts.push(`${label} would contribute to ${sorted.join(' and ')}`);
  }

  if (conflicts.length > 0) {
    throw new BadRequestException(
      `Balance Sheet grouping conflict: ${conflicts.join('; ')}. ` +
        `An account may contribute to only one Balance Sheet line.`,
    );
  }
}
