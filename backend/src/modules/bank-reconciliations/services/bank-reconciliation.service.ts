import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  BankReconciliation,
  BankReconciliationStatus,
  SetupClassification,
} from '../entities/bank-reconciliation.entity';
import {
  BankReconciliationLine,
  BankReconciliationLineKind,
} from '../entities/bank-reconciliation-line.entity';
import { BankReconciliationSetupMark } from '../entities/bank-reconciliation-setup-mark.entity';
import { BankReconciliationVersion } from '../entities/bank-reconciliation-version.entity';
import {
  BankReconciliationVersionLine,
  BankReconciliationVersionLineRole,
} from '../entities/bank-reconciliation-version-line.entity';
import {
  BankReconciliationDetailDto,
  BankReconciliationDto,
  CreateBankReconciliationDto,
  ListBankReconciliationsQueryDto,
  NextPeriodDto,
  ReconciliationLineDto,
  ReconciliationLinesQueryDto,
  ReconciliationSummaryDto,
  UpdateBankReconciliationDto,
} from '../dto/bank-reconciliation.dto';
import {
  computeSummary,
  LOCK_VERSION_MISMATCH_TEXT,
  mapReconciliationDbError,
  nextPeriodFrom,
  resolveFinalState,
  type SavedLineState,
  validateSequenceInputs,
} from './bank-reconciliation.rules';
import { formatMoney, quantizeToCents, toMinorUnits } from '../../../common/utils/money';
import {
  assertWritableAccount,
  lockBankAccount,
  lockReconciliation,
} from './bank-reconciliation.locks';
import {
  RECONCILIATION_TEST_HOOK,
  type ReconciliationTestHook,
  type ReconciliationTestPhase,
} from './bank-reconciliation.test-hooks';
import { BankReconciliationEligibilityService } from './bank-reconciliation-eligibility.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services/audit-log.service';

export {
  RECONCILIATION_TEST_HOOK,
  type ReconciliationTestPhase,
  type ReconciliationTestHook,
} from './bank-reconciliation.test-hooks';

function fmtMoney(val: string | null | undefined): string {
  if (!val) return '0.00';
  return formatMoney(quantizeToCents(toMinorUnits(val)));
}

function fmtNullableMoney(val: string | null | undefined): string | null {
  if (val === null || val === undefined) return null;
  return formatMoney(quantizeToCents(toMinorUnits(val)));
}

