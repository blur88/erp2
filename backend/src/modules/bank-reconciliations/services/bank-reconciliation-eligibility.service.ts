import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BankReconciliation, BankReconciliationStatus, SetupClassification } from '../entities/bank-reconciliation.entity';
import { BankReconciliationVersionLineRole } from '../entities/bank-reconciliation-version-line.entity';
import {
  DraftContextDto,
  EligibleLinesSearchDto,
  PreviewDto,
  PreviewResultDto,
  ReconciliationLineDto,
  SetupSummaryDto,
} from '../dto/bank-reconciliation.dto';
import { addOneDay } from './bank-reconciliation.rules';
import { formatMoney, quantizeToCents, toMinorUnits } from '../../../common/utils/money';

@Injectable()
export class BankReconciliationEligibilityService {
  constructor(private readonly dataSource: DataSource) {}

  private async deriveContext(ctx: DraftContextDto, manager: EntityManager) {
    if (ctx.reconciliationId) {
      const recon = await manager.findOne(BankReconciliation, { where: { id: ctx.reconciliationId } });
      if (!recon) {
        throw new NotFoundException(`Bank reconciliation ${ctx.reconciliationId} not found`);
      }
      if (recon.bankAccountId !== ctx.bankAccountId) {
        throw new BadRequestException('This reconciliation does not belong to the selected bank account.');
      }
      if (recon.status !== BankReconciliationStatus.DRAFT) {
        throw new ConflictException('Only a draft reconciliation can be edited.');
      }
      const sequenceNo = recon.sequenceNo;
      const isFirst = sequenceNo === 1;
      let periodFrom = ctx.periodFrom ?? recon.periodFrom;
      let openingBalance = ctx.openingBalance ?? recon.openingBalance;
      if (!isFirst) {
        periodFrom = recon.periodFrom;
        openingBalance = recon.openingBalance;
        if (ctx.setupChanges && ctx.setupChanges.length > 0) {
          throw new BadRequestException('setupChanges are only permitted on the first reconciliation for an account.');
        }
      }
      return { recon, sequenceNo, isFirst, periodFrom, openingBalance };
    }

    // No reconciliationId: derive sequence from latest reconciliation
    const latest = await manager.findOne(BankReconciliation, {
      where: { bankAccountId: ctx.bankAccountId },
      order: { sequenceNo: 'DESC' },
    });

    if (!latest) {
      const sequenceNo = 1;
      const isFirst = true;
      const periodFrom = ctx.periodFrom ?? null;
      const openingBalance = ctx.openingBalance ?? null;
      return { recon: null, sequenceNo, isFirst, periodFrom, openingBalance };
    } else {
      const sequenceNo = latest.sequenceNo + 1;
      const isFirst = false;
      const periodFrom = addOneDay(latest.periodTo);
      const openingBalance = latest.closingBalance;
      if (ctx.setupChanges && ctx.setupChanges.length > 0) {
        throw new BadRequestException('setupChanges are only permitted on the first reconciliation for an account.');
      }
      return { recon: null, sequenceNo, isFirst, periodFrom, openingBalance };
    }
  }

