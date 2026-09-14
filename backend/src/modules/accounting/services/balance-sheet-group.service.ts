import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BalanceSheetAccountGroup } from '../entities/balance-sheet-account-group.entity';
import { AccountingSettings } from '../entities/accounting-settings.entity';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountType } from '../entities/account-type.enum';
import {
  BalanceSheetGroup,
  assertNoLineConflicts,
  type GroupAssignment,
} from './balance-sheet-groups.resolve';

export interface BalanceSheetGroupRow {
  accountId: string;
  group: BalanceSheetGroup;
  accountCode: string | null;
  accountName: string | null;
  /** 'invalid' when the account no longer satisfies the eligibility rules. */
  status: 'ok' | 'invalid';
  invalidReason: 'inactive' | 'not postable' | 'deleted' | 'missing' | 'wrong type' | null;
}

/**
 * Locks the accounting_settings singleton, then runs `work` inside that
 * transaction.
 *
 * Both Balance Sheet write paths — group replacement and a settings update —
 * must serialize against each other, because each validates against state the
 * other can change. Without the lock both read pre-change state, both pass
 * validation, and both commit, landing exactly the two-line assignment the
 * rule exists to forbid.
 *
 * The settings row is the lock token because it is the one row BOTH paths
 * touch, it always exists (the singleton is created by migration), and taking
 * it first gives a single, consistent lock order. It is exported so
 * AccountingSettingsService uses the identical primitive rather than a second
 * expression that agrees today.
 */
export async function withBalanceSheetConfigLock<T>(
  dataSource: DataSource,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    const locked = await manager
      .getRepository(AccountingSettings)
      .createQueryBuilder('s')
      .setLock('pessimistic_write')
      .where('s.id = :id', { id: true })
      .getOne();
    if (!locked) {
      throw new BadRequestException(
        'Accounting settings row is missing (migration not applied?)',
      );
    }
    return work(manager);
  });
}

/** The post-write settings values the conflict rule needs. */
export const settingsAccountIdsOf = (
  settings: AccountingSettings,
): Record<string, string | null> => ({
  cashAccountId: (settings as any).cashAccountId ?? null,
  bankAccountId: (settings as any).bankAccountId ?? null,
  inventoryAccountId: (settings as any).inventoryAccountId ?? null,
  supplierDepositAccountId: (settings as any).supplierDepositAccountId ?? null,
});

@Injectable()
export class BalanceSheetGroupService {
  constructor(
    @InjectRepository(BalanceSheetAccountGroup)
    private readonly groupRepo: Repository<BalanceSheetAccountGroup>,
    @InjectRepository(ChartOfAccount)
    private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private classify(
    account: ChartOfAccount | null | undefined,
  ): BalanceSheetGroupRow['invalidReason'] {
    if (!account) return 'missing';
    if ((account as any).deletedAt) return 'deleted';
    if (!account.isActive) return 'inactive';
    if (!account.isPostable) return 'not postable';
    if (account.type !== AccountType.ASSET) return 'wrong type';
    return null;
  }

  /**
   * Every grouped account, flagged if it has since become ineligible.
   *
   * Read withDeleted — the OPPOSITE of the report path — so a soft-deleted
   * grouped account still displays, flagged, rather than vanishing from the
   * settings screen while the row lives on.
   */
  async list(): Promise<BalanceSheetGroupRow[]> {
    const [groups, accounts] = await Promise.all([
      this.groupRepo.find(),
      this.coaRepo.find({ withDeleted: true } as any),
    ]);
    const byId = new Map((accounts as any[]).map((a) => [a.id, a]));

    return groups
      .map((g) => {
        const account = byId.get(g.accountId);
        const reason = this.classify(account);
        return {
          accountId: g.accountId,
          group: g.groupLine,
          accountCode: account?.code ?? null,
          accountName: account?.name ?? null,
          status: reason ? ('invalid' as const) : ('ok' as const),
          invalidReason: reason,
        };
      })
      .sort((a, b) => (a.accountCode ?? '').localeCompare(b.accountCode ?? ''));
  }

  /**
   * REPLACES the complete set of groupings.
   *
   * Replacement, not patch: the UI is a picker where removing an account is a
   * first-class action, and there is no other way to express a removal. An
   * empty array therefore clears every grouping and re-arms both fallbacks —
   * which is a legitimate configuration, and one the conflict rule still has
   * to validate (emptying a group can CREATE a conflict).
   *
   * Validate-all-then-write, inside the config lock.
   */
  async setGroups(items: GroupAssignment[]): Promise<BalanceSheetGroupRow[]> {
    await withBalanceSheetConfigLock(this.dataSource, async (manager) => {
      const coaRepo = manager.getRepository(ChartOfAccount);
      const groupRepo = manager.getRepository(BalanceSheetAccountGroup);
      const settingsRepo = manager.getRepository(AccountingSettings);

      // Phase 1 — validate everything before any write.
      const seen = new Set<string>();
      for (const item of items) {
        if (seen.has(item.accountId)) {
          throw new BadRequestException(
            `Account ${item.accountId} appears more than once. An account may ` +
              `belong to only one Balance Sheet group.`,
          );
        }
        seen.add(item.accountId);
      }

      const accounts = await coaRepo.find({ withDeleted: true } as any);
      const byId = new Map((accounts as any[]).map((a) => [a.id, a]));

      for (const item of items) {
        const account = byId.get(item.accountId);
        const reason = this.classify(account);
        if (reason === 'missing') {
          throw new BadRequestException(`Account ${item.accountId} not found`);
        }
        if (reason) {
          throw new BadRequestException(
            `Account '${account!.code} ${account!.name}' cannot be grouped ` +
              `because it is ${reason}. Only active, postable Asset accounts ` +
              `may be selected.`,
          );
        }
      }

      // The settings half of the post-write state. Read INSIDE the lock so a
      // concurrent settings update cannot slip between this read and the write.
      const settings = await settingsRepo.findOne({ where: { id: true } as any });
      assertNoLineConflicts(
        {
          settingsAccountIds: settingsAccountIdsOf(settings as AccountingSettings),
          groups: items,
        },
        (id) => {
          const a = byId.get(id);
          return a ? `${a.code} ${a.name}` : id;
        },
      );

      // Phase 2 — write. Delete-then-insert, never upsert: an account MOVING
      // between groups keeps its primary key, so an insert alone would collide
      // and a partial update would depend on statement order.
      await groupRepo.delete({});
      if (items.length > 0) {
        await groupRepo.insert(
          items.map((i) => ({ accountId: i.accountId, groupLine: i.group })) as any,
        );
      }
    });

    return this.list();
  }

  /** The report's view: group -> member account ids. */
  async getGroupedAccountIds(): Promise<Record<BalanceSheetGroup, string[]>> {
    const groups = await this.groupRepo.find();
    const result = {
      [BalanceSheetGroup.BANK_BALANCE]: [] as string[],
      [BalanceSheetGroup.OTHER_CURRENT_ASSETS]: [] as string[],
    };
    for (const g of groups) result[g.groupLine].push(g.accountId);
    return result;
  }
}
