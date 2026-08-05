import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalEntry } from '../entities/journal-entry.entity';
import { JournalEntryLine } from '../entities/journal-entry-line.entity';
import { ListJournalEntriesDto } from '../dto/list-journal-entries.dto';
import { formatScale4, toMinorUnits } from '@/common/utils/money';

@Injectable()
export class JournalEntryService {
  constructor(
    @InjectRepository(JournalEntry) private readonly entryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalEntryLine) private readonly lineRepo: Repository<JournalEntryLine>,
  ) {}

  deriveStatus(_entry: JournalEntry, reversalExists: boolean): 'Posted' | 'Reversed' {
    return reversalExists ? 'Reversed' : 'Posted';
  }

  entryTotals(lines: { debit: string; credit: string }[]): { totalDebit: string; totalCredit: string; difference: string } {
    const d = lines.reduce((a, l) => a + toMinorUnits(l.debit), 0n);
    const c = lines.reduce((a, l) => a + toMinorUnits(l.credit), 0n);
    return { totalDebit: formatScale4(d), totalCredit: formatScale4(c), difference: formatScale4(d - c) };
  }

  async list(query: ListJournalEntriesDto): Promise<{ data: any[]; meta: any }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
      throw new BadRequestException('fromDate must not be after toDate');
    }

    const qb = this.entryRepo.createQueryBuilder('e')
      .leftJoinAndSelect('e.lines', 'l', 'l."deletedAt" IS NULL');

    if (query.search) {
      qb.andWhere(
        '(e."journalNo" ILIKE :search OR e."sourceRef" ILIKE :search OR e.description ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.fromDate) qb.andWhere('e."entryDate" >= :fromDate', { fromDate: query.fromDate });
    if (query.toDate) qb.andWhere('e."entryDate" <= :toDate', { toDate: query.toDate });
    if (query.sourceType) qb.andWhere('e."sourceType" = :sourceType', { sourceType: query.sourceType });

    if (query.status) {
      const sub = qb.subQuery()
        .select('1')
        .from(JournalEntry, 'r')
        .where('r."reversalOfEntryId" = e.id')
        .andWhere('r."deletedAt" IS NULL')
        .getQuery();
      qb.andWhere(query.status === 'Reversed' ? `EXISTS ${sub}` : `NOT EXISTS ${sub}`);
    }

    const sortColumns: Record<'journalNo', string> = { journalNo: 'e.journalNo' };
    const column = sortColumns[query.sortBy ?? 'journalNo'];
    const order = query.sortOrder ?? 'DESC';
    qb.orderBy(column, order).skip((page - 1) * limit).take(limit);
    const [entries, total] = await qb.getManyAndCount();
    // Which of these have a reversal pointing at them?
    const ids = entries.map((e) => e.id);
    const reversed = ids.length
      ? new Set((await this.entryRepo.find({ where: ids.map((id) => ({ reversalOfEntryId: id })) as any }))
          .map((r) => r.reversalOfEntryId as string))
      : new Set<string>();
    const data = entries.map((e) => {
      const totals = this.entryTotals(e.lines ?? []);
      return {
        id: e.id, journalNo: e.journalNo, date: e.entryDate, sourceRef: e.sourceRef,
        description: e.description, debit: totals.totalDebit, credit: totals.totalCredit,
        status: this.deriveStatus(e, reversed.has(e.id)),
      };
    });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string): Promise<any> {
    const entry = await this.entryRepo.findOne({
      where: { id } as any,
      relations: { lines: { account: true } },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    const reversalExists = !!(await this.entryRepo.findOne({ where: { reversalOfEntryId: id } as any }));
    const totals = this.entryTotals(entry.lines ?? []);
    return {
      id: entry.id, journalNo: entry.journalNo, status: this.deriveStatus(entry, reversalExists),
      entryDate: entry.entryDate, sourceType: entry.sourceType, sourceDocumentId: entry.sourceDocumentId,
      sourceRef: entry.sourceRef, description: entry.description, createdBy: entry.createdBy, createdAt: entry.createdAt,
      lines: (entry.lines ?? []).map((l) => ({
        accountCode: l.account?.code, accountName: l.account?.name, debit: l.debit, credit: l.credit,
      })),
      ...totals,
    };
  }
}