@Injectable()
export class BankReconciliationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly eligibilityService: BankReconciliationEligibilityService,
    private readonly settingsService: SettingsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async nextPeriod(bankAccountId: string): Promise<NextPeriodDto> {
    const [latest] = await this.dataSource.query(
      `SELECT "sequenceNo", "periodTo"::text, "closingBalance"::text, status
         FROM bank_statement_reconciliations
        WHERE "bankAccountId" = $1
        ORDER BY "sequenceNo" DESC
        LIMIT 1`,
      [bankAccountId],
    );

    const [draft] = await this.dataSource.query(
      `SELECT id FROM bank_statement_reconciliations
        WHERE "bankAccountId" = $1 AND status = 'DRAFT'
        LIMIT 1`,
      [bankAccountId],
    );

    if (!latest) {
      return {
        sequenceNo: 1,
        isFirst: true,
        periodFrom: null,
        openingBalance: null,
        blockedReason: draft
          ? 'A draft reconciliation already exists for this bank account.'
          : null,
      };
    }

    const np = nextPeriodFrom(latest);
    let blockedReason: string | null = null;
    if (draft) {
      blockedReason = 'A draft reconciliation already exists for this bank account.';
    } else if (latest.status !== BankReconciliationStatus.COMPLETED) {
      blockedReason = 'The previous reconciliation has not been completed.';
    }

    return {
      sequenceNo: np.sequenceNo,
      isFirst: false,
      periodFrom: np.periodFrom,
      openingBalance: np.openingBalance,
      blockedReason,
    };
  }

  async create(
    dto: CreateBankReconciliationDto,
    userId?: string,
    username?: string,
  ): Promise<BankReconciliationDetailDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      // 1. Lock account
      const acct = await lockBankAccount(manager, dto.bankAccountId);
      assertWritableAccount(acct);

      // Fire test hook if registered
      if ((this as any)[RECONCILIATION_TEST_HOOK]) {
        await (this as any)[RECONCILIATION_TEST_HOOK]('afterLocks', {
          reconciliationId: null,
          manager,
        });
      }

      // 2. Compute next period under the lock
      const [latest] = await manager.query(
        `SELECT "sequenceNo", "periodTo"::text, "closingBalance"::text, status
           FROM bank_statement_reconciliations
          WHERE "bankAccountId" = $1
          ORDER BY "sequenceNo" DESC
          LIMIT 1`,
        [dto.bankAccountId],
      );

      const [draft] = await manager.query(
        `SELECT id FROM bank_statement_reconciliations
          WHERE "bankAccountId" = $1 AND status = 'DRAFT'
          LIMIT 1`,
        [dto.bankAccountId],
      );
      if (draft) {
        throw new ConflictException('A draft reconciliation already exists for this bank account.');
      }

      let sequenceNo = 1;
      let isFirst = true;
      let periodFrom = dto.periodFrom;
      let openingBalance = dto.openingBalance;

      if (latest) {
        if (latest.status !== BankReconciliationStatus.COMPLETED) {
          throw new ConflictException('The previous reconciliation has not been completed.');
        }
        const np = nextPeriodFrom(latest);
        sequenceNo = np.sequenceNo;
        isFirst = false;

        validateSequenceInputs(sequenceNo, {
          periodFrom: dto.periodFrom,
          openingBalance: dto.openingBalance,
          setupChanges: dto.setupChanges,
        });

        periodFrom = np.periodFrom!;
        openingBalance = np.openingBalance!;
      } else {
        if (!periodFrom) {
          throw new BadRequestException('periodFrom is required for the first reconciliation.');
        }
        openingBalance = dto.openingBalance ?? '0.00';
      }

      if (periodFrom > dto.periodTo) {
        throw new BadRequestException('periodFrom must be before or equal to periodTo.');
      }

      // 3. Selection validation and final state
      const finalStates = resolveFinalState([], dto.matchedLineIds, dto.setupChanges);

      const eff = await this.eligibilityService.effectiveState(
        {
          bankAccountId: dto.bankAccountId,
          periodFrom,
          periodTo: dto.periodTo,
          openingBalance,
          setupChanges: dto.setupChanges,
        },
        dto.matchedLineIds,
        manager,
      );

      if (eff.invalidMatchedIds.length > 0 || eff.invalidClassificationIds.length > 0) {
        throw new ConflictException({
          message: {
            text: 'One or more selected lines are no longer eligible.',
            invalidMatchedIds: eff.invalidMatchedIds,
            invalidClassificationIds: eff.invalidClassificationIds,
          },
        });
      }

      // 4. Generate document number
      const reconciliationNo = await this.settingsService.generateDocumentNumber(
        'Bank Reconciliations',
        manager,
      );

      // 5. Insert header
      const recon = manager.create(BankReconciliation, {
        bankAccountId: dto.bankAccountId,
        reconciliationNo,
        sequenceNo,
        periodFrom,
        periodTo: dto.periodTo,
        openingBalance,
        closingBalance: dto.closingBalance,
        status: BankReconciliationStatus.DRAFT,
        lockVersion: 1,
      });
      await manager.save(recon);

      // 6. Insert lines (ascending journalEntryLineId)
      const linesToInsert = Array.from(finalStates.values())
        .filter((s) => s.targetKind !== null)
        .sort((a, b) => a.journalEntryLineId.localeCompare(b.journalEntryLineId));

      for (const line of linesToInsert) {
        await manager.insert(BankReconciliationLine, {
          reconciliationId: recon.id,
          journalEntryLineId: line.journalEntryLineId,
          kind: line.targetKind as BankReconciliationLineKind,
          addedBy: username || 'system',
          addedAt: new Date(),
        });
      }

      // 7. Insert marks (ascending journalEntryLineId)
      const marksToInsert = Array.from(finalStates.values())
        .filter((s) => s.targetMark)
        .sort((a, b) => a.journalEntryLineId.localeCompare(b.journalEntryLineId));

      for (const mark of marksToInsert) {
        await manager.insert(BankReconciliationSetupMark, {
          reconciliationId: recon.id,
          journalEntryLineId: mark.journalEntryLineId,
          markedBy: username || 'system',
          markedAt: new Date(),
        });
      }

      // 8. Audit log
      await this.auditLogService.log(
        'CREATE',
        'BankReconciliation',
        `Created bank reconciliation ${reconciliationNo}`,
        {
          entityId: recon.id,
          userId,
          username,
        },
      );

      await queryRunner.commitTransaction();

      return this.findOne(recon.id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      mapReconciliationDbError(err);
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    id: string,
    dto: UpdateBankReconciliationDto,
    userId?: string,
    username?: string,
  ): Promise<BankReconciliationDetailDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      // Find bankAccountId first to lock account before header (global order)
      const [stub] = await manager.query(
        `SELECT "bankAccountId" FROM bank_statement_reconciliations WHERE id = $1`,
        [id],
      );
      if (!stub) {
        throw new NotFoundException(`Bank reconciliation ${id} not found`);
      }

      // Lock account
      const acct = await lockBankAccount(manager, stub.bankAccountId);
      assertWritableAccount(acct);

      // Lock header
      const recon = await lockReconciliation(manager, id);

      if ((this as any)[RECONCILIATION_TEST_HOOK]) {
        await (this as any)[RECONCILIATION_TEST_HOOK]('afterLocks', {
          reconciliationId: id,
          manager,
        });
      }

      if (recon.lockVersion !== dto.lockVersion) {
        throw new ConflictException(LOCK_VERSION_MISMATCH_TEXT);
      }
      if (recon.status !== BankReconciliationStatus.DRAFT) {
        throw new ConflictException('Only a draft reconciliation can be edited.');
      }

      // Sequence checks
      validateSequenceInputs(recon.sequenceNo, dto);

      const newPeriodFrom =
        recon.sequenceNo === 1 && dto.periodFrom !== undefined ? dto.periodFrom : recon.periodFrom;
      const newPeriodTo = dto.periodTo !== undefined ? dto.periodTo : recon.periodTo;
      if (newPeriodFrom > newPeriodTo) {
        throw new BadRequestException('periodFrom must be before or equal to periodTo.');
      }

      const newOpeningBalance =
        recon.sequenceNo === 1 && dto.openingBalance !== undefined
          ? dto.openingBalance
          : recon.openingBalance;
      const newClosingBalance =
        dto.closingBalance !== undefined ? dto.closingBalance : recon.closingBalance;

      // Existing lines & marks
      const existingLines = await manager.find(BankReconciliationLine, {
        where: { reconciliationId: id },
      });
      const existingMarks = await manager.find(BankReconciliationSetupMark, {
        where: { reconciliationId: id },
      });

      const lineMap = new Map<string, BankReconciliationLine>(
        existingLines.map((l) => [l.journalEntryLineId, l]),
      );
      const markMap = new Map<string, BankReconciliationSetupMark>(
        existingMarks.map((m) => [m.journalEntryLineId, m]),
      );

      const allSavedIds = new Set([...lineMap.keys(), ...markMap.keys()]);
      const saved: SavedLineState[] = [];
      for (const lid of allSavedIds) {
        saved.push({
          journalEntryLineId: lid,
          kind: lineMap.get(lid)?.kind ?? null,
          marked: markMap.has(lid),
        });
      }

      // Compute final states
      const finalStates = resolveFinalState(saved, dto.matchedLineIds, dto.setupChanges);

      // Validate selection eligibility
      // The FINAL classification of every affected line, UNCLASSIFIED included:
      // an explicit UNCLASSIFIED must override a saved mark or cleared line, or
      // a classification the user just cleared would still be judged invalid.
      const activeSetupChanges = Array.from(finalStates.values())
        .map((s) => ({ journalEntryLineId: s.journalEntryLineId, classification: s.classification }));

      const activeMatchedIds = Array.from(finalStates.values())
        .filter((s) => s.matched)
        .map((s) => s.journalEntryLineId);

      const eff = await this.eligibilityService.effectiveState(
        {
          bankAccountId: recon.bankAccountId,
          reconciliationId: recon.id,
          periodFrom: newPeriodFrom,
          periodTo: newPeriodTo,
          openingBalance: newOpeningBalance,
          setupChanges: activeSetupChanges,
        },
        activeMatchedIds,
        manager,
      );

      if (eff.invalidMatchedIds.length > 0 || eff.invalidClassificationIds.length > 0) {
        throw new ConflictException({
          message: {
            text: 'One or more selected lines are no longer eligible.',
            invalidMatchedIds: eff.invalidMatchedIds,
            invalidClassificationIds: eff.invalidClassificationIds,
          },
        });
      }

      // Phase 1: Removals and downgrades (ascending journalEntryLineId)
      // 1. Delete marks that must go
      const marksToDelete = Array.from(markMap.keys())
        .filter((lid) => !finalStates.get(lid)?.targetMark)
        .sort((a, b) => a.localeCompare(b));

      if (marksToDelete.length > 0) {
        await manager.delete(BankReconciliationSetupMark, {
          reconciliationId: recon.id,
          journalEntryLineId: In(marksToDelete),
        });
      }

      // 2. Delete lines that must go
      const linesToDelete = Array.from(lineMap.keys())
        .filter((lid) => finalStates.get(lid)?.targetKind === null)
        .sort((a, b) => a.localeCompare(b));

      if (linesToDelete.length > 0) {
        await manager.delete(BankReconciliationLine, {
          reconciliationId: recon.id,
          journalEntryLineId: In(linesToDelete),
        });
      }

      // 3. Downgrade OPENING_CLEARED -> MATCHED
      const linesToDowngrade = Array.from(lineMap.keys())
        .filter(
          (lid) =>
            lineMap.get(lid)?.kind === BankReconciliationLineKind.OPENING_CLEARED &&
            finalStates.get(lid)?.targetKind === 'MATCHED',
        )
        .sort((a, b) => a.localeCompare(b));

      for (const lid of linesToDowngrade) {
        await manager.update(
          BankReconciliationLine,
          { reconciliationId: recon.id, journalEntryLineId: lid },
          {
            kind: BankReconciliationLineKind.MATCHED,
            addedBy: username || 'system',
            addedAt: new Date(),
          },
        );
      }

      // Phase 2: Additions and upgrades (ascending journalEntryLineId)
      // 1. Insert new lines
      const linesToInsert = Array.from(finalStates.values())
        .filter((s) => !lineMap.has(s.journalEntryLineId) && s.targetKind !== null)
        .sort((a, b) => a.journalEntryLineId.localeCompare(b.journalEntryLineId));

      for (const line of linesToInsert) {
        await manager.insert(BankReconciliationLine, {
          reconciliationId: recon.id,
          journalEntryLineId: line.journalEntryLineId,
          kind: line.targetKind as BankReconciliationLineKind,
          addedBy: username || 'system',
          addedAt: new Date(),
        });
      }

      // 2. Upgrade MATCHED -> OPENING_CLEARED
      const linesToUpgrade = Array.from(lineMap.keys())
        .filter(
          (lid) =>
            lineMap.get(lid)?.kind === BankReconciliationLineKind.MATCHED &&
            finalStates.get(lid)?.targetKind === 'OPENING_CLEARED',
        )
        .sort((a, b) => a.localeCompare(b));

      for (const lid of linesToUpgrade) {
        await manager.update(
          BankReconciliationLine,
          { reconciliationId: recon.id, journalEntryLineId: lid },
          {
            kind: BankReconciliationLineKind.OPENING_CLEARED,
            addedBy: username || 'system',
            addedAt: new Date(),
          },
        );
      }

      // 3. Insert new marks
      const marksToInsert = Array.from(finalStates.values())
        .filter((s) => !markMap.has(s.journalEntryLineId) && s.targetMark)
        .sort((a, b) => a.journalEntryLineId.localeCompare(b.journalEntryLineId));

      for (const mark of marksToInsert) {
        await manager.insert(BankReconciliationSetupMark, {
          reconciliationId: recon.id,
          journalEntryLineId: mark.journalEntryLineId,
          markedBy: username || 'system',
          markedAt: new Date(),
        });
      }

      // 4. Update header
      recon.periodFrom = newPeriodFrom;
      recon.periodTo = newPeriodTo;
      recon.openingBalance = newOpeningBalance;
      recon.closingBalance = newClosingBalance;
      recon.lockVersion = recon.lockVersion + 1;
      await manager.save(recon);

      // 5. Audit log
      await this.auditLogService.log(
        'UPDATE',
        'BankReconciliation',
        `Updated bank reconciliation draft ${recon.reconciliationNo}`,
        {
          entityId: recon.id,
          userId,
          username,
        },
      );

      await queryRunner.commitTransaction();

      return this.findOne(recon.id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      mapReconciliationDbError(err);
    } finally {
      await queryRunner.release();
    }
  }

  async discard(
    id: string,
    lockVersion: number,
    userId?: string,
    username?: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      const [stub] = await manager.query(
        `SELECT "bankAccountId" FROM bank_statement_reconciliations WHERE id = $1`,
        [id],
      );
      if (!stub) {
        throw new NotFoundException(`Bank reconciliation ${id} not found`);
      }

      // Lock account (assertWritableAccount is skipped on discard)
      await lockBankAccount(manager, stub.bankAccountId);

      // Lock header
      const recon = await lockReconciliation(manager, id);

      if (recon.lockVersion !== lockVersion) {
        throw new ConflictException(LOCK_VERSION_MISMATCH_TEXT);
      }
      if (
        recon.status !== BankReconciliationStatus.DRAFT ||
        recon.currentVersionNo !== null
      ) {
        throw new ConflictException(
          'Only a draft that was never completed can be discarded.',
        );
      }

      await manager.delete(BankReconciliation, { id });

      await this.auditLogService.log(
        'DISCARD',
        'BankReconciliation',
        `Discarded bank reconciliation draft ${recon.reconciliationNo}`,
        {
          entityId: id,
          userId,
          username,
        },
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      mapReconciliationDbError(err);
    } finally {
      await queryRunner.release();
    }
  }

  async findOne(id: string): Promise<BankReconciliationDetailDto> {
    const recon = await this.dataSource.getRepository(BankReconciliation).findOne({
      where: { id },
    });
    if (!recon) {
      throw new NotFoundException(`Bank reconciliation ${id} not found`);
    }

    const [acct] = await this.dataSource.query(
      `SELECT code, name, "isActive", "isBankAccount" FROM chart_of_account WHERE id = $1`,
      [recon.bankAccountId],
    );

    const [latestRow] = await this.dataSource.query(
      `SELECT max("sequenceNo") AS "maxSeq" FROM bank_statement_reconciliations WHERE "bankAccountId" = $1`,
      [recon.bankAccountId],
    );
    const isLatest = latestRow?.maxSeq === recon.sequenceNo;

    const [draftRow] = await this.dataSource.query(
      `SELECT EXISTS (SELECT 1 FROM bank_statement_reconciliations WHERE "bankAccountId" = $1 AND status = 'DRAFT') AS "hasDraft"`,
      [recon.bankAccountId],
    );
    const accountHasDraft = Boolean(draftRow?.hasDraft);

    let summary: ReconciliationSummaryDto;
    let matched: ReconciliationLineDto[] = [];
    let classified: ReconciliationLineDto[] = [];
    let version: BankReconciliationVersion | null = null;

    if (recon.status === BankReconciliationStatus.COMPLETED && recon.currentVersionNo !== null) {
      version = await this.dataSource.getRepository(BankReconciliationVersion).findOne({
        where: { reconciliationId: recon.id, versionNo: recon.currentVersionNo },
      });
      summary = {
        openingBalance: fmtMoney(version?.openingBalance ?? recon.openingBalance),
        closingBalance: fmtMoney(version?.closingBalance ?? recon.closingBalance),
        moneyIn: fmtMoney(version?.moneyInTotal),
        moneyOut: fmtMoney(version?.moneyOutTotal),
        calculatedClosingBalance: fmtMoney(version?.calculatedClosingBalance),
        difference: fmtMoney(version?.difference),
        openingClearedNet: fmtNullableMoney(version?.openingClearedNet),
        openingBalanceDifference: fmtNullableMoney(version?.openingBalanceDifference),
        unclassifiedCount: null,
      };
      // For completed reconciliation, matched and classified are []
    } else {
      // Draft working set
      const lineRows = await this.dataSource.query(
        `SELECT
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
           rl.kind AS "lineKind",
           (sm.id IS NOT NULL) AS "hasMark"
         FROM bank_statement_reconciliation_lines rl
         JOIN journal_entry_line jel ON jel.id = rl."journalEntryLineId"
         JOIN journal_entry je ON je.id = jel."entryId"
         LEFT JOIN bank_statement_reconciliation_setup_marks sm
           ON sm."reconciliationId" = rl."reconciliationId" AND sm."journalEntryLineId" = rl."journalEntryLineId"
        WHERE rl."reconciliationId" = $1
        ORDER BY je."entryDate" ASC, je."journalNo" ASC, jel.id ASC`,
        [recon.id],
      );

      const markOnlyRows = await this.dataSource.query(
        `SELECT
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
           NULL AS "lineKind",
           TRUE AS "hasMark"
         FROM bank_statement_reconciliation_setup_marks sm
         JOIN journal_entry_line jel ON jel.id = sm."journalEntryLineId"
         JOIN journal_entry je ON je.id = jel."entryId"
         LEFT JOIN bank_statement_reconciliation_lines rl
           ON rl."reconciliationId" = sm."reconciliationId" AND rl."journalEntryLineId" = sm."journalEntryLineId"
        WHERE sm."reconciliationId" = $1 AND rl.id IS NULL
        ORDER BY je."entryDate" ASC, je."journalNo" ASC, jel.id ASC`,
        [recon.id],
      );

      const matchedRows = lineRows.filter(
        (r: any) => r.lineKind === BankReconciliationLineKind.MATCHED,
      );
      const openingClearedRows =
        recon.sequenceNo === 1
          ? lineRows.filter((r: any) => r.lineKind === BankReconciliationLineKind.OPENING_CLEARED)
          : null;

      let unclassifiedCount: number | null = null;
      if (recon.sequenceNo === 1) {
        const [unclRow] = await this.dataSource.query(
          `SELECT count(*)::int AS count
             FROM journal_entry_line jel
             JOIN journal_entry je ON je.id = jel."entryId"
            WHERE jel."accountId" = $1
              AND jel."deletedAt" IS NULL
              AND je."deletedAt" IS NULL
              AND je."entryDate" < $2::date
              AND NOT EXISTS (
                SELECT 1 FROM bank_statement_reconciliation_lines other_rl
                 WHERE other_rl."journalEntryLineId" = jel.id
                   AND other_rl."reconciliationId" <> $3
              )
              AND NOT EXISTS (
                SELECT 1 FROM bank_statement_reconciliation_lines this_rl
                 WHERE this_rl."journalEntryLineId" = jel.id
                   AND this_rl."reconciliationId" = $3
                   AND this_rl.kind = 'OPENING_CLEARED'
              )
              AND NOT EXISTS (
                SELECT 1 FROM bank_statement_reconciliation_setup_marks this_sm
                 WHERE this_sm."journalEntryLineId" = jel.id
                   AND this_sm."reconciliationId" = $3
              )`,
          [recon.bankAccountId, recon.periodFrom, recon.id],
        );
        unclassifiedCount = unclRow?.count ?? 0;
      }

      summary = computeSummary({
        openingBalance: recon.openingBalance,
        closingBalance: recon.closingBalance,
        matched: matchedRows.map((r: any) => ({ debit: r.moneyIn, credit: r.moneyOut })),
        openingCleared: openingClearedRows
          ? openingClearedRows.map((r: any) => ({ debit: r.moneyIn, credit: r.moneyOut }))
          : null,
        unclassifiedCount,
      });

      for (const r of matchedRows) {
        const isPre = recon.sequenceNo === 1 && r.entryDate < recon.periodFrom;
        matched.push({
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
          role: BankReconciliationVersionLineRole.MATCHED,
          prePeriod: isPre,
          classification: isPre
            ? r.hasMark
              ? SetupClassification.OUTSTANDING
              : SetupClassification.UNCLASSIFIED
            : null,
        });
      }

      if (recon.sequenceNo === 1) {
        const allSetupRows = [...lineRows.filter((r: any) => r.lineKind === 'OPENING_CLEARED' || r.hasMark), ...markOnlyRows];
        allSetupRows.sort((a, b) =>
          a.entryDate.localeCompare(b.entryDate) ||
          a.journalNo.localeCompare(b.journalNo) ||
          a.journalEntryLineId.localeCompare(b.journalEntryLineId),
        );

        for (const r of allSetupRows) {
          const role =
            r.lineKind === BankReconciliationLineKind.OPENING_CLEARED
              ? BankReconciliationVersionLineRole.OPENING_CLEARED
              : r.lineKind === BankReconciliationLineKind.MATCHED
              ? BankReconciliationVersionLineRole.MATCHED
              : BankReconciliationVersionLineRole.OUTSTANDING;

          const classification =
            r.lineKind === BankReconciliationLineKind.OPENING_CLEARED
              ? SetupClassification.CLEARED
              : SetupClassification.OUTSTANDING;

          classified.push({
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
            role,
            prePeriod: true,
            classification,
          });
        }
      }
    }

    return {
      id: recon.id,
      reconciliationNo: recon.reconciliationNo,
      sequenceNo: recon.sequenceNo,
      bankAccountId: recon.bankAccountId,
      bankAccount: {
        code: version?.bankAccountCode ?? (acct?.code ?? ''),
        name: version?.bankAccountName ?? (acct?.name ?? ''),
        isActive: Boolean(acct?.isActive),
        isBankAccount: Boolean(acct?.isBankAccount),
      },
      periodFrom: recon.periodFrom,
      periodTo: recon.periodTo,
      status: recon.status,
      reopened:
        recon.status === BankReconciliationStatus.DRAFT &&
        recon.currentVersionNo !== null,
      currentVersionNo: recon.currentVersionNo,
      lockVersion: recon.lockVersion,
      completedAt: recon.completedAt ? recon.completedAt.toISOString() : null,
      completedBy: recon.completedBy,
      isLatest,
      accountHasDraft,
      summary,
      matched,
      classified,
    };
  }

  async list(
    q: ListBankReconciliationsQueryDto,
  ): Promise<{
    data: BankReconciliationDto[];
    meta: { total: number; page: number; limit: number };
  }> {
    const params: any[] = [];
    let pIdx = 1;

    let whereSql = 'WHERE 1=1';
    if (q.bankAccountId) {
      params.push(q.bankAccountId);
      whereSql += ` AND bsr."bankAccountId" = $${pIdx++}`;
    }
    if (q.status) {
      params.push(q.status);
      whereSql += ` AND bsr.status = $${pIdx++}`;
    }
    if (q.search && q.search.trim().length > 0) {
      params.push(`%${q.search.trim()}%`);
      whereSql += ` AND bsr."reconciliationNo" ILIKE $${pIdx++}`;
    }
    if (q.periodFrom) {
      params.push(q.periodFrom);
      whereSql += ` AND bsr."periodTo" >= $${pIdx++}::date`;
    }
    if (q.periodTo) {
      params.push(q.periodTo);
      whereSql += ` AND bsr."periodFrom" <= $${pIdx++}::date`;
    }

    const hasPagination = q.page !== undefined && q.limit !== undefined;
    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const offset = (page - 1) * limit;

    let paginationClause = '';
    if (hasPagination) {
      params.push(limit);
      const pLimit = `$${pIdx++}`;
      params.push(offset);
      const pOffset = `$${pIdx++}`;
      paginationClause = `LIMIT ${pLimit} OFFSET ${pOffset}`;
    }

    const sql = `
      SELECT
        bsr.id,
        bsr."reconciliationNo",
        bsr."sequenceNo",
        bsr."bankAccountId",
        bsr."periodFrom"::text AS "periodFrom",
        bsr."periodTo"::text AS "periodTo",
        bsr.status,
        bsr."currentVersionNo",
        bsr."lockVersion",
        bsr."completedAt",
        bsr."completedBy",
        bsr."openingBalance"::text AS "openingBalance",
        bsr."closingBalance"::text AS "closingBalance",
        coa.code AS "accountCode",
        coa.name AS "accountName",
        coa."isActive" AS "accountIsActive",
        coa."isBankAccount" AS "accountIsBankAccount",
        (bsr."sequenceNo" = max_seq."maxSeq") AS "isLatest",
        (draft_acct.id IS NOT NULL) AS "accountHasDraft",
        count(*) OVER() AS "windowTotal"
      FROM bank_statement_reconciliations bsr
      JOIN chart_of_account coa ON coa.id = bsr."bankAccountId"
      LEFT JOIN LATERAL (
        SELECT max("sequenceNo") AS "maxSeq"
        FROM bank_statement_reconciliations
        WHERE "bankAccountId" = bsr."bankAccountId"
      ) max_seq ON TRUE
      LEFT JOIN LATERAL (
        SELECT id
        FROM bank_statement_reconciliations
        WHERE "bankAccountId" = bsr."bankAccountId" AND status = 'DRAFT'
        LIMIT 1
      ) draft_acct ON TRUE
      ${whereSql}
      ORDER BY bsr."periodTo" DESC, bsr."reconciliationNo" DESC
      ${paginationClause}
    `;

    const rows = await this.dataSource.query(sql, params);
    const total = rows.length > 0 ? parseInt(rows[0].windowTotal, 10) : 0;

    const data: BankReconciliationDto[] = [];
    for (const r of rows) {
      let summary: ReconciliationSummaryDto;
      let accountCode = r.accountCode;
      let accountName = r.accountName;

      if (r.status === BankReconciliationStatus.COMPLETED && r.currentVersionNo !== null) {
        const [vRow] = await this.dataSource.query(
          `SELECT "openingBalance"::text, "closingBalance"::text, "moneyInTotal"::text AS "moneyIn", "moneyOutTotal"::text AS "moneyOut",
                  "calculatedClosingBalance"::text, "difference"::text, "openingClearedNet"::text,
                  "openingBalanceDifference"::text,
                  "bankAccountCode", "bankAccountName"
             FROM bank_statement_reconciliation_versions
            WHERE "reconciliationId" = $1 AND "versionNo" = $2`,
          [r.id, r.currentVersionNo],
        );
        summary = {
          openingBalance: fmtMoney(vRow?.openingBalance ?? r.openingBalance),
          closingBalance: fmtMoney(vRow?.closingBalance ?? r.closingBalance),
          moneyIn: fmtMoney(vRow?.moneyIn),
          moneyOut: fmtMoney(vRow?.moneyOut),
          calculatedClosingBalance: fmtMoney(vRow?.calculatedClosingBalance),
          difference: fmtMoney(vRow?.difference),
          openingClearedNet: fmtNullableMoney(vRow?.openingClearedNet),
          openingBalanceDifference: fmtNullableMoney(vRow?.openingBalanceDifference),
          unclassifiedCount: null,
        };
        if (vRow?.bankAccountCode) accountCode = vRow.bankAccountCode;
        if (vRow?.bankAccountName) accountName = vRow.bankAccountName;
      } else {
        const matchedLines = await this.dataSource.query(
          `SELECT (ROUND(jel.debit, 2))::text AS debit, (ROUND(jel.credit, 2))::text AS credit
             FROM bank_statement_reconciliation_lines rl
             JOIN journal_entry_line jel ON jel.id = rl."journalEntryLineId"
            WHERE rl."reconciliationId" = $1 AND rl.kind = 'MATCHED'`,
          [r.id],
        );

        let openingClearedLines: any[] | null = null;
        let unclassifiedCount: number | null = null;

        if (r.sequenceNo === 1) {
          openingClearedLines = await this.dataSource.query(
            `SELECT (ROUND(jel.debit, 2))::text AS debit, (ROUND(jel.credit, 2))::text AS credit
               FROM bank_statement_reconciliation_lines rl
               JOIN journal_entry_line jel ON jel.id = rl."journalEntryLineId"
              WHERE rl."reconciliationId" = $1 AND rl.kind = 'OPENING_CLEARED'`,
            [r.id],
          );

          const [unclRow] = await this.dataSource.query(
            `SELECT count(*)::int AS count
               FROM journal_entry_line jel
               JOIN journal_entry je ON je.id = jel."entryId"
              WHERE jel."accountId" = $1
                AND jel."deletedAt" IS NULL
                AND je."deletedAt" IS NULL
                AND je."entryDate" < $2::date
                AND NOT EXISTS (
                  SELECT 1 FROM bank_statement_reconciliation_lines other_rl
                   WHERE other_rl."journalEntryLineId" = jel.id
                     AND other_rl."reconciliationId" <> $3
                )
                AND NOT EXISTS (
                  SELECT 1 FROM bank_statement_reconciliation_lines this_rl
                   WHERE this_rl."journalEntryLineId" = jel.id
                     AND this_rl."reconciliationId" = $3
                     AND this_rl.kind = 'OPENING_CLEARED'
                )
                AND NOT EXISTS (
                  SELECT 1 FROM bank_statement_reconciliation_setup_marks this_sm
                   WHERE this_sm."journalEntryLineId" = jel.id
                     AND this_sm."reconciliationId" = $3
                )`,
            [r.bankAccountId, r.periodFrom, r.id],
          );
          unclassifiedCount = unclRow?.count ?? 0;
        }

        summary = computeSummary({
          openingBalance: r.openingBalance,
          closingBalance: r.closingBalance,
          matched: matchedLines,
          openingCleared: openingClearedLines,
          unclassifiedCount,
        });
      }

      data.push({
        id: r.id,
        reconciliationNo: r.reconciliationNo,
        sequenceNo: r.sequenceNo,
        bankAccountId: r.bankAccountId,
        bankAccount: {
          code: accountCode,
          name: accountName,
          isActive: Boolean(r.accountIsActive),
          isBankAccount: Boolean(r.accountIsBankAccount),
        },
        periodFrom: r.periodFrom,
        periodTo: r.periodTo,
        status: r.status,
        reopened:
          r.status === BankReconciliationStatus.DRAFT && r.currentVersionNo !== null,
        currentVersionNo: r.currentVersionNo,
        lockVersion: r.lockVersion,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        completedBy: r.completedBy,
        isLatest: Boolean(r.isLatest),
        accountHasDraft: Boolean(r.accountHasDraft),
        summary,
      });
    }

    return {
      data,
      meta: {
        total,
        page: hasPagination ? page : 1,
        limit: hasPagination ? limit : total,
      },
    };
  }

  async lines(
    id: string,
    q: ReconciliationLinesQueryDto,
  ): Promise<{
    data: ReconciliationLineDto[];
    meta: { total: number; page: number; limit: number };
  }> {
    const recon = await this.dataSource.getRepository(BankReconciliation).findOne({
      where: { id },
    });
    if (!recon) {
      throw new NotFoundException(`Bank reconciliation ${id} not found`);
    }

    const isFirst = recon.sequenceNo === 1;
    const roleFilter = q.role;

    const hasPagination = q.page !== undefined && q.limit !== undefined;
    const page = q.page ?? 1;
    const limit = q.limit ?? 25;
    const offset = (page - 1) * limit;

    if (recon.status === BankReconciliationStatus.COMPLETED && recon.currentVersionNo !== null) {
      const [version] = await this.dataSource.query(
        `SELECT id FROM bank_statement_reconciliation_versions
          WHERE "reconciliationId" = $1 AND "versionNo" = $2`,
        [recon.id, recon.currentVersionNo],
      );
      if (!version) {
        throw new NotFoundException(
          `Version ${recon.currentVersionNo} not found for reconciliation ${id}`,
        );
      }

      const params: any[] = [version.id];
      let pIdx = 2;
      let whereSql = 'WHERE vl."versionId" = $1';

      if (roleFilter) {
        params.push(roleFilter);
        whereSql += ` AND vl.role = $${pIdx++}`;
      }

      let paginationClause = '';
      if (hasPagination) {
        params.push(limit);
        const pLimit = `$${pIdx++}`;
        params.push(offset);
        const pOffset = `$${pIdx++}`;
        paginationClause = `LIMIT ${pLimit} OFFSET ${pOffset}`;
      }

      const fullSql = `
        SELECT
          vl."journalEntryLineId",
          vl."journalEntryId",
          vl."entryDate"::text AS "entryDate",
          vl."journalNo",
          vl."sourceType",
          vl."sourceDocumentId",
          vl."sourceRef",
          vl.description,
          (ROUND(vl."moneyIn", 2))::text AS "moneyIn",
          (ROUND(vl."moneyOut", 2))::text AS "moneyOut",
          vl.role::text AS "role",
          vl."setupMarked",
          count(*) OVER() AS "windowTotal"
        FROM bank_statement_reconciliation_version_lines vl
        ${whereSql}
        ORDER BY vl."entryDate" ASC, vl."journalNo" ASC, vl."journalEntryLineId" ASC
        ${paginationClause}
      `;

      const rows = await this.dataSource.query(fullSql, params);
      const total = rows.length > 0 ? parseInt(rows[0].windowTotal, 10) : 0;

      const data: ReconciliationLineDto[] = rows.map((r: any) => {
        const isPre = isFirst && r.entryDate < recon.periodFrom;
        let classification: SetupClassification | null = null;
        if (isPre) {
          if (r.role === BankReconciliationVersionLineRole.OPENING_CLEARED) {
            classification = SetupClassification.CLEARED;
          } else if (r.setupMarked) {
            classification = SetupClassification.OUTSTANDING;
          } else {
            classification = SetupClassification.UNCLASSIFIED;
          }
        }
        return {
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
          prePeriod: isPre,
          classification,
        };
      });

      return {
        data,
        meta: {
          total,
          page: hasPagination ? page : 1,
          limit: hasPagination ? limit : total,
        },
      };
    }

    let paginationClause = '';
    const params: any[] = [];
    let pIdx = 1;

    params.push(recon.id);
    const pReconId = `$${pIdx++}`;

    params.push(recon.bankAccountId);
    const pBankAccountId = `$${pIdx++}`;

    params.push(recon.periodTo);
    const pPeriodTo = `$${pIdx++}::date`;

    params.push(recon.periodFrom);
    const pPeriodFrom = `$${pIdx++}::date`;

    params.push(isFirst);
    const pIsFirst = `$${pIdx++}::boolean`;

    let subquerySql = '';

    const workingLinesSql = `
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
        rl.kind::text AS "role",
        (${pIsFirst} AND je."entryDate" < ${pPeriodFrom}) AS "prePeriod",
        CASE
          WHEN rl.kind = 'OPENING_CLEARED' THEN 'CLEARED'
          WHEN sm.id IS NOT NULL THEN 'OUTSTANDING'
          WHEN (${pIsFirst} AND je."entryDate" < ${pPeriodFrom}) THEN 'UNCLASSIFIED'
          ELSE NULL
        END AS "classification"
      FROM bank_statement_reconciliation_lines rl
      JOIN journal_entry_line jel ON jel.id = rl."journalEntryLineId"
      JOIN journal_entry je ON je.id = jel."entryId"
      LEFT JOIN bank_statement_reconciliation_setup_marks sm
        ON sm."reconciliationId" = rl."reconciliationId" AND sm."journalEntryLineId" = rl."journalEntryLineId"
      WHERE rl."reconciliationId" = ${pReconId}
    `;

    const outstandingLinesSql = `
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
        'OUTSTANDING' AS "role",
        (${pIsFirst} AND je."entryDate" < ${pPeriodFrom}) AS "prePeriod",
        CASE
          WHEN sm.id IS NOT NULL THEN 'OUTSTANDING'
          WHEN (${pIsFirst} AND je."entryDate" < ${pPeriodFrom}) THEN 'UNCLASSIFIED'
          ELSE NULL
        END AS "classification"
      FROM journal_entry_line jel
      JOIN journal_entry je ON je.id = jel."entryId"
      LEFT JOIN bank_statement_reconciliation_setup_marks sm
        ON sm."reconciliationId" = ${pReconId} AND sm."journalEntryLineId" = jel.id
      WHERE jel."accountId" = ${pBankAccountId}
        AND jel."deletedAt" IS NULL
        AND je."deletedAt" IS NULL
        AND je."entryDate" <= ${pPeriodTo}
        AND NOT EXISTS (
          SELECT 1 FROM bank_statement_reconciliation_lines other_rl
           WHERE other_rl."journalEntryLineId" = jel.id AND other_rl."reconciliationId" <> ${pReconId}
        )
        AND NOT EXISTS (
          SELECT 1 FROM bank_statement_reconciliation_lines this_rl
           WHERE this_rl."journalEntryLineId" = jel.id AND this_rl."reconciliationId" = ${pReconId}
        )
    `;

    if (roleFilter === BankReconciliationVersionLineRole.MATCHED) {
      subquerySql = `${workingLinesSql} AND rl.kind = 'MATCHED'`;
    } else if (roleFilter === BankReconciliationVersionLineRole.OPENING_CLEARED) {
      subquerySql = `${workingLinesSql} AND rl.kind = 'OPENING_CLEARED'`;
    } else if (roleFilter === BankReconciliationVersionLineRole.OUTSTANDING) {
      subquerySql = outstandingLinesSql;
    } else {
      subquerySql = `${workingLinesSql} UNION ALL ${outstandingLinesSql}`;
    }

    if (hasPagination) {
      params.push(limit);
      const pLimit = `$${pIdx++}`;
      params.push(offset);
      const pOffset = `$${pIdx++}`;
      paginationClause = `LIMIT ${pLimit} OFFSET ${pOffset}`;
    }

    // Every bound parameter is named once here with an explicit type. The
    // MATCHED and OPENING_CLEARED branches do not reference the bank account or
    // period-to parameters, and Postgres rejects a statement whose parameter
    // type it cannot infer ("could not determine data type of parameter $2").
    const fullSql = `
      WITH bound AS (
        SELECT $1::uuid AS reconciliation_id, $2::uuid AS bank_account_id,
               $3::date AS period_to, $4::date AS period_from, $5::boolean AS is_first
      )
      SELECT
        u.*,
        count(*) OVER() AS "windowTotal"
      FROM (${subquerySql}) u
      ORDER BY u."entryDate" ASC, u."journalNo" ASC, u."journalEntryLineId" ASC
      ${paginationClause}
    `;

    const rows = await this.dataSource.query(fullSql, params);
    const total = rows.length > 0 ? parseInt(rows[0].windowTotal, 10) : 0;

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

    return {
      data,
      meta: {
        total,
        page: hasPagination ? page : 1,
        limit: hasPagination ? limit : total,
      },
    };
  }
}
