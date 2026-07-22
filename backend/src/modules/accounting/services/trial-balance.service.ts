import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { AccountBalanceService } from './account-balance.service';
import { formatScale4 } from '../utils/money';

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  debit: string;
  credit: string;
}

export interface TrialBalanceResponse {
  rows: TrialBalanceRow[];
  totalDebit: string;
  totalCredit: string;
  difference: string;
  balanced: boolean;
}

@Injectable()
export class TrialBalanceService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    private readonly balance: AccountBalanceService,
  ) {}

  classify(rawDebitMinusCredit: bigint): { debit: string; credit: string } {
    return rawDebitMinusCredit >= 0n
      ? { debit: formatScale4(rawDebitMinusCredit), credit: '0.0000' }
      : { debit: '0.0000', credit: formatScale4(-rawDebitMinusCredit) };
  }

  assemble(
    accounts: ChartOfAccount[],
    leaf: Map<string, bigint>,
    showZero: boolean,
  ): TrialBalanceResponse {
    const rows: TrialBalanceRow[] = [];
    let totalDebit = 0n, totalCredit = 0n;
    for (const a of accounts) {
      if (!a.isPostable) continue;
      const raw = leaf.get(a.id) ?? 0n;
      if (raw === 0n && !showZero) continue;
      const { debit, credit } = this.classify(raw);
      if (raw >= 0n) totalDebit += raw; else totalCredit += -raw;
      rows.push({ accountId: a.id, code: a.code, name: a.name, debit, credit });
    }
    return {
      rows, totalDebit: formatScale4(totalDebit), totalCredit: formatScale4(totalCredit),
      difference: formatScale4(totalDebit - totalCredit), balanced: totalDebit === totalCredit,
    };
  }

  async getTrialBalance(
    params: { asOfDate?: string; showZero?: boolean },
  ): Promise<TrialBalanceResponse> {
    const accounts = await this.coaRepo.find({ order: { code: 'ASC' } });
    const leaf = await this.balance.getLeafBalances(params.asOfDate);
    return this.assemble(accounts, leaf, !!params.showZero);
  }
}
