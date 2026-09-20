import { Injectable, BadRequestException } from '@nestjs/common';
import { EntityManager, In, IsNull } from 'typeorm';
import { JournalEntry } from '../../accounting/entities/journal-entry.entity';
import { ChartOfAccount } from '../../accounting/entities/chart-of-account.entity';
import { AccountingLookupService } from '../../accounting/services/accounting-lookup.service';
import { PostingType, AccountingSourceType } from '../../../common/accounting-posting/enums';
import { toMinorUnits } from '@/common/utils/money';

/**
 * Derive the provider clearing account from the payments' ORIGINAL journal
 * entries (#1257).
 *
 * NOT from the live payment-method mapping. If that mapping changed after a
 * payment posted, the current mapping names a different account from the one
 * the payment actually debited — the settlement would credit an account those
 * payments never touched, the journal would still balance, nothing would error,
 * and the old account's residue would become permanently undrainable.
 */
@Injectable()
export class ProviderSettlementDerivationService {
  constructor(private readonly lookup: AccountingLookupService) {}

  async deriveClearingAccountId(
    payments: Array<{ id: string; salesOrderId: string; amount: string }>,
    manager: EntityManager,
  ): Promise<string> {
    if (payments.length === 0) {
      throw new BadRequestException('Select at least one payment');
    }
    const depositAccount = await this.lookup.resolveAccount('customerDeposit', manager);

    // Fetch on the FULL key, not sourceEventId alone. sourceEventId is a bare
    // uuid match across every source type, and a Map keyed only by it would let
    // one entry silently OVERWRITE another — the last row wins and the caller
    // never learns two matched.
    const entries = await manager.getRepository(JournalEntry).find({
      where: payments.map((p) => ({
        sourceType: AccountingSourceType.SALES_ORDER,
        sourceDocumentId: p.salesOrderId,
        sourceEventId: p.id,
        postingType:
          toMinorUnits(p.amount) < 0n ? PostingType.SALES_REFUND : PostingType.SALES_PAYMENT,
        reversalOfEntryId: IsNull(),
      })) as any,
      relations: { lines: true },
    });

    // Exclude any entry that has itself been reversed.
    const reversedIds = await this.reversedEntryIds(entries.map((e) => e.id), manager);
    const active = entries.filter((e) => !reversedIds.has(e.id));

    // Group by event, then require EXACTLY ONE active match per payment.
    const byEvent = new Map<string, JournalEntry[]>();
    for (const e of active) {
      const bucket = byEvent.get(e.sourceEventId as string) ?? [];
      bucket.push(e);
      byEvent.set(e.sourceEventId as string, bucket);
    }

    const accounts = new Map<string, string[]>();
    for (const p of payments) {
      const matches = byEvent.get(p.id) ?? [];
      if (matches.length === 0) {
        throw new BadRequestException(
          `Payment ${p.id} has no active journal entry; it may have been reversed`,
        );
      }
      if (matches.length > 1) {
        throw new BadRequestException(
          `Payment ${p.id} matches ${matches.length} active journal entries ` +
            `(${matches.map((m) => m.journalNo).join(', ')}); expected exactly one`,
        );
      }
      const accountId = this.clearingAccountFor(p, matches[0], depositAccount.id);
      const bucket = accounts.get(accountId) ?? [];
      bucket.push(p.id);
      accounts.set(accountId, bucket);
    }

    if (accounts.size > 1) {
      // Name the ACCOUNT LABELS and the PAYMENT IDS, not a uuid and a count —
      // the user has to know which rows to split out, and a bare uuid tells
      // them nothing they can act on.
      const labels = await manager.getRepository(ChartOfAccount).find({
        where: { id: In([...accounts.keys()]) } as any,
      });
      const labelFor = (id: string) => {
        const a = labels.find((l) => l.id === id);
        return a ? `${a.code} ${a.name}` : id;
      };
      const detail = [...accounts.entries()]
        .map(([acc, ids]) => `${labelFor(acc)}: ${ids.join(', ')}`)
        .join('; ');
      throw new BadRequestException(
        `Selected payments posted to different clearing accounts — ${detail}. ` +
          `Settle each account in its own settlement.`,
      );
    }
    return [...accounts.keys()][0];
  }

