import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BankReconciliation,
  BankReconciliationStatus,
} from '../entities/bank-reconciliation.entity';
import { BankReconciliationVersion } from '../entities/bank-reconciliation-version.entity';
import { BankReconciliationDetailDto } from '../dto/bank-reconciliation.dto';
import {
  addOneDay,
  computeSummary,
  LOCK_VERSION_MISMATCH_TEXT,
  mapReconciliationDbError,
} from './bank-reconciliation.rules';
import {
  assertWritableAccount,
  lockBankAccount,
  lockReconciliation,
} from './bank-reconciliation.locks';
import {
  RECONCILIATION_TEST_HOOK,
} from './bank-reconciliation.test-hooks';
import { BankReconciliationService } from './bank-reconciliation.service';
import { AuditLogService } from '../../audit-logs/services/audit-log.service';
import { INSERT_VERSION_LINES_SQL } from './bank-reconciliation-snapshot.sql';
import { quantizeToCents, toMinorUnits } from '../../../common/utils/money';

@Injectable()
export class BankReconciliationLifecycleService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => BankReconciliationService))
    private readonly reconciliationService: BankReconciliationService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async complete(
    id: string,
    lockVersion: number,
    userId?: string,
    username?: string,
  ): Promise<BankReconciliationDetailDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const manager = queryRunner.manager;

      // 1. Lock bank account, lock header, check lockVersion & status
      const [stub] = await manager.query(
        `SELECT "bankAccountId" FROM bank_statement_reconciliations WHERE id = $1`,
        [id],
      );
      if (!stub) {
        throw new NotFoundException(`Bank reconciliation ${id} not found`);
      }

      const acct = await lockBankAccount(manager, stub.bankAccountId);
      assertWritableAccount(acct);

      const recon = await lockReconciliation(manager, id);

      if ((this.reconciliationService as any)[RECONCILIATION_TEST_HOOK]) {
        await (this.reconciliationService as any)[RECONCILIATION_TEST_HOOK]('afterLocks', {
          reconciliationId: id,
          manager,
        });
      }

      if (recon.lockVersion !== lockVersion) {
        throw new ConflictException(LOCK_VERSION_MISMATCH_TEXT);
      }
      if (recon.status !== BankReconciliationStatus.DRAFT) {
        throw new ConflictException('Only a draft reconciliation can be completed.');
      }

      // 2. Insert version header unsealed
      const versionNo = (recon.currentVersionNo ?? 0) + 1;
      const version = manager.create(BankReconciliationVersion, {
        reconciliationId: recon.id,
        versionNo,
        reconciliationNo: recon.reconciliationNo,
        sequenceNo: recon.sequenceNo,
        bankAccountId: recon.bankAccountId,
        bankAccountCode: acct.code,
        bankAccountName: acct.name,
        periodFrom: recon.periodFrom,
        periodTo: recon.periodTo,
        openingBalance: recon.openingBalance,
        closingBalance: recon.closingBalance,
        sealedAt: null,
      });
      await manager.save(version);

      if ((this.reconciliationService as any)[RECONCILIATION_TEST_HOOK]) {
        await (this.reconciliationService as any)[RECONCILIATION_TEST_HOOK]('beforeSnapshot', {
          reconciliationId: id,
          manager,
        });
      }

      // 3. Execute INSERT_VERSION_LINES_SQL
      await manager.query(INSERT_VERSION_LINES_SQL, [
        version.id,
        recon.id,
        recon.bankAccountId,
        recon.periodTo,
      ]);

      if ((this.reconciliationService as any)[RECONCILIATION_TEST_HOOK]) {
        await (this.reconciliationService as any)[RECONCILIATION_TEST_HOOK]('afterSnapshot', {
          reconciliationId: id,
          manager,
        });
      }

      // 4. Validate from the inserted rows
      const versionLines = await manager.query(
        `SELECT "journalEntryLineId", role, "entryDate"::text AS "entryDate",
                "moneyIn"::text AS "moneyIn", "moneyOut"::text AS "moneyOut",
                "setupMarked"
           FROM bank_statement_reconciliation_version_lines
          WHERE "versionId" = $1`,
        [version.id],
      );

      const workingLines = await manager.query(
        `SELECT "journalEntryLineId", kind
           FROM bank_statement_reconciliation_lines
          WHERE "reconciliationId" = $1`,
        [recon.id],
      );

      // Check working ids vs inserted MATCHED/OPENING_CLEARED
      const workingIds = new Set(workingLines.map((l: any) => l.journalEntryLineId));
      const insertedWorkingLines = versionLines.filter((l: any) => l.role !== 'OUTSTANDING');
      const insertedWorkingIds = new Set(insertedWorkingLines.map((l: any) => l.journalEntryLineId));

      const missingFromSnapshot = workingLines
        .filter((l: any) => !insertedWorkingIds.has(l.journalEntryLineId))
        .map((l: any) => l.journalEntryLineId);
      const extraInSnapshot = insertedWorkingLines
        .filter((l: any) => !workingIds.has(l.journalEntryLineId))
        .map((l: any) => l.journalEntryLineId);
      const workingSetMismatchIds = [...missingFromSnapshot, ...extraInSnapshot];

      // Check dates
      const dateViolationIds: string[] = [];
      for (const l of versionLines) {
        if (l.role === 'MATCHED' && l.entryDate > recon.periodTo) {
          dateViolationIds.push(l.journalEntryLineId);
        }
        if (l.role === 'OPENING_CLEARED' && l.entryDate >= recon.periodFrom) {
          dateViolationIds.push(l.journalEntryLineId);
        }
        if (l.setupMarked && l.entryDate >= recon.periodFrom) {
          dateViolationIds.push(l.journalEntryLineId);
        }
      }

      // Financial calculations
      const matchedVLines = versionLines.filter((l: any) => l.role === 'MATCHED');
      const openingClearedVLines =
        recon.sequenceNo === 1
          ? versionLines.filter((l: any) => l.role === 'OPENING_CLEARED')
          : null;

      let unclassifiedCount: number | null = null;
      if (recon.sequenceNo === 1) {
        const unclassifiedLines = versionLines.filter(
          (l: any) =>
            l.entryDate < recon.periodFrom &&
            l.role !== 'OPENING_CLEARED' &&
            !l.setupMarked,
        );
        unclassifiedCount = unclassifiedLines.length;
      }

      const summary = computeSummary({
        openingBalance: recon.openingBalance,
        closingBalance: recon.closingBalance,
        matched: matchedVLines.map((l: any) => ({ debit: l.moneyIn, credit: l.moneyOut })),
        openingCleared: openingClearedVLines
          ? openingClearedVLines.map((l: any) => ({ debit: l.moneyIn, credit: l.moneyOut }))
          : null,
        unclassifiedCount,
      });

      // Sequence > 1 continuity check
      let continuityError: string | undefined;
      if (recon.sequenceNo > 1) {
        const [prev] = await manager.query(
          `SELECT bsr."sequenceNo", bsr."periodTo"::text, bsr.status,
                  v."closingBalance"::text AS "versionClosingBalance"
             FROM bank_statement_reconciliations bsr
             LEFT JOIN bank_statement_reconciliation_versions v
               ON v."reconciliationId" = bsr.id AND v."versionNo" = bsr."currentVersionNo"
            WHERE bsr."bankAccountId" = $1 AND bsr."sequenceNo" = $2`,
          [recon.bankAccountId, recon.sequenceNo - 1],
        );

        if (!prev || prev.status !== BankReconciliationStatus.COMPLETED) {
          continuityError = 'Previous reconciliation has not been completed';
        } else {
          const expectedFrom = addOneDay(prev.periodTo);
          if (recon.periodFrom !== expectedFrom) {
            continuityError = `Period from ${recon.periodFrom} does not match expected ${expectedFrom}`;
          }
          const prevClosing = prev.versionClosingBalance ?? prev.closingBalance;
          if (
            quantizeToCents(toMinorUnits(recon.openingBalance)) !==
            quantizeToCents(toMinorUnits(prevClosing))
          ) {
            continuityError = `Opening balance ${recon.openingBalance} does not match previous closing balance ${prevClosing}`;
          }
        }
      }

      // Collect gate failures
      const gates: Record<string, any> = {};
      if (toMinorUnits(summary.difference) !== 0n) {
        gates.difference = summary.difference;
      }
      if (
        summary.openingBalanceDifference !== null &&
        toMinorUnits(summary.openingBalanceDifference) !== 0n
      ) {
        gates.openingBalanceDifference = summary.openingBalanceDifference;
      }
      if (unclassifiedCount !== null && unclassifiedCount > 0) {
        gates.unclassifiedCount = unclassifiedCount;
      }
      if (workingSetMismatchIds.length > 0) {
        gates.workingSetMismatchIds = workingSetMismatchIds;
      }
      if (dateViolationIds.length > 0) {
        gates.dateViolationIds = dateViolationIds;
      }
      if (continuityError) {
        gates.continuity = continuityError;
      }

      if (Object.keys(gates).length > 0) {
        const msgs: string[] = [];
        if (gates.difference !== undefined) msgs.push(`Difference is ${gates.difference}`);
        if (gates.openingBalanceDifference !== undefined) {
          msgs.push(`Opening Balance Difference is ${gates.openingBalanceDifference}`);
        }
        if (gates.unclassifiedCount !== undefined) {
          msgs.push(
            `${gates.unclassifiedCount} ${gates.unclassifiedCount === 1 ? 'entry is' : 'entries are'} unclassified`,
          );
        }
        if (gates.workingSetMismatchIds !== undefined) {
          msgs.push(`${gates.workingSetMismatchIds.length} working entries mismatched`);
        }
        if (gates.dateViolationIds !== undefined) {
          msgs.push(`${gates.dateViolationIds.length} entries violate date bounds`);
        }
        if (gates.continuity !== undefined) {
          msgs.push(gates.continuity);
        }
        const text = `Cannot complete: ${msgs.join('; ')}.`;
        throw new ConflictException({ text, message: text, gates });
      }

      // 5. Update the version (seal it)
      await manager.query(
        `UPDATE bank_statement_reconciliation_versions
            SET "moneyInTotal" = $1,
                "moneyOutTotal" = $2,
                "calculatedClosingBalance" = $3,
                "difference" = $4,
                "openingClearedNet" = $5,
                "openingBalanceDifference" = $6,
                "completedBy" = $7,
                "completedAt" = now(),
                "sealedAt" = now()
          WHERE id = $8`,
        [
          summary.moneyIn,
          summary.moneyOut,
          summary.calculatedClosingBalance,
          summary.difference,
          summary.openingClearedNet,
          summary.openingBalanceDifference,
          username || 'system',
          version.id,
        ],
      );

      // 6. Header: currentVersionNo, status = 'COMPLETED', clear reopened, lockVersion + 1
      await manager.query(
        `UPDATE bank_statement_reconciliations
            SET "currentVersionNo" = $1,
                status = 'COMPLETED',
                "reopenedAt" = NULL,
                "reopenedBy" = NULL,
                "completedAt" = now(),
                "completedBy" = $2,
                "lockVersion" = "lockVersion" + 1
          WHERE id = $3`,
        [versionNo, username || 'system', recon.id],
      );

      // 7. Audit log
      await this.auditLogService.log(
        'COMPLETE',
        'BankReconciliation',
        `Completed bank reconciliation ${recon.reconciliationNo} version ${versionNo}`,
        {
          entityId: recon.id,
          userId,
          username,
        },
      );

      await queryRunner.commitTransaction();

      return this.reconciliationService.findOne(recon.id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      mapReconciliationDbError(err);
    } finally {
      await queryRunner.release();
    }
  }
}
