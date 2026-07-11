import { Injectable, BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AccountingLookupService } from './accounting-lookup.service';
import { SettingsService } from '../../settings/settings.service';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { JournalEntry } from '../entities/journal-entry.entity';
import { JournalEntryLine } from '../entities/journal-entry-line.entity';
import { AccountType } from '../entities/account-type.enum';
import { PostingType } from '../entities/posting-type.enum';
import { AccountingSourceType } from '../entities/source-type.enum';
import { formatScale4, toMinorUnits } from '../utils/money';
import {
  AccountingPostingPort, PostResult,
} from '../../../common/accounting-posting/accounting-posting.port';
import {
  PostSalesPaymentCmd, PostSalesRefundCmd, PostSalesFulfillmentCmd,
  PostPurchasePaymentCmd, PostPurchaseRefundCmd, PostPurchaseReceiveCmd,
  PostStockAdjustmentCmd, PostOpeningBalanceCmd, ReverseEntryCmd,
} from '../../../common/accounting-posting/posting-commands';

type DraftLine = { account: ChartOfAccount; debit: string; credit: string };

@Injectable()
export class AccountingPostingService implements AccountingPostingPort {
  constructor(
    private readonly lookup: AccountingLookupService,
    private readonly settings: SettingsService,
  ) {}

  private debitLine(account: ChartOfAccount, amount: string): DraftLine {
    return { account, debit: formatScale4(amount), credit: '0.0000' };
  }
  private creditLine(account: ChartOfAccount, amount: string): DraftLine {
    return { account, debit: '0.0000', credit: formatScale4(amount) };
  }

  private async assertBalanced(lines: { debit: string; credit: string }[]): Promise<void> {
    const debit = lines.reduce((a, l) => a + toMinorUnits(l.debit), 0n);
    const credit = lines.reduce((a, l) => a + toMinorUnits(l.credit), 0n);
    if (debit !== credit) {
      throw new BadRequestException(`Journal entry not balanced: debit ${debit} != credit ${credit}`);
    }
  }

  private async build(
    params: {
      sourceType: AccountingSourceType; sourceDocumentId: string | null; sourceEventId?: string | null;
      sourceRef: string; postingType: PostingType; description: string; entryDate: string;
      createdBy?: string; reversalOfEntryId?: string | null; lines: DraftLine[];
    },
    manager: EntityManager,
  ): Promise<PostResult> {
    await this.assertBalanced(params.lines);
    for (const l of params.lines) {
      if (!l.account.isPostable) throw new BadRequestException(`Account ${l.account.code} is not postable`);
    }
    const journalNo = await this.settings.generateDocumentNumber('Journal Entries', manager);
    const entryRepo = manager.getRepository(JournalEntry);
    const lineRepo = manager.getRepository(JournalEntryLine);
    const entry = entryRepo.create({
      journalNo, entryDate: params.entryDate, sourceType: params.sourceType,
      sourceDocumentId: params.sourceDocumentId, sourceEventId: params.sourceEventId ?? null,
      sourceRef: params.sourceRef, postingType: params.postingType, description: params.description,
      createdBy: params.createdBy ?? 'system', reversalOfEntryId: params.reversalOfEntryId ?? null,
      lines: params.lines.map((l) => lineRepo.create({ accountId: l.account.id, debit: l.debit, credit: l.credit })),
    } as any);
    const saved = await entryRepo.save(entry as any);
    return { journalEntryId: (saved as any).id };
  }

