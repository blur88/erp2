import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { JournalEntryLine } from '../entities/journal-entry-line.entity';
import { AccountBalanceService } from './account-balance.service';
import { formatScale4, toMinorUnits } from '../utils/money';

@Injectable()
export class GeneralLedgerService {
  constructor(
    @InjectRepository(ChartOfAccount) private readonly coaRepo: Repository<ChartOfAccount>,
    @InjectRepository(JournalEntryLine) private readonly lineRepo: Repository<JournalEntryLine>,
    private readonly balance: AccountBalanceService,
  ) {}

  async getLedger(params: { accountId: string; fromDate?: string; toDate?: string; sourceType?: string }) {
    const account = await this.coaRepo.findOne({ where: { id: params.accountId } as any });
    if (!account) throw new BadRequestException('Account not found');

    // Opening balance: raw debit-credit for entries strictly before fromDate.
    let openingRaw = 0n;
    if (params.fromDate) {
      const openRows = await this.lineRepo.createQueryBuilder('l')
        .innerJoin('journal_entry', 'e', 'e.id = l."entryId"')
        .select('COALESCE(SUM(l.debit),0)', 'debit')
        .addSelect('COALESCE(SUM(l.credit),0)', 'credit')
        .where('l."accountId" = :accountId', { accountId: params.accountId })
        .andWhere('l."deletedAt" IS NULL')
        .andWhere('e."deletedAt" IS NULL')
        .andWhere('e."entryDate" < :fromDate', { fromDate: params.fromDate })
        .getRawOne<{ debit: string; credit: string }>();
      openingRaw = toMinorUnits(openRows!.debit) - toMinorUnits(openRows!.credit);
    }

    const qb = this.lineRepo.createQueryBuilder('l')
      .innerJoinAndMapOne('l.entry', 'journal_entry', 'e', 'e.id = l."entryId"')
      .where('l."accountId" = :accountId', { accountId: params.accountId })
      .andWhere('l."deletedAt" IS NULL')
      .andWhere('e."deletedAt" IS NULL');
    if (params.fromDate) qb.andWhere('e."entryDate" >= :fromDate', { fromDate: params.fromDate });
    if (params.toDate) qb.andWhere('e."entryDate" <= :toDate', { toDate: params.toDate });
    if (params.sourceType && params.sourceType !== 'All') qb.andWhere('e."sourceType" = :st', { st: params.sourceType });
    qb.orderBy('e."entryDate"', 'ASC').addOrderBy('e."createdAt"', 'ASC')
      .addOrderBy('e."journalNo"', 'ASC').addOrderBy('l.id', 'ASC');
    const rows = await qb.getRawAndEntities();

    let running = this.balance.naturalBalance(account.type, openingRaw);
    let totalDebit = 0n, totalCredit = 0n;
    const movements = rows.entities.map((l: any) => {
      const raw = toMinorUnits(l.debit) - toMinorUnits(l.credit);
      totalDebit += toMinorUnits(l.debit); totalCredit += toMinorUnits(l.credit);
      running += this.balance.naturalBalance(account.type, raw);
      return {
        date: l.entry.entryDate, journalEntryId: l.entry.id, journalNo: l.entry.journalNo, description: l.entry.description,
        debit: l.debit, credit: l.credit, balance: formatScale4(running),
        sourceType: l.entry.sourceType, sourceDocumentId: l.entry.sourceDocumentId, sourceRef: l.entry.sourceRef,
      };
    });
    const openingNatural = this.balance.naturalBalance(account.type, openingRaw);
    return {
      account: { id: account.id, code: account.code, name: account.name },
      openingBalance: formatScale4(openingNatural),
      movements,
      totalDebit: formatScale4(totalDebit), totalCredit: formatScale4(totalCredit),
      closingBalance: formatScale4(running),
    };
  }
}