  async search(
    dto: EligibleLinesSearchDto,
    manager?: EntityManager,
  ): Promise<{
    data: ReconciliationLineDto[];
    meta: { total: number; page: number; limit: number };
    setupSummary: SetupSummaryDto | null;
  }> {
    const mgr = manager ?? this.dataSource.manager;
    const { isFirst, periodFrom, openingBalance } = await this.deriveContext(dto, mgr);

    if (dto.view === 'setup') {
      if (!isFirst) {
        throw new BadRequestException('Setup view is only permitted on the first reconciliation for an account.');
      }
      if (!periodFrom) {
        throw new BadRequestException('periodFrom is required for setup view.');
      }
    }

    const reconId = dto.reconciliationId ?? '00000000-0000-0000-0000-000000000000';
    const limit = dto.limit ?? 25;
    const page = dto.page ?? 1;
    const offset = (page - 1) * limit;

    const setupIds: string[] = [];
    const setupCls: string[] = [];
    if (dto.setupChanges) {
      for (const sc of dto.setupChanges) {
        setupIds.push(sc.journalEntryLineId);
        setupCls.push(sc.classification);
      }
    }

    const searchPattern = dto.search && dto.search.trim().length > 0 ? `%${dto.search.trim()}%` : null;
    const clsFilter = dto.view === 'setup' && dto.classification ? dto.classification : null;

    const params: any[] = [];
    let pIdx = 1;

    params.push(reconId);
    const pReconId = `$${pIdx++}`;

    params.push(dto.bankAccountId);
    const pBankAccountId = `$${pIdx++}`;

    params.push(dto.periodTo);
    const pPeriodTo = `$${pIdx++}`;

    params.push(periodFrom);
    const pPeriodFrom = `$${pIdx++}::date`;

    params.push(isFirst);
    const pIsFirst = `$${pIdx++}::boolean`;

    params.push(setupIds);
    const pSetupIds = `$${pIdx++}::uuid[]`;

    params.push(setupCls);
    const pSetupCls = `$${pIdx++}::text[]`;

    let viewWhereClause = '';
    if (dto.view === 'setup') {
      viewWhereClause = `AND je."entryDate" < ${pPeriodFrom}`;
      if (clsFilter) {
        params.push(clsFilter);
        viewWhereClause += ` AND eff.cls = $${pIdx++}::text`;
      }
    } else {
      // checklist view: eligible set minus effective CLEARED lines
      viewWhereClause = `AND NOT (${pIsFirst} AND ${pPeriodFrom} IS NOT NULL AND je."entryDate" < ${pPeriodFrom} AND eff.cls = 'CLEARED')`;
    }

    let searchWhereClause = '';
    if (searchPattern) {
      params.push(searchPattern);
      const pSearch = `$${pIdx++}::text`;
      searchWhereClause = `AND (
        je."journalNo" ILIKE ${pSearch}
        OR je."sourceRef" ILIKE ${pSearch}
        OR je.description ILIKE ${pSearch}
      )`;
    }

    const countParams = [...params];

    params.push(limit);
    const pLimit = `$${pIdx++}`;

    params.push(offset);
    const pOffset = `$${pIdx++}`;

    const sql = `
      SELECT
        jel.id AS "journalEntryLineId",
        jel."entryId" AS "journalEntryId",
        je."entryDate"::text AS "entryDate",
        je."journalNo" AS "journalNo",
        je."sourceType"::text AS "sourceType",
        je."sourceDocumentId" AS "sourceDocumentId",
        je."sourceRef" AS "sourceRef",
        je.description AS "description",
        (ROUND(jel.debit, 2))::text AS "moneyIn",
        (ROUND(jel.credit, 2))::text AS "moneyOut",
        COALESCE(this_rl.kind::text, 'OUTSTANDING') AS "role",
        (${pIsFirst} AND ${pPeriodFrom} IS NOT NULL AND je."entryDate" < ${pPeriodFrom}) AS "prePeriod",
        CASE
          WHEN (${pIsFirst} AND ${pPeriodFrom} IS NOT NULL AND je."entryDate" < ${pPeriodFrom}) THEN eff.cls
          ELSE NULL
        END AS "classification",
        count(*) OVER() AS "windowTotal"
      FROM journal_entry_line jel
      JOIN journal_entry je ON je.id = jel."entryId"
      LEFT JOIN bank_statement_reconciliation_lines this_rl
        ON this_rl."journalEntryLineId" = jel.id AND this_rl."reconciliationId" = ${pReconId}
      LEFT JOIN bank_statement_reconciliation_setup_marks this_sm
        ON this_sm."journalEntryLineId" = jel.id AND this_sm."reconciliationId" = ${pReconId}
      LEFT JOIN bank_statement_reconciliation_lines other_rl
        ON other_rl."journalEntryLineId" = jel.id AND other_rl."reconciliationId" <> ${pReconId}
      LEFT JOIN UNNEST(${pSetupIds}, ${pSetupCls}) AS sc(id, cls)
        ON sc.id = jel.id
      CROSS JOIN LATERAL (
        SELECT COALESCE(sc.cls, CASE
          WHEN this_rl.kind = 'OPENING_CLEARED' THEN 'CLEARED'
          WHEN this_sm.id IS NOT NULL THEN 'OUTSTANDING'
          ELSE 'UNCLASSIFIED'
        END) AS cls
      ) eff
      WHERE jel."accountId" = ${pBankAccountId}
        AND jel."deletedAt" IS NULL
        AND je."deletedAt" IS NULL
        AND je."entryDate" <= ${pPeriodTo}
        AND other_rl.id IS NULL
        ${viewWhereClause}
        ${searchWhereClause}
      ORDER BY je."entryDate" ASC, je."journalNo" ASC, jel.id ASC
      LIMIT ${pLimit} OFFSET ${pOffset}
    `;

    const rows = await mgr.query(sql, params);
    let total = 0;
    if (rows.length > 0) {
      total = parseInt(rows[0].windowTotal, 10);
    } else if (offset > 0) {
      const countSql = `
        SELECT count(*)::int AS count
        FROM journal_entry_line jel
        JOIN journal_entry je ON je.id = jel."entryId"
        LEFT JOIN bank_statement_reconciliation_lines this_rl
          ON this_rl."journalEntryLineId" = jel.id AND this_rl."reconciliationId" = ${pReconId}
        LEFT JOIN bank_statement_reconciliation_setup_marks this_sm
          ON this_sm."journalEntryLineId" = jel.id AND this_sm."reconciliationId" = ${pReconId}
        LEFT JOIN bank_statement_reconciliation_lines other_rl
          ON other_rl."journalEntryLineId" = jel.id AND other_rl."reconciliationId" <> ${pReconId}
        LEFT JOIN UNNEST(${pSetupIds}, ${pSetupCls}) AS sc(id, cls)
          ON sc.id = jel.id
        CROSS JOIN LATERAL (
          SELECT COALESCE(sc.cls, CASE
            WHEN this_rl.kind = 'OPENING_CLEARED' THEN 'CLEARED'
            WHEN this_sm.id IS NOT NULL THEN 'OUTSTANDING'
            ELSE 'UNCLASSIFIED'
          END) AS cls
        ) eff
        WHERE jel."accountId" = ${pBankAccountId}
          AND jel."deletedAt" IS NULL
          AND je."deletedAt" IS NULL
          AND je."entryDate" <= ${pPeriodTo}
          AND other_rl.id IS NULL
          ${viewWhereClause}
          ${searchWhereClause}
      `;
      const [countRow] = await mgr.query(countSql, countParams);
      total = countRow?.count ?? 0;
    }

    const data: ReconciliationLineDto[] = rows.map((r: any) => ({
      journalEntryLineId: r.journalEntryLineId,
      journalEntryId: r.journalEntryId,
      entryDate: r.entryDate,
      journalNo: r.journalNo,
      sourceType: r.sourceType,
      sourceDocumentId: r.sourceDocumentId,
      sourceRef: r.sourceRef,
      description: r.description,
      moneyIn: r.moneyIn,
      moneyOut: r.moneyOut,
      role: r.role as BankReconciliationVersionLineRole,
      prePeriod: Boolean(r.prePeriod),
      classification: r.classification as SetupClassification | null,
    }));

    let setupSummary: SetupSummaryDto | null = null;
    if (isFirst && periodFrom) {
      setupSummary = await this.computeSetupSummary(
        mgr,
        reconId,
        dto.bankAccountId,
        periodFrom,
        openingBalance,
        setupIds,
        setupCls,
      );
    }

    return {
      data,
      meta: { total, page, limit },
      setupSummary,
    };
  }

