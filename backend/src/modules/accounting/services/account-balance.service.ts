import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { JournalEntryLine } from '../entities/journal-entry-line.entity';
import { AccountType } from '../entities/account-type.enum';
import { toMinorUnits } from '../utils/money';

const CREDIT_NORMAL = new Set([AccountType.LIABILITY, AccountType.EQUITY, AccountType.INCOME]);

@Injectable()
export class AccountBalanceService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(JournalEntryLine) private readonly lineRepo: Repository<JournalEntryLine>,
  ) {}

  naturalBalance(type: AccountType, rawDebitMinusCredit: bigint): bigint {
    return CREDIT_NORMAL.has(type) ? -rawDebitMinusCredit : rawDebitMinusCredit;
  }

  async getLeafBalances(asOfDate?: string): Promise<Map<string, bigint>> {
    const qb = this.lineRepo.createQueryBuilder('l')
      .innerJoin('journal_entry', 'e', 'e.id = l."entryId"')
      .select('l."accountId"', 'accountId')
      .addSelect('COALESCE(SUM(l.debit),0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit),0)', 'credit')
      .where('l."deletedAt" IS NULL')
      .andWhere('e."deletedAt" IS NULL')
      .groupBy('l."accountId"');
    if (asOfDate) qb.andWhere('e."entryDate" <= :asOfDate', { asOfDate });
    const rows = await qb.getRawMany<{ accountId: string; debit: string; credit: string }>();
    const map = new Map<string, bigint>();
    for (const r of rows) {
      map.set(r.accountId, toMinorUnits(r.debit) - toMinorUnits(r.credit));
    }
    return map;
  }

  getRollup(accountId: string, leafBalances: Map<string, bigint>, accounts: { id: string; parentId: string | null }[]): bigint {
    const childrenOf = (pid: string) => accounts.filter((a) => a.parentId === pid);
    let total = leafBalances.get(accountId) ?? 0n;
    for (const child of childrenOf(accountId)) {
      total += this.getRollup(child.id, leafBalances, accounts);
    }
    return total;
  }
}