  async postSalesPayment(cmd: PostSalesPaymentCmd, manager: EntityManager): Promise<PostResult> {
    const channelAcc = await this.lookup.resolveChannelAccount(cmd.channel, manager);
    const customerDeposit = await this.lookup.resolveAccount('customerDeposit', manager);
    return this.build({
      sourceType: AccountingSourceType.SALES_ORDER, sourceDocumentId: cmd.salesOrderId, sourceEventId: cmd.paymentRowId,
      sourceRef: cmd.sourceRef, postingType: PostingType.SALES_PAYMENT, description: 'Payment received',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(channelAcc, cmd.amount), this.creditLine(customerDeposit, cmd.amount)],
    }, manager);
  }

  async postSalesRefund(cmd: PostSalesRefundCmd, manager: EntityManager): Promise<PostResult> {
    const channelAcc = await this.lookup.resolveChannelAccount(cmd.channel, manager);
    const customerDeposit = await this.lookup.resolveAccount('customerDeposit', manager);
    return this.build({
      sourceType: AccountingSourceType.SALES_ORDER, sourceDocumentId: cmd.salesOrderId, sourceEventId: cmd.refundRowId,
      sourceRef: cmd.sourceRef, postingType: PostingType.SALES_REFUND, description: 'Refund issued',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(customerDeposit, cmd.amount), this.creditLine(channelAcc, cmd.amount)],
    }, manager);
  }

  async postSalesFulfillment(cmd: PostSalesFulfillmentCmd, manager: EntityManager) {
    const customerDeposit = await this.lookup.resolveAccount('customerDeposit', manager);
    const salesRevenue = await this.lookup.resolveAccount('salesRevenue', manager);
    const revenue = await this.build({
      sourceType: AccountingSourceType.SALES_ORDER, sourceDocumentId: cmd.salesOrderId,
      sourceRef: cmd.sourceRef, postingType: PostingType.SALES_FULFILLMENT_REVENUE, description: 'Sales fulfillment (revenue)',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(customerDeposit, cmd.revenueAmount), this.creditLine(salesRevenue, cmd.revenueAmount)],
    }, manager);

    // Zero-cost fulfillment (e.g. service products): skip the COGS JE entirely.
    // A negative COGS is invalid (would violate CHK_jel_nonneg) — reject with a clear message.
    const cogsMinor = toMinorUnits(cmd.cogsAmount);
    if (cogsMinor < 0n) {
      throw new BadRequestException(`COGS amount must not be negative: ${cmd.cogsAmount}`);
    }
    let cogsEntryId: string | null = null;
    if (cogsMinor > 0n) {
      const cogs = await this.lookup.resolveAccount('cogs', manager);
      const inventory = await this.lookup.resolveAccount('inventory', manager);
      const cogsRes = await this.build({
        sourceType: AccountingSourceType.SALES_ORDER, sourceDocumentId: cmd.salesOrderId,
        sourceRef: cmd.sourceRef, postingType: PostingType.SALES_FULFILLMENT_COGS, description: 'Sales fulfillment (COGS)',
        entryDate: cmd.entryDate, createdBy: cmd.createdBy,
        lines: [this.debitLine(cogs, cmd.cogsAmount), this.creditLine(inventory, cmd.cogsAmount)],
      }, manager);
      cogsEntryId = cogsRes.journalEntryId;
    }
    return { revenueEntryId: revenue.journalEntryId, cogsEntryId };
  }

  async postPurchasePayment(cmd: PostPurchasePaymentCmd, manager: EntityManager): Promise<PostResult> {
    const supplierDeposit = await this.lookup.resolveAccount('supplierDeposit', manager);
    const channelAcc = await this.lookup.resolveChannelAccount(cmd.channel, manager);
    return this.build({
      sourceType: AccountingSourceType.PURCHASE_ORDER, sourceDocumentId: cmd.purchaseOrderId, sourceEventId: cmd.paymentRowId,
      sourceRef: cmd.sourceRef, postingType: PostingType.PURCHASE_PAYMENT, description: 'Supplier payment',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(supplierDeposit, cmd.amount), this.creditLine(channelAcc, cmd.amount)],
    }, manager);
  }

  async postPurchaseRefund(cmd: PostPurchaseRefundCmd, manager: EntityManager): Promise<PostResult> {
    const supplierDeposit = await this.lookup.resolveAccount('supplierDeposit', manager);
    const channelAcc = await this.lookup.resolveChannelAccount(cmd.channel, manager);
    return this.build({
      sourceType: AccountingSourceType.PURCHASE_ORDER, sourceDocumentId: cmd.purchaseOrderId, sourceEventId: cmd.refundRowId,
      sourceRef: cmd.sourceRef, postingType: PostingType.PURCHASE_REFUND, description: 'Supplier refund',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(channelAcc, cmd.amount), this.creditLine(supplierDeposit, cmd.amount)],
    }, manager);
  }

  async postPurchaseReceive(cmd: PostPurchaseReceiveCmd, manager: EntityManager): Promise<PostResult> {
    const inventory = await this.lookup.resolveAccount('inventory', manager);
    const supplierDeposit = await this.lookup.resolveAccount('supplierDeposit', manager);
    return this.build({
      sourceType: AccountingSourceType.PURCHASE_ORDER, sourceDocumentId: cmd.purchaseOrderId,
      sourceRef: cmd.sourceRef, postingType: PostingType.PURCHASE_RECEIVE, description: 'Goods received',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(inventory, cmd.amount), this.creditLine(supplierDeposit, cmd.amount)],
    }, manager);
  }

  async postStockAdjustment(cmd: PostStockAdjustmentCmd, manager: EntityManager): Promise<PostResult> {
    const inventory = await this.lookup.resolveAccount('inventory', manager);
    const expense = await this.lookup.resolveAccount('defaultExpense', manager);
    const incMinor = toMinorUnits(cmd.increaseAmount);
    const decMinor = toMinorUnits(cmd.decreaseAmount);
    if (incMinor === 0n && decMinor === 0n) {
      throw new BadRequestException('Stock adjustment has no value to post');
    }
    // Build both directional pairs in ONE balanced JE so gross increase/decrease
    // audit is preserved even when they net to zero.
    // Increase: Dr Inventory / Cr Expense.  Decrease: Dr Expense / Cr Inventory.
    const lines: DraftLine[] = [];
    if (incMinor > 0n) {
      lines.push(this.debitLine(inventory, cmd.increaseAmount));
      lines.push(this.creditLine(expense, cmd.increaseAmount));
    }
    if (decMinor > 0n) {
      lines.push(this.debitLine(expense, cmd.decreaseAmount));
      lines.push(this.creditLine(inventory, cmd.decreaseAmount));
    }
    return this.build({
      sourceType: AccountingSourceType.STOCK_ADJUSTMENT, sourceDocumentId: cmd.adjustmentId,
      sourceRef: cmd.sourceRef, postingType: PostingType.STOCK_ADJUSTMENT, description: 'Stock adjustment',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy, lines,
    }, manager);
  }

  async postOpeningBalance(cmd: PostOpeningBalanceCmd, manager: EntityManager): Promise<PostResult> {
    const obe = await this.lookup.resolveAccount('openingBalanceEquity', manager);
    const accountRepo = manager.getRepository(ChartOfAccount);
    const account = await accountRepo.findOne({ where: { id: cmd.accountId } as any });
    if (!account) throw new BadRequestException('Opening-balance account not found');
    // Derive normal side from the LOADED account's type — never trust a caller-supplied accountType.
    const debitNormalType = account.type === AccountType.ASSET || account.type === AccountType.EXPENSE;
    // A negative opening balance flips the side (lines must stay non-negative — CHK_jel_nonneg).
    const minor = toMinorUnits(cmd.amount);
    if (minor === 0n) throw new BadRequestException('Opening balance must be non-zero');
    const positiveAmount = formatScale4(minor < 0n ? -minor : minor);
    const debitOnAccount = minor < 0n ? !debitNormalType : debitNormalType;
    const lines = debitOnAccount
      ? [this.debitLine(account, positiveAmount), this.creditLine(obe, positiveAmount)]
      : [this.creditLine(account, positiveAmount), this.debitLine(obe, positiveAmount)];
    return this.build({
      sourceType: AccountingSourceType.OPENING_BALANCE, sourceDocumentId: cmd.accountId,
      sourceRef: cmd.sourceRef, postingType: PostingType.OPENING_BALANCE, description: 'Opening balance',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy, lines,
    }, manager);
  }

  async reverseEntry(cmd: ReverseEntryCmd, manager: EntityManager): Promise<PostResult> {
    const entryRepo = manager.getRepository(JournalEntry);
    const original = await entryRepo.findOne({ where: { id: cmd.originalEntryId } as any, relations: { lines: true } });
    if (!original) throw new BadRequestException('Original entry not found');
    const accountRepo = manager.getRepository(ChartOfAccount);
    const swapped: DraftLine[] = [];
    for (const l of original.lines) {
      const account = await accountRepo.findOne({ where: { id: l.accountId } as any });
      if (!account) throw new BadRequestException(`Account ${l.accountId} for reversal not found`);
      // Swap debit/credit; the real account carries the isPostable guard.
      swapped.push({ account, debit: l.credit, credit: l.debit });
    }
    return this.build({
      sourceType: original.sourceType, sourceDocumentId: original.sourceDocumentId,
      sourceEventId: original.sourceEventId, sourceRef: original.sourceRef,
      postingType: original.postingType, description: `Reversal of ${original.journalNo}`,
      entryDate: cmd.entryDate, createdBy: cmd.createdBy, reversalOfEntryId: original.id,
      lines: swapped,
    }, manager);
  }

  async reverseEntriesForDocument(sourceType, sourceDocumentId, postingTypes, entryDate, manager, createdBy?) {
    const entryRepo = manager.getRepository(JournalEntry);
    // Only reverse entries not already reversed (no row points at them).
    const originals: JournalEntry[] = await entryRepo
      .createQueryBuilder('e')
      .where('e.sourceType = :sourceType', { sourceType })
      .andWhere('e.sourceDocumentId = :sourceDocumentId', { sourceDocumentId })
      .andWhere('e.postingType IN (:...types)', { types: postingTypes })
      .andWhere('e.reversalOfEntryId IS NULL')
      .andWhere('NOT EXISTS (SELECT 1 FROM journal_entry r WHERE r."reversalOfEntryId" = e.id)')
      .getMany();
    const results: PostResult[] = [];
    for (const o of originals) {
      results.push(await this.reverseEntry({ originalEntryId: o.id, entryDate, createdBy }, manager));
    }
    return results;
  }
}
