import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  AccountType,
  ChartOfAccount,
} from "../../../database/entities/chart-of-account.entity";
import {
  JournalEntry,
  JournalEntryStatus,
} from "../../../database/entities/journal-entry.entity";
import { JournalEntryLine } from "../../../database/entities/journal-entry-line.entity";

export type DateFilter =
  | { type: "asOf"; date: Date }
  | { type: "range"; startDate: Date; endDate: Date }
  | { type: "before"; date: Date };

@Injectable()
export class AccountingReportsQueryHelper {
  private readonly logger = new Logger(AccountingReportsQueryHelper.name);

  constructor(
    @InjectRepository(ChartOfAccount)
    private readonly accountRepository: Repository<ChartOfAccount>,
    @InjectRepository(JournalEntry)
    private readonly journalEntryRepository: Repository<JournalEntry>,
    @InjectRepository(JournalEntryLine)
    private readonly journalEntryLineRepository: Repository<JournalEntryLine>,
  ) {}

  async queryTransactionTotals(
    accountIds: string[],
    dateFilter: DateFilter,
    statuses: JournalEntryStatus[],
  ): Promise<Map<string, { totalDebit: number; totalCredit: number }>> {
    if (!accountIds || accountIds.length === 0) {
      return new Map();
    }

    const qb = this.journalEntryLineRepository
      .createQueryBuilder("jel")
      .leftJoin("jel.journalEntry", "je")
      .select("jel.accountId", "accountId")
      .addSelect("SUM(jel.debitAmount)", "totalDebit")
      .addSelect("SUM(jel.creditAmount)", "totalCredit")
      .where("jel.accountId IN (:...accountIds)", { accountIds })
      .andWhere("je.status IN (:...statuses)", { statuses })
      .groupBy("jel.accountId");

    if (dateFilter.type === "asOf") {
      qb.andWhere("je.entryDate <= :date", { date: dateFilter.date });
    } else if (dateFilter.type === "range") {
      qb.andWhere("je.entryDate >= :startDate", {
        startDate: dateFilter.startDate,
      });
      qb.andWhere("je.entryDate <= :endDate", { endDate: dateFilter.endDate });
    } else {
      qb.andWhere("je.entryDate < :date", { date: dateFilter.date });
    }

    const rows = await qb.getRawMany();
    const result = new Map<
      string,
      { totalDebit: number; totalCredit: number }
    >();

    for (const row of rows) {
      result.set(row.accountId, {
        totalDebit: parseFloat(row.totalDebit || "0"),
        totalCredit: parseFloat(row.totalCredit || "0"),
      });
    }

    return result;
  }

  calculateBalanceByAccountType(
    accountType: AccountType,
    totalDebit: number,
    totalCredit: number,
  ): number {
    switch (accountType) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        return this.roundTo2Decimals(totalDebit - totalCredit);
      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
        return this.roundTo2Decimals(totalCredit - totalDebit);
      default:
        this.logger.warn(
          `Unknown account type: ${accountType}, defaulting to Debit - Credit`,
        );
        return this.roundTo2Decimals(totalDebit - totalCredit);
    }
  }

  roundTo2Decimals(num: number): number {
    return Math.round(num * 100) / 100;
  }
}