  private async computeSetupSummary(
    mgr: EntityManager,
    reconId: string,
    bankAccountId: string,
    periodFrom: string,
    openingBalance: string | null | undefined,
    setupIds: string[],
    setupCls: string[],
  ): Promise<SetupSummaryDto> {
    const summarySql = `
      SELECT
        count(*)::int AS "prePeriodTotal",
        count(*) FILTER (WHERE eff.cls = 'UNCLASSIFIED')::int AS "unclassifiedCount",
        count(*) FILTER (WHERE eff.cls = 'CLEARED')::int AS "clearedCount",
        count(*) FILTER (WHERE eff.cls = 'OUTSTANDING')::int AS "outstandingCount",
        COALESCE(sum(CASE WHEN eff.cls = 'CLEARED' THEN ROUND(jel.debit, 2) - ROUND(jel.credit, 2) ELSE 0 END), 0)::text AS "clearedNet"
      FROM journal_entry_line jel
      JOIN journal_entry je ON je.id = jel."entryId"
      LEFT JOIN bank_statement_reconciliation_lines this_rl
        ON this_rl."journalEntryLineId" = jel.id AND this_rl."reconciliationId" = $1
      LEFT JOIN bank_statement_reconciliation_setup_marks this_sm
        ON this_sm."journalEntryLineId" = jel.id AND this_sm."reconciliationId" = $1
      LEFT JOIN bank_statement_reconciliation_lines other_rl
        ON other_rl."journalEntryLineId" = jel.id AND other_rl."reconciliationId" <> $1
      LEFT JOIN UNNEST($4::uuid[], $5::text[]) AS sc(id, cls)
        ON sc.id = jel.id
      CROSS JOIN LATERAL (
        SELECT COALESCE(sc.cls, CASE
          WHEN this_rl.kind = 'OPENING_CLEARED' THEN 'CLEARED'
          WHEN this_sm.id IS NOT NULL THEN 'OUTSTANDING'
          ELSE 'UNCLASSIFIED'
        END) AS cls
      ) eff
      WHERE jel."accountId" = $2
        AND jel."deletedAt" IS NULL
        AND je."deletedAt" IS NULL
        AND je."entryDate" < $3::date
        AND other_rl.id IS NULL
    `;

    const [summaryRow] = await mgr.query(summarySql, [
      reconId,
      bankAccountId,
      periodFrom,
      setupIds,
      setupCls,
    ]);

    const clearedNetCents = quantizeToCents(toMinorUnits(summaryRow.clearedNet));
    const openingCents = openingBalance ? quantizeToCents(toMinorUnits(openingBalance)) : 0n;
    const diffCents = openingCents - clearedNetCents;

    return {
      prePeriodTotal: summaryRow.prePeriodTotal,
      unclassifiedCount: summaryRow.unclassifiedCount,
      clearedCount: summaryRow.clearedCount,
      outstandingCount: summaryRow.outstandingCount,
      openingClearedNet: formatMoney(clearedNetCents),
      openingBalanceDifference: formatMoney(diffCents),
    };
  }

