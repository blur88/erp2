import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { JournalEntryLine } from '../entities/journal-entry-line.entity';
import { GeneralLedgerQueryDto } from '../dto/general-ledger-query.dto';
import { AccountBalanceService } from './account-balance.service';
import { formatScale4, toMinorUnits } from '@/common/utils/money';

type Agg = { debit: string; credit: string };

@Injectable()
export class GeneralLedgerService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly balance: AccountBalanceService,
  ) {}

  /**
   * Predicates shared by EVERY query: which account, which non-deleted rows,
   * and the source-type filter.
   *
   * The opening-balance query uses this PLUS its own `entryDate < :fromDate`
   * cutoff. It must never use `applyWindowBounds` — that would apply
   * contradictory date bounds. Keeping the two layers separate is what stops
   * the window and prefix predicates drifting apart, which would silently
   * corrupt page-boundary balances.
   *
   * A posting-status predicate, if one is ever added, belongs here. None exists
   * today: reversals are separate journal entries, not a status on the line.
   */
  private applyLedgerScope(
    qb: SelectQueryBuilder<JournalEntryLine>,
    params: GeneralLedgerQueryDto,
  ): SelectQueryBuilder<JournalEntryLine> {
    qb.where('l."accountId" = :accountId', { accountId: params.accountId })
      .andWhere('l."deletedAt" IS NULL')
      .andWhere('e."deletedAt" IS NULL');
    if (params.sourceType && (params.sourceType as string) !== 'All') {
      qb.andWhere('e."sourceType" = :sourceType', { sourceType: params.sourceType });
    }
    return qb;
  }

  /** The reporting window's date bounds. Totals, prefix and page rows only. */
  private applyWindowBounds(
    qb: SelectQueryBuilder<JournalEntryLine>,
    params: GeneralLedgerQueryDto,
  ): SelectQueryBuilder<JournalEntryLine> {
    if (params.fromDate) qb.andWhere('e."entryDate" >= :fromDate', { fromDate: params.fromDate });
    if (params.toDate) qb.andWhere('e."entryDate" <= :toDate', { toDate: params.toDate });
    return qb;
  }

  /** Canonical ledger order. `l.id` is the unique tie-breaker. */
  private applyCanonicalOrder(
    qb: SelectQueryBuilder<JournalEntryLine>,
  ): SelectQueryBuilder<JournalEntryLine> {
    return qb
      .orderBy('e."entryDate"', 'ASC')
      .addOrderBy('e."createdAt"', 'ASC')
      .addOrderBy('e."journalNo"', 'ASC')
      .addOrderBy('l.id', 'ASC');
  }

  /**
   * One alias (`e`), one join, for every read. `mapEntry` only decides whether
   * the entry columns are SELECTed as well as joined — aggregates do not need
   * them, the row query does. Using two aliases for the two join forms would
   * join `journal_entry` twice in the row query.
   */
  private baseQuery(m: EntityManager, mapEntry = false): SelectQueryBuilder<JournalEntryLine> {
    const qb = m.createQueryBuilder(JournalEntryLine, 'l');
    return mapEntry ? qb.innerJoinAndSelect('l.entry', 'e') : qb.innerJoin('l.entry', 'e');
  }

  private static rawToMinor(agg: Agg | undefined): bigint {
    if (!agg) return 0n;
    return toMinorUnits(agg.debit) - toMinorUnits(agg.credit);
  }

  async getLedger(params: GeneralLedgerQueryDto) {
    const paginated = params.page !== undefined && params.limit !== undefined;
    const offset = paginated ? (params.page! - 1) * params.limit! : 0;

    // One snapshot for every read. Under READ COMMITTED each statement would
    // take its own snapshot, so a journal posted mid-request could land in the
    // prefix aggregate but not the count (or vice versa), skewing the page's
    // opening balance by exactly that entry.
    return this.dataSource.transaction('REPEATABLE READ', async (m) => {
      // Inside the snapshot: account.type drives naturalBalance.
      const account = await m.findOne(ChartOfAccount, {
        where: { id: params.accountId } as never,
      });
      if (!account) throw new BadRequestException('Account not found');

      const natural = (raw: bigint) => this.balance.naturalBalance(account.type, raw);

      // 1. Window opening — scope + the strict pre-window cutoff.
      let openingRaw = 0n;
      if (params.fromDate) {
        const qb = this.applyLedgerScope(this.baseQuery(m), params)
          .andWhere('e."entryDate" < :fromDate', { fromDate: params.fromDate })
          .select('COALESCE(SUM(l.debit),0)', 'debit')
          .addSelect('COALESCE(SUM(l.credit),0)', 'credit');
        openingRaw = GeneralLedgerService.rawToMinor(await qb.getRawOne<Agg>());
      }

      // 2. Window totals + filtered row count.
      const windowAgg = await this.applyWindowBounds(
        this.applyLedgerScope(this.baseQuery(m), params),
        params,
      )
        .select('COALESCE(SUM(l.debit),0)', 'debit')
        .addSelect('COALESCE(SUM(l.credit),0)', 'credit')
        .addSelect('COUNT(*)', 'count')
        .getRawOne<Agg & { count: string }>();

      const totalDebit = toMinorUnits(windowAgg!.debit);
      const totalCredit = toMinorUnits(windowAgg!.credit);
      const total = Number(windowAgg!.count);

      // 3. Prefix aggregate — the canonically-ordered rows BEFORE this page.
      // Ordering only affects which rows the inner LIMIT keeps, so it must be
      // applied inside the subquery.
      let prefixRaw = 0n;
      if (paginated && offset > 0) {
        const inner = this.applyCanonicalOrder(
          this.applyWindowBounds(this.applyLedgerScope(this.baseQuery(m), params), params),
        )
          .select('l.debit', 'debit')
          .addSelect('l.credit', 'credit')
          .limit(offset);

        const prefix = await m
          .createQueryBuilder()
          .select('COALESCE(SUM(p.debit),0)', 'debit')
          .addSelect('COALESCE(SUM(p.credit),0)', 'credit')
          .from(`(${inner.getQuery()})`, 'p')
          .setParameters(inner.getParameters())
          .getRawOne<Agg>();
        prefixRaw = GeneralLedgerService.rawToMinor(prefix);
      }

      // 4. Page rows.
      const rowsQb = this.applyCanonicalOrder(
        this.applyWindowBounds(this.applyLedgerScope(this.baseQuery(m, true), params), params),
      );
      if (paginated) rowsQb.limit(params.limit!).offset(offset);
      const lines = await rowsQb.getMany();

      const pageOpeningRaw = openingRaw + prefixRaw;
      let running = natural(pageOpeningRaw);
      let pageDebit = 0n;
      let pageCredit = 0n;

      const movements = lines.map((l) => {
        const debit = toMinorUnits(l.debit);
        const credit = toMinorUnits(l.credit);
        pageDebit += debit;
        pageCredit += credit;
        running += natural(debit - credit);
        return {
          id: l.id,
          date: l.entry.entryDate,
          journalEntryId: l.entry.id,
          journalNo: l.entry.journalNo,
          description: l.entry.description,
          // Normalised at the boundary: the driver may hand back an
          // unpadded NUMERIC string, and every monetary field this endpoint
          // emits is scale-4.
          debit: formatScale4(l.debit),
          credit: formatScale4(l.credit),
          balance: formatScale4(running),
          sourceType: l.entry.sourceType,
          sourceDocumentId: l.entry.sourceDocumentId,
          sourceRef: l.entry.sourceRef,
        };
      });

      return {
        account: { id: account.id, code: account.code, name: account.name },
        openingBalance: formatScale4(natural(openingRaw)),
        totalDebit: formatScale4(totalDebit),
        totalCredit: formatScale4(totalCredit),
        // From the WINDOW aggregate, never from where the row loop ended —
        // on page 1 of 5 those differ.
        closingBalance: formatScale4(natural(openingRaw + totalDebit - totalCredit)),
        movements,
        pageOpeningBalance: formatScale4(natural(pageOpeningRaw)),
        pageTotals: { debit: formatScale4(pageDebit), credit: formatScale4(pageCredit) },
        meta: paginated
          ? { total, page: params.page!, limit: params.limit! }
          : { total },
      };
    });
  }
}