  private async reversedEntryIds(
    ids: string[],
    manager: EntityManager,
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const reversals = await manager.getRepository(JournalEntry).find({
      where: { reversalOfEntryId: In(ids) } as any,
      select: { reversalOfEntryId: true } as any,
    });
    return new Set(reversals.map((r) => r.reversalOfEntryId as string));
  }

  /**
   * Validate the entry's COMPLETE two-line shape and derive by posting
   * direction. "The line that is not customer deposit" is too permissive alone:
   * it would accept a three-line entry, one with no deposit side, or one whose
   * two lines share an account, and silently pick something wrong.
   */
  private clearingAccountFor(
    payment: { id: string; salesOrderId: string; amount: string },
    entry: JournalEntry | undefined,
    depositAccountId: string,
  ): string {
    const isRefund = toMinorUnits(payment.amount) < 0n;
    const expectedType = isRefund ? PostingType.SALES_REFUND : PostingType.SALES_PAYMENT;

    if (!entry) {
      throw new BadRequestException(
        `Payment ${payment.id} has no active journal entry; it may have been reversed`,
      );
    }
    if (entry.sourceDocumentId !== payment.salesOrderId) {
      throw new BadRequestException(
        `Payment ${payment.id}: journal entry belongs to a different sales order`,
      );
    }
    if (entry.postingType !== expectedType) {
      throw new BadRequestException(
        `Payment ${payment.id}: expected ${expectedType}, found ${entry.postingType}`,
      );
    }

    const lines = entry.lines ?? [];
    if (lines.length !== 2) {
      throw new BadRequestException(
        `Payment ${payment.id}: journal entry has ${lines.length} lines, expected exactly 2`,
      );
    }

    const amountMinor = toMinorUnits(payment.amount);
    const absMinor = amountMinor < 0n ? -amountMinor : amountMinor;

    // Payment: clearing debit / deposit credit. Refund: deposit debit / clearing credit.
    const depositSide = isRefund ? 'debit' : 'credit';
    const clearingSide = isRefund ? 'credit' : 'debit';

    const depositLine = lines.find((l) => l.accountId === depositAccountId);
    if (!depositLine) {
      throw new BadRequestException(
        `Payment ${payment.id}: journal entry has no customer deposit line`,
      );
    }
    const clearingLine = lines.find((l) => l !== depositLine);
    if (!clearingLine || clearingLine.accountId === depositAccountId) {
      throw new BadRequestException(
        `Payment ${payment.id}: both journal lines post to the customer deposit account`,
      );
    }

    // Check BOTH sides of both lines. Asserting only the populated side would
    // accept a line carrying a value on the opposite side too (debit 98 AND
    // credit 98), which is not the shape either posting flow produces and would
    // mean the entry is something else entirely.
    const otherSide = depositSide === 'debit' ? 'credit' : 'debit';
    if (toMinorUnits(depositLine[depositSide]) !== absMinor) {
      throw new BadRequestException(
        `Payment ${payment.id}: deposit line ${depositSide} does not equal the payment amount`,
      );
    }
    if (toMinorUnits(depositLine[otherSide]) !== 0n) {
      throw new BadRequestException(
        `Payment ${payment.id}: deposit line ${otherSide} must be zero`,
      );
    }
    if (toMinorUnits(clearingLine[clearingSide]) !== absMinor) {
      throw new BadRequestException(
        `Payment ${payment.id}: clearing line ${clearingSide} does not equal the payment amount`,
      );
    }
    if (toMinorUnits(clearingLine[otherSide === 'debit' ? 'credit' : 'debit']) !== 0n) {
      throw new BadRequestException(
        `Payment ${payment.id}: clearing line ${otherSide === 'debit' ? 'credit' : 'debit'} must be zero`,
      );
    }
    return clearingLine.accountId;
  }
}