  async preview(dto: PreviewDto, manager?: EntityManager): Promise<PreviewResultDto> {
    const mgr = manager ?? this.dataSource.manager;
    const { isFirst, periodFrom, openingBalance } = await this.deriveContext(dto, mgr);

    const reconId = dto.reconciliationId ?? '00000000-0000-0000-0000-000000000000';

    const setupIds: string[] = [];
    const setupCls: string[] = [];
    if (dto.setupChanges) {
      for (const sc of dto.setupChanges) {
        setupIds.push(sc.journalEntryLineId);
        setupCls.push(sc.classification);
      }
    }

    const matched: ReconciliationLineDto[] = [];
    const invalidMatched: ReconciliationLineDto[] = [];
    const invalidClassifications: ReconciliationLineDto[] = [];

    // Check matchedLineIds
    if (dto.matchedLineIds && dto.matchedLineIds.length > 0) {
      const lineRows = await mgr.query(
        `
        SELECT
          jel.id AS "journalEntryLineId",
          jel."entryId" AS "journalEntryId",
          je."entryDate"::text AS "entryDate",
          je."journalNo" AS "journalNo",
          je."sourceType"::text AS "sourceType",
          je."sourceDocumentId" AS "sourceDocumentId",
          je."sourceRef" AS "sourceRef",
          je.description AS "description",
          (ROUND(jel.debit, 2))::text AS "moneyIn",
          (ROUND(jel.credit, 2))::text AS "moneyOut",
          jel."accountId" AS "accountId",
          jel."deletedAt" AS "lineDeletedAt",
          je."deletedAt" AS "entryDeletedAt",
          other_rl.id AS "otherReconLineId"
        FROM journal_entry_line jel
        JOIN journal_entry je ON je.id = jel."entryId"
        LEFT JOIN bank_statement_reconciliation_lines other_rl
          ON other_rl."journalEntryLineId" = jel.id AND other_rl."reconciliationId" <> $1
        WHERE jel.id = ANY($2::uuid[])
        `,
        [reconId, dto.matchedLineIds],
      );

      const rowMap = new Map<string, any>(lineRows.map((r: any) => [r.journalEntryLineId, r]));

      for (const id of dto.matchedLineIds) {
        const row = rowMap.get(id);
        if (!row) {
          invalidMatched.push({
            journalEntryLineId: id,
            journalEntryId: '',
            entryDate: '',
            journalNo: '',
            sourceType: '',
            sourceDocumentId: null,
            sourceRef: null,
            description: null,
            moneyIn: '0.00',
            moneyOut: '0.00',
            role: BankReconciliationVersionLineRole.MATCHED,
            prePeriod: false,
            classification: null,
          });
          continue;
        }

        const isEligible =
          row.accountId === dto.bankAccountId &&
          !row.lineDeletedAt &&
          !row.entryDeletedAt &&
          !row.otherReconLineId &&
          row.entryDate <= dto.periodTo;

        const isPre = isFirst && Boolean(periodFrom) && row.entryDate < periodFrom!;
        const lineDto: ReconciliationLineDto = {
          journalEntryLineId: row.journalEntryLineId,
          journalEntryId: row.journalEntryId,
          entryDate: row.entryDate,
          journalNo: row.journalNo,
          sourceType: row.sourceType,
          sourceDocumentId: row.sourceDocumentId,
          sourceRef: row.sourceRef,
          description: row.description,
          moneyIn: row.moneyIn,
          moneyOut: row.moneyOut,
          role: BankReconciliationVersionLineRole.MATCHED,
          prePeriod: isPre,
          classification: isPre ? SetupClassification.OUTSTANDING : null,
        };

        if (isEligible) {
          matched.push(lineDto);
        } else {
          invalidMatched.push(lineDto);
        }
      }
    }

    // Check setup classifications
    if (dto.setupChanges && dto.setupChanges.length > 0) {
      const clsRows = await mgr.query(
        `
        SELECT
          jel.id AS "journalEntryLineId",
          jel."entryId" AS "journalEntryId",
          je."entryDate"::text AS "entryDate",
          je."journalNo" AS "journalNo",
          je."sourceType"::text AS "sourceType",
          je."sourceDocumentId" AS "sourceDocumentId",
          je."sourceRef" AS "sourceRef",
          je.description AS "description",
          (ROUND(jel.debit, 2))::text AS "moneyIn",
          (ROUND(jel.credit, 2))::text AS "moneyOut",
          jel."accountId" AS "accountId",
          jel."deletedAt" AS "lineDeletedAt",
          je."deletedAt" AS "entryDeletedAt",
          other_rl.id AS "otherReconLineId"
        FROM journal_entry_line jel
        JOIN journal_entry je ON je.id = jel."entryId"
        LEFT JOIN bank_statement_reconciliation_lines other_rl
          ON other_rl."journalEntryLineId" = jel.id AND other_rl."reconciliationId" <> $1
        WHERE jel.id = ANY($2::uuid[])
        `,
        [reconId, setupIds],
      );

      const clsRowMap = new Map<string, any>(clsRows.map((r: any) => [r.journalEntryLineId, r]));

      for (const sc of dto.setupChanges) {
        const row = clsRowMap.get(sc.journalEntryLineId);
        const isEligiblePrePeriod =
          row &&
          isFirst &&
          Boolean(periodFrom) &&
          row.accountId === dto.bankAccountId &&
          !row.lineDeletedAt &&
          !row.entryDeletedAt &&
          !row.otherReconLineId &&
          row.entryDate < periodFrom!;

        if (!isEligiblePrePeriod) {
          invalidClassifications.push({
            journalEntryLineId: sc.journalEntryLineId,
            journalEntryId: row?.journalEntryId ?? '',
            entryDate: row?.entryDate ?? '',
            journalNo: row?.journalNo ?? '',
            sourceType: row?.sourceType ?? '',
            sourceDocumentId: row?.sourceDocumentId ?? null,
            sourceRef: row?.sourceRef ?? null,
            description: row?.description ?? null,
            moneyIn: row?.moneyIn ?? '0.00',
            moneyOut: row?.moneyOut ?? '0.00',
            role: BankReconciliationVersionLineRole.OUTSTANDING,
            prePeriod: false,
            classification: sc.classification,
          });
        }
      }
    }

    let setupSummary: SetupSummaryDto | null = null;
    if (isFirst && periodFrom) {
      setupSummary = await this.computeSetupSummary(
        mgr,
        reconId,
        dto.bankAccountId,
        periodFrom,
        openingBalance,
        setupIds,
        setupCls,
      );
    }

    return {
      matched,
      invalidMatched,
      invalidClassifications,
      setupSummary,
    };
  }

