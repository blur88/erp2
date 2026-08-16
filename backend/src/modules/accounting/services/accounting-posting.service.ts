import { Injectable, BadRequestException } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { AccountingLookupService } from './accounting-lookup.service';
import { SettingsService } from '../../settings/settings.service';
import { ChartOfAccount } from '../entities/chart-of-account.entity';
import { JournalEntry } from '../entities/journal-entry.entity';
import { JournalEntryLine } from '../entities/journal-entry-line.entity';
import { AccountType } from '../entities/account-type.enum';
import { PostingType } from '../entities/posting-type.enum';
import { AccountingSourceType } from '../entities/source-type.enum';
import { formatScale4, toMinorUnits } from '@/common/utils/money';
import {
  AccountingPostingPort, PostResult,
} from '../../../common/accounting-posting/accounting-posting.port';
import {
  PostSalesPaymentCmd, PostSalesRefundCmd, PostSalesFulfillmentCmd,
  PostPurchasePaymentCmd, PostPurchaseRefundCmd, PostPurchaseReceiveCmd,
  PostStockAdjustmentCmd, PostOpeningBalanceCmd, PostExpensePaymentCmd, PostExpenseRefundCmd,
  PostOwnerCapitalInjectionCmd, PostOwnerCapitalInjectionRefundCmd,
  PostOwnerCashDrawingCmd, PostOwnerCashDrawingRefundCmd, PostOwnerStockDrawingCmd,
  ReverseEntryCmd,
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
    // Event-keyed entries race: findExistingEntry() is a check-then-act, so two
    // concurrent identical commands can both find nothing and both insert.
    // UQ_journal_entry_source_event makes the DB the authority; here we absorb
    // the conflict and return the winner.
    //
    // The insert runs inside a SAVEPOINT because a unique violation marks the
    // whole transaction as failed in PostgreSQL — querying for the winning row
    // afterwards on the same transaction would itself error. Rolling back to
    // the savepoint restores a usable transaction without discarding the
    // caller's earlier work (the movement insert, the settlement row, ...).
    const isEventKeyed = params.sourceEventId != null && params.reversalOfEntryId == null;
    if (!isEventKeyed) {
      const saved = await entryRepo.save(entry as any);
      return { journalEntryId: (saved as any).id };
    }

    await manager.query('SAVEPOINT je_insert');
    try {
      const saved = await entryRepo.save(entry as any);
      await manager.query('RELEASE SAVEPOINT je_insert');
      return { journalEntryId: (saved as any).id };
    } catch (err) {
      if ((err as { code?: string })?.code !== '23505') throw err;
      await manager.query('ROLLBACK TO SAVEPOINT je_insert');
      const winner = await this.findExistingEntry(
        params.sourceType, params.sourceEventId as string, params.postingType, manager,
      );
      if (!winner) {
        // A 23505 on some other unique index (journalNo, most likely) — not our
        // idempotency conflict. Re-throw rather than silently returning nothing.
        throw err;
      }
      return winner;
    }
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

  private async findExistingEntry(
    sourceType: AccountingSourceType, sourceEventId: string, postingType: PostingType, manager: EntityManager,
  ): Promise<PostResult | null> {
    const existing = await manager.getRepository(JournalEntry).findOne({
      where: { sourceType, sourceEventId, postingType, reversalOfEntryId: IsNull() } as any,
    });
    return existing ? { journalEntryId: (existing as any).id } : null;
  }

  async postExpensePayment(cmd: PostExpensePaymentCmd, manager: EntityManager): Promise<PostResult> {
    const existing = await this.findExistingEntry(AccountingSourceType.EXPENSE, cmd.paymentRowId, PostingType.EXPENSE_PAYMENT, manager);
    if (existing) return existing;
    const expenseAcc = await manager.getRepository(ChartOfAccount).findOne({ where: { id: cmd.expenseAccountId } as any });
    if (!expenseAcc) throw new BadRequestException(`Expense account ${cmd.expenseAccountId} not found`);
    const channelAcc = await this.lookup.resolveChannelAccount(cmd.channel, manager);
    return this.build({
      sourceType: AccountingSourceType.EXPENSE, sourceDocumentId: cmd.expenseId, sourceEventId: cmd.paymentRowId,
      sourceRef: cmd.sourceRef, postingType: PostingType.EXPENSE_PAYMENT, description: 'Expense payment',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(expenseAcc, cmd.amount), this.creditLine(channelAcc, cmd.amount)],
    }, manager);
  }

  async postExpenseRefund(cmd: PostExpenseRefundCmd, manager: EntityManager): Promise<PostResult> {
    const existing = await this.findExistingEntry(AccountingSourceType.EXPENSE, cmd.refundRowId, PostingType.EXPENSE_REFUND, manager);
    if (existing) return existing;
    const expenseAcc = await manager.getRepository(ChartOfAccount).findOne({ where: { id: cmd.expenseAccountId } as any });
    if (!expenseAcc) throw new BadRequestException(`Expense account ${cmd.expenseAccountId} not found`);
    const channelAcc = await this.lookup.resolveChannelAccount(cmd.channel, manager);
    return this.build({
      sourceType: AccountingSourceType.EXPENSE, sourceDocumentId: cmd.expenseId, sourceEventId: cmd.refundRowId,
      sourceRef: cmd.sourceRef, postingType: PostingType.EXPENSE_REFUND, description: 'Expense payment refund',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(channelAcc, cmd.amount), this.creditLine(expenseAcc, cmd.amount)],
    }, manager);
  }

  async postOwnerCapitalInjection(cmd: PostOwnerCapitalInjectionCmd, manager: EntityManager): Promise<PostResult> {
    // Idempotency guard, same shape as postExpensePayment (:195). A retried
    // settlement must return the first entry, never post a second.
    const existing = await this.findExistingEntry(
      AccountingSourceType.OWNER_EQUITY, cmd.settlementRowId,
      PostingType.OWNER_CAPITAL_INJECTION, manager);
    if (existing) return existing;
    const channelAcc = await this.lookup.resolveChannelAccount(cmd.channel, manager);
    const ownerCapital = await this.lookup.resolveAccount('ownerCapital', manager);
    return this.build({
      sourceType: AccountingSourceType.OWNER_EQUITY, sourceDocumentId: cmd.equityDocumentId,
      sourceEventId: cmd.settlementRowId, sourceRef: cmd.sourceRef,
      postingType: PostingType.OWNER_CAPITAL_INJECTION, description: 'Owner capital injection',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(channelAcc, cmd.amount), this.creditLine(ownerCapital, cmd.amount)],
    }, manager);
  }

  async postOwnerCapitalInjectionRefund(cmd: PostOwnerCapitalInjectionRefundCmd, manager: EntityManager): Promise<PostResult> {
    const existing = await this.findExistingEntry(
      AccountingSourceType.OWNER_EQUITY, cmd.settlementRowId,
      PostingType.OWNER_CAPITAL_INJECTION_REFUND, manager);
    if (existing) return existing;
    const channelAcc = await this.lookup.resolveChannelAccount(cmd.channel, manager);
    const ownerCapital = await this.lookup.resolveAccount('ownerCapital', manager);
    return this.build({
      sourceType: AccountingSourceType.OWNER_EQUITY, sourceDocumentId: cmd.equityDocumentId,
      sourceEventId: cmd.settlementRowId, sourceRef: cmd.sourceRef,
      postingType: PostingType.OWNER_CAPITAL_INJECTION_REFUND, description: 'Owner capital injection refund',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(ownerCapital, cmd.amount), this.creditLine(channelAcc, cmd.amount)],
    }, manager);
  }

  async postOwnerCashDrawing(cmd: PostOwnerCashDrawingCmd, manager: EntityManager): Promise<PostResult> {
    const existing = await this.findExistingEntry(
      AccountingSourceType.OWNER_EQUITY, cmd.settlementRowId,
      PostingType.OWNER_CASH_DRAWING, manager);
    if (existing) return existing;
    const channelAcc = await this.lookup.resolveChannelAccount(cmd.channel, manager);
    const ownerDrawings = await this.lookup.resolveAccount('ownerDrawings', manager);
    return this.build({
      sourceType: AccountingSourceType.OWNER_EQUITY, sourceDocumentId: cmd.equityDocumentId,
      sourceEventId: cmd.settlementRowId, sourceRef: cmd.sourceRef,
      postingType: PostingType.OWNER_CASH_DRAWING, description: 'Owner cash drawing',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(ownerDrawings, cmd.amount), this.creditLine(channelAcc, cmd.amount)],
    }, manager);
  }

  async postOwnerCashDrawingRefund(cmd: PostOwnerCashDrawingRefundCmd, manager: EntityManager): Promise<PostResult> {
    const existing = await this.findExistingEntry(
      AccountingSourceType.OWNER_EQUITY, cmd.settlementRowId,
      PostingType.OWNER_CASH_DRAWING_REFUND, manager);
    if (existing) return existing;
    const channelAcc = await this.lookup.resolveChannelAccount(cmd.channel, manager);
    const ownerDrawings = await this.lookup.resolveAccount('ownerDrawings', manager);
    return this.build({
      sourceType: AccountingSourceType.OWNER_EQUITY, sourceDocumentId: cmd.equityDocumentId,
      sourceEventId: cmd.settlementRowId, sourceRef: cmd.sourceRef,
      postingType: PostingType.OWNER_CASH_DRAWING_REFUND, description: 'Owner cash drawing refund',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(channelAcc, cmd.amount), this.creditLine(ownerDrawings, cmd.amount)],
    }, manager);
  }

  async postOwnerStockDrawing(cmd: PostOwnerStockDrawingCmd, manager: EntityManager): Promise<PostResult> {
    // Keyed on the movement id, so a re-completion after uncomplete presents a
    // NEW key and correctly posts a fresh original (spec §5.2), while a retry
    // of the same completion is deduplicated.
    const existing = await this.findExistingEntry(
      AccountingSourceType.OWNER_EQUITY, cmd.stockMovementId,
      PostingType.OWNER_STOCK_DRAWING, manager);
    if (existing) return existing;
    const ownerDrawings = await this.lookup.resolveAccount('ownerDrawings', manager);
    const inventory = await this.lookup.resolveAccount('inventory', manager);
    return this.build({
      sourceType: AccountingSourceType.OWNER_EQUITY, sourceDocumentId: cmd.equityDocumentId,
      // Freshly minted movement id — see PostOwnerStockDrawingCmd for why.
      sourceEventId: cmd.stockMovementId, sourceRef: cmd.sourceRef,
      postingType: PostingType.OWNER_STOCK_DRAWING, description: 'Owner stock drawing',
      entryDate: cmd.entryDate, createdBy: cmd.createdBy,
      lines: [this.debitLine(ownerDrawings, cmd.amount), this.creditLine(inventory, cmd.amount)],
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
