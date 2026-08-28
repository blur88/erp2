import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import { lockRowForUpdate } from '../../../common/db/tx-helpers';
import { toMinorUnits, formatScale4, sumMinor } from '@/common/utils/money';
import { AuditLogService } from '../../audit-logs/services';
import {
  OwnerEquityDocument,
  OwnerEquityDocumentStatus,
  OwnerEquityType,
} from '../entities/owner-equity-document.entity';
import { OwnerEquitySettlement } from '../entities/owner-equity-settlement.entity';
import { OwnerEquityService } from './owner-equity.service';
import {
  SettleOwnerEquityDto,
  RefundOwnerEquityDto,
} from '../dto/create-owner-equity.dto';

@Injectable()
export class OwnerEquitySettlementService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(ACCOUNTING_POSTING_PORT)
    private readonly posting: AccountingPostingPort,
    private readonly auditLogService: AuditLogService,
  ) {}

  async settle(
    referenceNumber: string,
    dto: SettleOwnerEquityDto,
    userId?: string,
    username?: string,
  ): Promise<OwnerEquityDocument> {
    if (!dto.settlements?.length) {
      throw new BadRequestException('At least one settlement line is required');
    }
    for (const line of dto.settlements) {
      if (toMinorUnits(line.amount) <= 0n) {
        throw new BadRequestException(
          'Settlement amount must be greater than zero',
        );
      }
    }

    const saved = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const doc = await this.lockByReference(manager, referenceNumber);

        if (doc.type === OwnerEquityType.STOCK_DRAWING) {
          throw new BadRequestException('Stock drawings have no settlement');
        }
        if (doc.documentStatus === OwnerEquityDocumentStatus.COMPLETED) {
          throw new BadRequestException(
            'Settlements are not allowed on a Completed document',
          );
        }
        if (doc.documentStatus === OwnerEquityDocumentStatus.CANCELLED) {
          throw new BadRequestException('Cancelled documents cannot be settled');
        }

        // Over-settlement is prevented by the balance condition (spec §4.1):
        // a batch may never exceed what the document still owes.
        const batchSum = sumMinor(dto.settlements.map((l) => l.amount));
        if (batchSum > toMinorUnits(doc.balance)) {
          throw new BadRequestException(
            `Settlement total exceeds the remaining balance (RM ${doc.balance})`,
          );
        }

        // Direction is derived from the immutable type (spec §6): Capital
        // Injection receives from any active method; Cash Drawing pays out and
        // therefore requires a method enabled for purchases.
        const methods = new Map<string, PaymentMethodEntity>();
        for (const line of dto.settlements) {
          if (methods.has(line.paymentMethodId)) continue;
          const requiresPurchases =
            doc.type === OwnerEquityType.CASH_DRAWING;
          const method = await manager
            .getRepository(PaymentMethodEntity)
            .findOne({
              where: requiresPurchases
                ? {
                    id: line.paymentMethodId,
                    isActive: true,
                    useForPurchases: true,
                  }
                : { id: line.paymentMethodId, isActive: true },
            } as any);
          if (!method) {
            throw new BadRequestException(
              `Payment method ${line.paymentMethodId} not found, inactive, or not enabled for purchases`,
            );
          }
          methods.set(line.paymentMethodId, method);
        }

        const settleRepo = manager.getRepository(OwnerEquitySettlement);
        for (const line of dto.settlements) {
          const row = (await settleRepo.save(
            settleRepo.create({
              equityDocumentId: doc.id,
              paymentMethodId: line.paymentMethodId,
              settlementDate: line.settlementDate,
              amount: formatScale4(line.amount),
              reference: line.reference ?? null,
              sourceSettlementId: null,
            } as any),
          )) as unknown as OwnerEquitySettlement;

          const cmd = {
            equityDocumentId: doc.id,
            settlementRowId: row.id,
            channel: methods.get(line.paymentMethodId)!.accountingChannel,
            amount: formatScale4(line.amount),
            sourceRef: doc.referenceNumber,
            entryDate: line.settlementDate,
            createdBy: username,
          };
          if (doc.type === OwnerEquityType.CAPITAL_INJECTION) {
            await this.posting.postOwnerCapitalInjection(cmd, manager);
          } else {
            await this.posting.postOwnerCashDrawing(cmd, manager);
          }
        }

        return this.persistAggregates(manager, doc, username);
      },
    );

    await this.auditLogService.log(
      'SETTLEMENT',
      'OwnerEquity',
      `Settlement recorded for owner equity: ${saved.referenceNumber}`,
      {
        entityId: saved.id,
        userId: userId || 'system',
        username,
        newValues: { settlements: dto.settlements },
      },
    );

    return saved;
  }

  async refund(
    referenceNumber: string,
    dto: RefundOwnerEquityDto,
    userId?: string,
    username?: string,
  ): Promise<OwnerEquityDocument> {
    if (!dto.refunds?.length) {
      throw new BadRequestException('At least one refund line is required');
    }
    for (const line of dto.refunds) {
      if (toMinorUnits(line.amount) <= 0n) {
        throw new BadRequestException(
          'Refund amount must be greater than zero',
        );
      }
    }

    const saved = await this.dataSource.transaction(
      async (manager: EntityManager) => {
        const doc = await this.lockByReference(manager, referenceNumber);

        if (doc.type === OwnerEquityType.STOCK_DRAWING) {
          throw new BadRequestException('Stock drawings have no settlement');
        }
        // COMPLETED is deliberately refundable (#1094): monetary completion is
        // derived from settlement, so refund is the ONLY reversal available and
        // persistAggregates() demotes the document as the money comes back out.
        if (doc.documentStatus === OwnerEquityDocumentStatus.CANCELLED) {
          throw new BadRequestException('Cancelled documents cannot be refunded');
        }

        const settleRepo = manager.getRepository(OwnerEquitySettlement);

        // Aggregate cap: refunds are negative rows, so the signed sum is net
        // settled. Counts legacy linked and new unlinked refunds alike.
        const existingRows = await settleRepo.find({
          where: { equityDocumentId: doc.id },
        } as any);
        const netSettledMinor = sumMinor(existingRows.map((r: any) => r.amount));
        const totalRefundMinor = sumMinor(dto.refunds.map((r) => r.amount));
        if (totalRefundMinor > netSettledMinor) {
          throw new BadRequestException(
            `Total refund amount (${formatScale4(totalRefundMinor)}) exceeds net settled (${formatScale4(netSettledMinor)})`,
          );
        }

        // Any active method (#1096) — no useForPurchases filter (that guard stays
        // on the settle path only), and no withDeleted.
        const methodCache = new Map<string, PaymentMethodEntity>();
        for (const line of dto.refunds) {
          if (methodCache.has(line.paymentMethodId)) continue;
          const method = await manager.getRepository(PaymentMethodEntity).findOne({
            where: { id: line.paymentMethodId, isActive: true },
          } as any);
          if (!method) {
            throw new BadRequestException(
              `Payment method ${line.paymentMethodId} not found or inactive`,
            );
          }
          methodCache.set(line.paymentMethodId, method);
        }

        for (const line of dto.refunds) {
          const method = methodCache.get(line.paymentMethodId)!;
          const refundRow = (await settleRepo.save(
            settleRepo.create({
              equityDocumentId: doc.id,
              paymentMethodId: line.paymentMethodId,
              settlementDate: line.refundDate,
              amount: '-' + formatScale4(line.amount),
              reference: line.reference ?? null,
              // NULL by design: refunds are identified by amount < 0.
              sourceSettlementId: null,
            } as any),
          )) as unknown as OwnerEquitySettlement;

          const cmd = {
            equityDocumentId: doc.id,
            settlementRowId: refundRow.id,
            channel: method.accountingChannel,
            amount: formatScale4(line.amount),
            sourceRef: doc.referenceNumber,
            entryDate: line.refundDate,
            createdBy: username,
          };
          if (doc.type === OwnerEquityType.CAPITAL_INJECTION) {
            await this.posting.postOwnerCapitalInjectionRefund(cmd, manager);
          } else {
            await this.posting.postOwnerCashDrawingRefund(cmd, manager);
          }
        }

        return this.persistAggregates(manager, doc, username);
      },
    );

    await this.auditLogService.log(
      'REFUND',
      'OwnerEquity',
      `Refund recorded for owner equity: ${saved.referenceNumber}`,
      {
        entityId: saved.id,
        userId: userId || 'system',
        username,
        newValues: { refunds: dto.refunds },
      },
    );

    return saved;
  }

  /**
   * Recompute settled/balance/status from the full settlement set (refund rows
   * net against settled rows — their amounts are negative) and derive the
   * document status, persisting both — plus the completion metadata that the
   * status implies — in the same locked transaction (spec §4.1, the
   * computeAggregates/deriveDocumentStatus split).
   */
  private async persistAggregates(
    manager: EntityManager,
    doc: OwnerEquityDocument,
    username?: string,
  ): Promise<OwnerEquityDocument> {
    const rows = await manager.getRepository(OwnerEquitySettlement).find({
      where: { equityDocumentId: doc.id },
    } as any);
    const aggregates = OwnerEquityService.computeAggregates(
      doc.totalAmount as string,
      rows,
    );
    const documentStatus = OwnerEquityService.deriveDocumentStatus(
      doc.documentStatus,
      aggregates.settlementStatus,
    );
    // Completion metadata must move with the derived status inside this same
    // locked transaction, or CHK_oe_completion_metadata rejects the write.
    const completion = OwnerEquityService.stampCompletionMetadata(
      documentStatus,
      { completedAt: doc.completedAt, completedBy: doc.completedBy },
      username,
    );
    const patch = { ...aggregates, documentStatus, ...completion };
    await manager.getRepository(OwnerEquityDocument).update(doc.id, patch);
    return { ...doc, ...patch } as unknown as OwnerEquityDocument;
  }

  private async lockByReference(
    manager: EntityManager,
    referenceNumber: string,
  ): Promise<OwnerEquityDocument> {
    const repo = manager.getRepository(OwnerEquityDocument);
    const existing = await repo.findOne({
      where: { referenceNumber },
    } as any);
    if (!existing) {
      throw new NotFoundException('Owner equity document not found');
    }
    return lockRowForUpdate(manager, OwnerEquityDocument, existing.id, {
      notFoundMessage: 'Owner equity document not found',
    });
  }
}