  async effectiveState(
    ctx: DraftContextDto,
    matchedLineIds: string[],
    manager: EntityManager,
  ): Promise<{
    matched: any[];
    cleared: any[];
    marked: any[];
    invalidMatchedIds: string[];
    invalidClassificationIds: string[];
  }> {
    const { isFirst, periodFrom } = await this.deriveContext(ctx, manager);
    const reconId = ctx.reconciliationId ?? '00000000-0000-0000-0000-000000000000';

    const setupIds: string[] = [];
    const setupCls: string[] = [];
    const setupChangeMap = new Map<string, SetupClassification>();
    if (ctx.setupChanges) {
      for (const sc of ctx.setupChanges) {
        setupIds.push(sc.journalEntryLineId);
        setupCls.push(sc.classification);
        setupChangeMap.set(sc.journalEntryLineId, sc.classification);
      }
    }

    const allIds = Array.from(new Set([...matchedLineIds, ...setupIds]));
    if (allIds.length === 0) {
      return {
        matched: [],
        cleared: [],
        marked: [],
        invalidMatchedIds: [],
        invalidClassificationIds: [],
      };
    }

    const rows = await manager.query(
      `
      SELECT
        jel.id AS "journalEntryLineId",
        jel."entryId" AS "journalEntryId",
        je."entryDate"::text AS "entryDate",
        je."journalNo" AS "journalNo",
        jel.debit,
        jel.credit,
        jel."accountId" AS "accountId",
        jel."deletedAt" AS "lineDeletedAt",
        je."deletedAt" AS "entryDeletedAt",
        this_rl.kind AS "savedKind",
        (this_sm.id IS NOT NULL) AS "savedMarked",
        other_rl.id AS "otherReconLineId"
      FROM journal_entry_line jel
      JOIN journal_entry je ON je.id = jel."entryId"
      LEFT JOIN bank_statement_reconciliation_lines this_rl
        ON this_rl."journalEntryLineId" = jel.id AND this_rl."reconciliationId" = $1
      LEFT JOIN bank_statement_reconciliation_setup_marks this_sm
        ON this_sm."journalEntryLineId" = jel.id AND this_sm."reconciliationId" = $1
      LEFT JOIN bank_statement_reconciliation_lines other_rl
        ON other_rl."journalEntryLineId" = jel.id AND other_rl."reconciliationId" <> $1
      WHERE jel.id = ANY($2::uuid[])
      `,
      [reconId, allIds],
    );

    const rowMap = new Map<string, any>(rows.map((r: any) => [r.journalEntryLineId, r]));
    const invalidMatchedIds: string[] = [];
    const invalidClassificationIds: string[] = [];

    const matchedSet = new Set(matchedLineIds);

    for (const id of matchedLineIds) {
      const r = rowMap.get(id);
      if (
        !r ||
        r.accountId !== ctx.bankAccountId ||
        r.lineDeletedAt ||
        r.entryDeletedAt ||
        r.otherReconLineId ||
        r.entryDate > ctx.periodTo
      ) {
        invalidMatchedIds.push(id);
      }
    }

    for (const sc of ctx.setupChanges ?? []) {
      const r = rowMap.get(sc.journalEntryLineId);
      if (
        !r ||
        !isFirst ||
        !periodFrom ||
        r.accountId !== ctx.bankAccountId ||
        r.lineDeletedAt ||
        r.entryDeletedAt ||
        r.otherReconLineId ||
        r.entryDate >= periodFrom
      ) {
        invalidClassificationIds.push(sc.journalEntryLineId);
      }
    }

    const matched: any[] = [];
    const cleared: any[] = [];
    const marked: any[] = [];

    for (const r of rows) {
      const isEligibleBase =
        r.accountId === ctx.bankAccountId &&
        !r.lineDeletedAt &&
        !r.entryDeletedAt &&
        !r.otherReconLineId;

      if (!isEligibleBase) continue;

      const isPre = isFirst && Boolean(periodFrom) && r.entryDate < periodFrom!;
      const isTicked = matchedSet.has(r.journalEntryLineId) && r.entryDate <= ctx.periodTo;

      let classification: SetupClassification = SetupClassification.UNCLASSIFIED;
      if (setupChangeMap.has(r.journalEntryLineId)) {
        classification = setupChangeMap.get(r.journalEntryLineId)!;
      } else if (r.savedKind === 'OPENING_CLEARED') {
        classification = SetupClassification.CLEARED;
      } else if (r.savedMarked) {
        classification = SetupClassification.OUTSTANDING;
      }

      if (isPre && classification === SetupClassification.CLEARED) {
        cleared.push(r);
      } else {
        if (isTicked) {
          matched.push(r);
        }
        if (isPre && classification === SetupClassification.OUTSTANDING) {
          marked.push(r);
        }
      }
    }

    return {
      matched,
      cleared,
      marked,
      invalidMatchedIds,
      invalidClassificationIds,
    };
  }
}
