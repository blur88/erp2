import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { JournalEntryService } from './journal-entry.service';
import { AccountMappingService } from './account-mapping.service';
import { FiscalPeriodService } from './fiscal-period.service';
import { MappingType } from '../../../database/entities/account-mapping.entity';
import { JournalEntry, JournalEntryStatus } from '../../../database/entities/journal-entry.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
import {
  StockAdjustment,
  StockAdjustmentItem,
} from '../../../database/entities/stock-adjustment.entity';
import { Settlement } from '../../../database/entities/settlement.entity';
import {
  OwnerEquityTransaction,
  OwnerEquityTransactionType,
} from '../../../database/entities/owner-equity-transaction.entity';
import { Expense } from '../../../database/entities/expense.entity';
import {
  CreateJournalEntryDto,
  CreateJournalEntryLineDto,
  PostOpeningBalancesDto,
} from '../dto/journal-entry.dto';
import { AuditLogService } from '../../audit-logs/services';

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(
    private readonly journalEntryService: JournalEntryService,
    private readonly accountMappingService: AccountMappingService,
    private readonly fiscalPeriodService: FiscalPeriodService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Post journal entry for sales order fulfillment
   * Creates entries for COGS and Revenue recognition
   */
  async postSalesOrderEntry(
    salesOrder: SalesOrder,
    userId: string,
    username?: string,
    manager?: EntityManager,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting sales order entry for ${salesOrder.orderNumber}`);

    // Guard: skip if an active (POSTED or DRAFT) entry already exists for this source
    const existingEntries = await this.journalEntryService.findBySource(
      'sales_order',
      salesOrder.id,
    );
    const activeEntry = existingEntries.find(
      (e) => e.status === JournalEntryStatus.POSTED || e.status === JournalEntryStatus.DRAFT,
    );
    if (activeEntry) {
      this.logger.warn(
        `Journal entry already exists for sales order ${salesOrder.orderNumber} (${activeEntry.referenceNumber}) - skipping duplicate`,
      );
      return activeEntry as any;
    }

    // Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // Validate required mappings exist
    this.validateMapping(mappings, MappingType.SALES_REVENUE, 'Sales Revenue');
    this.validateMapping(mappings, MappingType.SALES_AR, 'Accounts Receivable');
    this.validateMapping(mappings, MappingType.SALES_COGS, 'Cost of Goods Sold');
    this.validateMapping(mappings, MappingType.SALES_INVENTORY, 'Inventory Asset');

    // Validate period is open
    await this.validatePeriodOpen(salesOrder.fulfilledDate);

    // Get the period for this date
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: salesOrder.fulfilledDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(`No fiscal period found for date ${salesOrder.fulfilledDate}`);
    }

    // Guard: items relation must be loaded — without it revenue and COGS are both wrong
    if (salesOrder.items == null) {
      throw new BadRequestException(
        `Cannot post sales order entry for ${salesOrder.orderNumber}: items relation not loaded`,
      );
    }

    // Calculate COGS
    const cogsAmount = this.calculateCOGS(salesOrder.items);

    // Derive revenue from items (defensive: avoids stale totalAmount column)
    const itemsSubtotal = salesOrder.items.reduce(
      (sum, item) => sum + Number(item.totalAmount ?? 0),
      0,
    );
    const revenueAmount = itemsSubtotal + Number(salesOrder.shippingAmount ?? 0);

    // Build BOTH entry DTOs up front so all business-rule validation (mappings,
    // period, amounts) happens before anything is persisted. Post COGS first so
    // that if the revenue post fails after COGS posted, a re-run hits the
    // duplicate guard (which sees the COGS entry) and never double-posts.
    const baseDescription = `Sales Order ${salesOrder.orderNumber} - ${salesOrder.customer.name}`;

    const cogsEntryDto: CreateJournalEntryDto | null =
      cogsAmount > 0
        ? {
            entryDate: new Date(salesOrder.fulfilledDate),
            description: `${baseDescription} (Cost of Goods Sold)`,
            fiscalPeriodId: periodValidation.period.id,
            sourceType: 'sales_order',
            sourceId: salesOrder.id,
            lines: [
              {
                accountId: mappings[MappingType.SALES_COGS],
                debitAmount: cogsAmount,
                creditAmount: 0,
                memo: 'Cost of goods sold',
              },
              {
                accountId: mappings[MappingType.SALES_INVENTORY],
                debitAmount: 0,
                creditAmount: cogsAmount,
                memo: 'Inventory reduction',
              },
            ],
          }
        : null;

    const revenueEntryDto: CreateJournalEntryDto = {
      entryDate: new Date(salesOrder.fulfilledDate),
      description: `${baseDescription} (Revenue)`,
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'sales_order',
      sourceId: salesOrder.id,
      lines: [
        {
          accountId: mappings[MappingType.SALES_AR],
          debitAmount: revenueAmount,
          creditAmount: 0,
          memo: 'Amount receivable from customer',
        },
        {
          accountId: mappings[MappingType.SALES_REVENUE],
          debitAmount: 0,
          creditAmount: revenueAmount,
          memo: 'Sales revenue recognition',
        },
      ],
    };

    // TODO(#719): manager accepted for transactional call-site uniformity; JournalEntryService persistence is not yet manager-bound.

    // Post COGS entry first (when there is a cost to record)
    if (cogsEntryDto) {
      const cogsEntry = await this.journalEntryService.create(cogsEntryDto, userId);
      await this.journalEntryService.postEntry(cogsEntry.id, userId);
      await this.auditLogService.log(
        'AUTO_POST',
        'JournalEntry',
        `Auto-posted sales order COGS journal entry for order: ${salesOrder.orderNumber}`,
        {
          entityId: cogsEntry.id,
          userId: userId ?? 'system',
          username,
          metadata: { sourceType: 'sales_order', sourceId: salesOrder.id },
        },
      );
    }

    // Post revenue entry
    const revenueEntry = await this.journalEntryService.create(revenueEntryDto, userId);
    const postedRevenueEntry = await this.journalEntryService.postEntry(revenueEntry.id, userId);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted sales order revenue journal entry for order: ${salesOrder.orderNumber}`,
      {
        entityId: revenueEntry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'sales_order', sourceId: salesOrder.id },
      },
    );

    this.logger.log(`Sales order entries posted successfully for order: ${salesOrder.orderNumber}`);

    return postedRevenueEntry as any;
  }

  /**
   * Post journal entry for customer payment
   * DR Cash, CR Accounts Receivable
   */
  async postCustomerPaymentEntry(
    payment: Payment,
    userId: string,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting customer payment entry for ${payment.paymentNumber}`);

    // Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // Validate required mappings exist
    const paymentMethodCode = payment.paymentMethodEntity?.code || 'CASH';
    const debitMappingKey = `payment_${paymentMethodCode.toLowerCase()}`;

    this.validateMappingByKey(mappings, debitMappingKey, `payment method "${paymentMethodCode}"`);
    this.validateMapping(mappings, MappingType.PAYMENT_AR, 'Accounts Receivable');

    // Validate period is open
    await this.validatePeriodOpen(payment.paymentDate);

    // Get the period for this date
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: payment.paymentDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(`No fiscal period found for date ${payment.paymentDate}`);
    }

    // Build journal entry lines
    const lines: CreateJournalEntryLineDto[] = [
      // DR Cash in Hand
      {
        accountId: mappings[debitMappingKey],
        debitAmount: Number(payment.amount),
        creditAmount: 0,
        memo: 'Cash received',
      },
      // CR Accounts Receivable
      {
        accountId: mappings[MappingType.PAYMENT_AR],
        debitAmount: 0,
        creditAmount: Number(payment.amount),
        memo: 'Accounts receivable reduction',
      },
    ];

    // Create journal entry DTO
    const entryDto: CreateJournalEntryDto = {
      entryDate: new Date(payment.paymentDate),
      description: `Payment ${payment.paymentNumber} from ${payment.customer.name}`,
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'payment',
      sourceId: payment.id,
      lines,
    };

    // Create and post the entry
    const entry = await this.journalEntryService.create(entryDto, userId);
    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted customer payment journal entry: ${payment.paymentNumber}`,
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'payment', sourceId: payment.id },
      },
    );

    this.logger.log(`Payment entry posted successfully: ${postedEntry.referenceNumber}`);
    return postedEntry as any;
  }

  /**
   * Post journal entry for settlement
   * DR settlement account (bank), CR payment receivable account
   */
  async postSettlementEntry(
    settlement: Settlement,
    paymentMethod: PaymentMethodEntity,
    amount: number,
    userId: string,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting settlement entry for ${settlement.settlementNumber}`);

    const mappings = await this.accountMappingService.getMappings();

    const paymentMappingKey = `payment_${paymentMethod.code.toLowerCase()}`;
    const settlementMappingKey = `payment_${paymentMethod.code.toLowerCase()}_settlement`;

    this.validateMappingByKey(mappings, paymentMappingKey, `${paymentMethod.name} payment account`);
    this.validateMappingByKey(
      mappings,
      settlementMappingKey,
      `${paymentMethod.name} settlement account`,
    );

    await this.validatePeriodOpen(settlement.settlementDate);
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: settlement.settlementDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(`No fiscal period found for date ${settlement.settlementDate}`);
    }

    const lines: CreateJournalEntryLineDto[] = [
      {
        accountId: mappings[settlementMappingKey],
        debitAmount: Number(amount),
        creditAmount: 0,
        memo: `${paymentMethod.name} settlement to bank`,
      },
      {
        accountId: mappings[paymentMappingKey],
        debitAmount: 0,
        creditAmount: Number(amount),
        memo: `${paymentMethod.name} receivable settled`,
      },
    ];

    const entry = await this.journalEntryService.create(
      {
        entryDate: new Date(settlement.settlementDate),
        description: `Settlement ${settlement.settlementNumber} - ${paymentMethod.name}`,
        fiscalPeriodId: periodValidation.period.id,
        sourceType: 'settlement',
        sourceId: settlement.id,
        lines,
      },
      userId,
    );

    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted settlement journal entry: ${settlement.settlementNumber}`,
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'settlement', sourceId: settlement.id },
      },
    );
    this.logger.log(`Settlement entry posted successfully: ${postedEntry.referenceNumber}`);
    return postedEntry as any;
  }

  /**
   * Post journal entry for purchase receipt
   * DR Inventory Asset, CR Accounts Payable
   */
  async postPurchaseReceiptEntry(
    purchaseOrder: PurchaseOrder,
    userId: string,
    receiveDate: Date,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting purchase receipt entry for ${purchaseOrder.orderNumber}`);

    const existingEntries = await this.journalEntryService.findBySource(
      'purchase_order',
      purchaseOrder.id,
    );
    const activeEntry = existingEntries.find(
      (entry) =>
        entry.status === JournalEntryStatus.POSTED || entry.status === JournalEntryStatus.DRAFT,
    );
    if (activeEntry) {
      this.logger.warn(
        `Journal entry already exists for purchase order ${purchaseOrder.orderNumber} (${activeEntry.referenceNumber}) - skipping duplicate`,
      );
      return activeEntry as any;
    }

    const mappings = await this.accountMappingService.getMappings();
    this.validateMapping(mappings, MappingType.PURCHASE_INVENTORY, 'Inventory Asset');
    this.validateMapping(mappings, MappingType.PURCHASE_AP, 'Accounts Payable');

    await this.validatePeriodOpen(receiveDate);
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: receiveDate,
    });
    if (!periodValidation.period) {
      throw new BadRequestException(`No fiscal period found for date ${receiveDate}`);
    }

    if (purchaseOrder.items == null) {
      throw new BadRequestException(
        `Cannot post purchase receipt entry for ${purchaseOrder.orderNumber}: items relation not loaded`,
      );
    }

    const totalAmount =
      purchaseOrder.items.reduce((sum, item) => sum + Number(item.totalAmount ?? 0), 0) +
      Number(purchaseOrder.shippingAmount ?? 0);

    const supplierName =
      purchaseOrder.supplier?.companyName ?? (purchaseOrder.supplier as any)?.name ?? '';

    const entryDto: CreateJournalEntryDto = {
      entryDate: new Date(receiveDate),
      description: `Purchase Order ${purchaseOrder.orderNumber} from ${supplierName}`.trim(),
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'purchase_order',
      sourceId: purchaseOrder.id,
      lines: [
        {
          accountId: mappings[MappingType.PURCHASE_INVENTORY],
          debitAmount: totalAmount,
          creditAmount: 0,
          memo: 'Inventory received',
        },
        {
          accountId: mappings[MappingType.PURCHASE_AP],
          debitAmount: 0,
          creditAmount: totalAmount,
          memo: 'Amount payable to supplier',
        },
      ],
    };

    const entry = await this.journalEntryService.create(entryDto, userId);
    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted purchase receipt journal entry: ${purchaseOrder.orderNumber}`,
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'purchase_order', sourceId: purchaseOrder.id },
      },
    );

    this.logger.log(`Purchase receipt entry posted successfully: ${postedEntry.referenceNumber}`);
    return postedEntry as any;
  }

  /**
   * Post journal entry for vendor payment
   * DR Accounts Payable, CR Cash
   */
  async postVendorPaymentEntry(
    vendorPayment: VendorPayment,
    userId: string,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting vendor payment entry for ${vendorPayment.paymentNumber}`);

    // Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // Validate required mappings exist
    this.validateMapping(mappings, MappingType.VENDOR_PAYMENT_AP, 'Accounts Payable');
    const paymentMethodCode = vendorPayment.paymentMethodEntity?.code || 'CASH';
    const creditMappingKey = `vendor_payment_${paymentMethodCode.toLowerCase()}`;
    this.validateMappingByKey(
      mappings,
      creditMappingKey,
      `vendor payment method "${paymentMethodCode}"`,
    );

    // Validate period is open
    await this.validatePeriodOpen(vendorPayment.paymentDate);

    // Get the period for this date
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: vendorPayment.paymentDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(`No fiscal period found for date ${vendorPayment.paymentDate}`);
    }

    // Build journal entry lines
    const lines: CreateJournalEntryLineDto[] = [
      // DR Accounts Payable
      {
        accountId: mappings[MappingType.VENDOR_PAYMENT_AP],
        debitAmount: Number(vendorPayment.amount),
        creditAmount: 0,
        memo: 'Accounts payable reduction',
      },
      // CR Cash in Hand
      {
        accountId: mappings[creditMappingKey],
        debitAmount: 0,
        creditAmount: Number(vendorPayment.amount),
        memo: 'Cash paid',
      },
    ];

    // Create journal entry DTO
    const entryDto: CreateJournalEntryDto = {
      entryDate: new Date(vendorPayment.paymentDate),
      description: `Vendor Payment ${vendorPayment.paymentNumber} to ${vendorPayment.supplier.companyName}`,
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'vendor_payment',
      sourceId: vendorPayment.id,
      lines,
    };

    // Create and post the entry
    const entry = await this.journalEntryService.create(entryDto, userId);
    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted vendor payment journal entry: ${vendorPayment.paymentNumber}`,
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'vendor_payment', sourceId: vendorPayment.id },
      },
    );

    this.logger.log(`Vendor payment entry posted successfully: ${postedEntry.referenceNumber}`);
    return postedEntry as any;
  }

  async postVendorRefundEntry(
    vendorPayment: VendorPayment,
    userId: string,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting vendor refund entry for ${vendorPayment.paymentNumber}`);

    const mappings = await this.accountMappingService.getMappings();

    this.validateMapping(mappings, MappingType.VENDOR_PAYMENT_AP, 'Accounts Payable');
    const paymentMethodCode = vendorPayment.paymentMethodEntity?.code || 'CASH';
    const creditMappingKey = `vendor_payment_${paymentMethodCode.toLowerCase()}`;
    this.validateMappingByKey(
      mappings,
      creditMappingKey,
      `vendor payment method "${paymentMethodCode}"`,
    );

    await this.validatePeriodOpen(vendorPayment.paymentDate);

    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: vendorPayment.paymentDate,
    });
    if (!periodValidation.period) {
      throw new BadRequestException(`No fiscal period found for date ${vendorPayment.paymentDate}`);
    }

    const refundAmount = Math.abs(Number(vendorPayment.amount));

    const lines: CreateJournalEntryLineDto[] = [
      {
        accountId: mappings[creditMappingKey],
        debitAmount: refundAmount,
        creditAmount: 0,
        memo: 'Cash refunded by vendor',
      },
      {
        accountId: mappings[MappingType.VENDOR_PAYMENT_AP],
        debitAmount: 0,
        creditAmount: refundAmount,
        memo: 'Accounts payable restored',
      },
    ];

    const entryDto: CreateJournalEntryDto = {
      entryDate: new Date(vendorPayment.paymentDate),
      description: `Vendor Refund ${vendorPayment.paymentNumber} from ${vendorPayment.supplier.companyName}`,
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'vendor_payment',
      sourceId: vendorPayment.id,
      lines,
    };

    const entry = await this.journalEntryService.create(entryDto, userId);
    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted vendor refund journal entry: ${vendorPayment.paymentNumber}`,
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'vendor_payment', sourceId: vendorPayment.id },
      },
    );

    this.logger.log(`Vendor refund entry posted successfully: ${postedEntry.referenceNumber}`);
    return postedEntry as any;
  }

  /**
   * Post journal entry for stock adjustment
   * Handles both increases and decreases
   */
  async postStockAdjustmentEntry(
    adjustment: StockAdjustment,
    userId: string,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting stock adjustment entry for ${adjustment.adjustmentNumber}`);

    // Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // Validate required mappings exist
    this.validateMapping(mappings, MappingType.INVENTORY_ASSET, 'Inventory Asset');
    this.validateMapping(
      mappings,
      MappingType.INVENTORY_ADJUSTMENT_GAIN,
      'Inventory Adjustment Gain',
    );
    this.validateMapping(
      mappings,
      MappingType.INVENTORY_ADJUSTMENT_LOSS,
      'Inventory Adjustment Loss',
    );

    // Validate period is open
    await this.validatePeriodOpen(adjustment.adjustmentDate);

    // Get the period for this date
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: adjustment.adjustmentDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(`No fiscal period found for date ${adjustment.adjustmentDate}`);
    }

    // Calculate totals for increases and decreases
    const { totalIncrease, totalDecrease } = this.calculateAdjustmentTotals(adjustment.items);

    // Build journal entry lines
    const lines: CreateJournalEntryLineDto[] = [];

    // Add increase lines if there are increases
    if (totalIncrease > 0) {
      lines.push(
        // DR Inventory Asset
        {
          accountId: mappings[MappingType.INVENTORY_ASSET],
          debitAmount: totalIncrease,
          creditAmount: 0,
          memo: 'Inventory increase',
        },
        // CR Inventory Adjustment Gain
        {
          accountId: mappings[MappingType.INVENTORY_ADJUSTMENT_GAIN],
          debitAmount: 0,
          creditAmount: totalIncrease,
          memo: 'Inventory adjustment gain',
        },
      );
    }

    // Add decrease lines if there are decreases
    if (totalDecrease > 0) {
      lines.push(
        // DR Inventory Adjustment Loss
        {
          accountId: mappings[MappingType.INVENTORY_ADJUSTMENT_LOSS],
          debitAmount: totalDecrease,
          creditAmount: 0,
          memo: 'Inventory adjustment loss',
        },
        // CR Inventory Asset
        {
          accountId: mappings[MappingType.INVENTORY_ASSET],
          debitAmount: 0,
          creditAmount: totalDecrease,
          memo: 'Inventory decrease',
        },
      );
    }

    // Create journal entry DTO
    const entryDto: CreateJournalEntryDto = {
      entryDate: new Date(adjustment.adjustmentDate),
      description: `Stock Adjustment ${adjustment.adjustmentNumber}`,
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'stock_adjustment',
      sourceId: adjustment.id,
      lines,
    };

    // Create and post the entry
    const entry = await this.journalEntryService.create(entryDto, userId);
    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted stock adjustment journal entry: ${adjustment.adjustmentNumber}`,
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'stock_adjustment', sourceId: adjustment.id },
      },
    );

    this.logger.log(`Stock adjustment entry posted successfully: ${postedEntry.referenceNumber}`);
    return postedEntry as any;
  }

  /**
   * Post journal entry for owner equity transaction
   * Capital injection: DR Payment Method, CR Owner's Equity
   * Owner drawing: DR Drawings, CR Payment Method
   */
  async postOwnerEquityEntry(
    transaction: OwnerEquityTransaction,
    userId: string,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting owner equity entry for ${transaction.referenceNumber}`);

    const mappings = await this.accountMappingService.getMappings();

    const paymentMethodCode = transaction.paymentMethod?.code || 'CASH';
    const paymentMappingKey = `payment_${paymentMethodCode.toLowerCase()}`;

    this.validateMappingByKey(mappings, paymentMappingKey, `payment method "${paymentMethodCode}"`);
    this.validateMappingByKey(mappings, 'equity_owners_equity', "Owner's Equity");
    this.validateMappingByKey(mappings, 'equity_drawings', 'Drawings');

    await this.validatePeriodOpen(transaction.transactionDate);

    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: transaction.transactionDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(
        `No fiscal period found for date ${transaction.transactionDate}`,
      );
    }

    const lines: CreateJournalEntryLineDto[] = [];

    if (transaction.type === OwnerEquityTransactionType.CAPITAL_INJECTION) {
      // Owner puts money in: DR Cash, CR Owner's Equity
      lines.push(
        {
          accountId: mappings[paymentMappingKey],
          debitAmount: Number(transaction.amount),
          creditAmount: 0,
          memo: 'Capital injection received',
        },
        {
          accountId: mappings.equity_owners_equity,
          debitAmount: 0,
          creditAmount: Number(transaction.amount),
          memo: "Owner's equity increase",
        },
      );
    } else {
      // Owner draws money out: DR Drawings, CR Cash
      lines.push(
        {
          accountId: mappings.equity_drawings,
          debitAmount: Number(transaction.amount),
          creditAmount: 0,
          memo: 'Owner drawing',
        },
        {
          accountId: mappings[paymentMappingKey],
          debitAmount: 0,
          creditAmount: Number(transaction.amount),
          memo: 'Cash paid for owner drawing',
        },
      );
    }

    const typeLabel =
      transaction.type === OwnerEquityTransactionType.CAPITAL_INJECTION
        ? 'Capital Injection'
        : 'Owner Drawing';

    const entry = await this.journalEntryService.create(
      {
        entryDate: new Date(transaction.transactionDate),
        description: `${typeLabel} ${transaction.referenceNumber}${
          transaction.description ? ` - ${transaction.description}` : ''
        }`,
        fiscalPeriodId: periodValidation.period.id,
        sourceType: 'owner_equity_transaction',
        sourceId: transaction.id,
        lines,
      },
      userId,
    );

    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted owner equity journal entry: ${transaction.referenceNumber}`,
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'owner_equity', sourceId: transaction.id },
      },
    );
    this.logger.log(`Owner equity entry posted successfully: ${postedEntry.referenceNumber}`);
    return postedEntry as any;
  }

  /**
   * Post journal entry for expense
   * DR Expense Account, CR Payment Method Account
   */
  async postExpenseEntry(
    expense: Expense,
    userId: string,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting expense entry for ${expense.referenceNumber}`);

    const mappings = await this.accountMappingService.getMappings();

    const paymentMethodCode = expense.paymentMethod?.code || 'CASH';
    const paymentMappingKey = `payment_${paymentMethodCode.toLowerCase()}`;

    this.validateMappingByKey(mappings, paymentMappingKey, `payment method "${paymentMethodCode}"`);

    // Expense account is directly selected by user, no mapping needed
    // Just validate it exists
    if (!expense.expenseAccountId) {
      throw new BadRequestException('Expense account is required');
    }

    await this.validatePeriodOpen(expense.expenseDate);

    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: expense.expenseDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(`No fiscal period found for date ${expense.expenseDate}`);
    }

    const accountName = expense.expenseAccount?.name || 'Expense';

    const lines: CreateJournalEntryLineDto[] = [
      // DR Expense Account
      {
        accountId: expense.expenseAccountId,
        debitAmount: Number(expense.amount),
        creditAmount: 0,
        memo: accountName,
      },
      // CR Payment Method Account
      {
        accountId: mappings[paymentMappingKey],
        debitAmount: 0,
        creditAmount: Number(expense.amount),
        memo: 'Payment for expense',
      },
    ];

    const description = `Expense ${expense.referenceNumber}${
      expense.vendor ? ` - ${expense.vendor}` : ''
    }${expense.description ? ` - ${expense.description}` : ''}`;

    const entry = await this.journalEntryService.create(
      {
        entryDate: new Date(expense.expenseDate),
        description,
        fiscalPeriodId: periodValidation.period.id,
        sourceType: 'expense',
        sourceId: expense.id,
        lines,
      },
      userId,
    );

    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted expense journal entry: ${expense.referenceNumber}`,
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'expense', sourceId: expense.id },
      },
    );
    this.logger.log(`Expense entry posted successfully: ${postedEntry.referenceNumber}`);
    return postedEntry as any;
  }

  async postFundTransferEntry(
    transfer: import('../../../database/entities/fund-transfer.entity').FundTransfer,
    userId: string,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting fund transfer entry for ${transfer.referenceNumber}`);

    const existingEntries = await this.journalEntryService.findBySource(
      'fund_transfer',
      transfer.id,
    );
    const activeEntry = existingEntries.find(
      (entry) =>
        entry.status === JournalEntryStatus.POSTED || entry.status === JournalEntryStatus.DRAFT,
    );

    if (activeEntry) {
      this.logger.warn(
        `Journal entry already exists for fund transfer ${transfer.referenceNumber} - skipping duplicate`,
      );
      return activeEntry as any;
    }

    await this.validatePeriodOpen(transfer.transferDate);

    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: transfer.transferDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(`No fiscal period found for date ${transfer.transferDate}`);
    }

    const description = `Fund Transfer: ${transfer.referenceNumber}${
      transfer.description ? ` - ${transfer.description}` : ''
    }`;

    const lines: CreateJournalEntryLineDto[] = [
      {
        accountId: transfer.destinationAccountId,
        debitAmount: Number(transfer.amount),
        creditAmount: 0,
        memo: `Transfer to ${transfer.destinationAccount?.name ?? transfer.destinationAccountId}`,
      },
      {
        accountId: transfer.sourceAccountId,
        debitAmount: 0,
        creditAmount: Number(transfer.amount),
        memo: `Transfer from ${transfer.sourceAccount?.name ?? transfer.sourceAccountId}`,
      },
    ];

    const entry = await this.journalEntryService.create(
      {
        entryDate: new Date(transfer.transferDate),
        description,
        fiscalPeriodId: periodValidation.period.id,
        sourceType: 'fund_transfer',
        sourceId: transfer.id,
        lines,
      },
      userId,
    );

    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      `Auto-posted fund transfer journal entry: ${transfer.referenceNumber}`,
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'fund_transfer', sourceId: transfer.id },
      },
    );

    this.logger.log(`Fund transfer entry posted successfully: ${postedEntry.referenceNumber}`);
    return postedEntry as any;
  }

  async reverseSourceEntries(
    sourceType: string,
    sourceId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    this.logger.log(`Reversing source entries: ${sourceType}/${sourceId}`);

    // TODO(#719): manager accepted for transactional call-site uniformity; JournalEntryService persistence is not yet manager-bound.

    const entries = await this.journalEntryService.findBySource(sourceType, sourceId);

    if (entries.length === 0) {
      this.logger.warn(
        `No journal entries found for ${sourceType}/${sourceId} - nothing to reverse`,
      );
      return;
    }

    const currentPeriod = await this.fiscalPeriodService.getCurrentPeriod();
    if (!currentPeriod) {
      throw new BadRequestException(
        'No open fiscal period found. Please open a fiscal period before processing reversals.',
      );
    }

    for (const entry of entries) {
      if (entry.status !== JournalEntryStatus.POSTED || entry.reversedById) {
        this.logger.warn(
          `Skipping entry ${entry.id} - status: ${entry.status}, reversedById: ${entry.reversedById}`,
        );
        continue;
      }

      await this.journalEntryService.reverseEntryInPeriod(entry.id, currentPeriod.id, userId);
      this.logger.log(`Reversed entry ${entry.id} into period ${currentPeriod.id}`);
    }
  }

  async reversePaymentEntry(
    originalPaymentId: string,
    originalMethodCode: string,
    refundMethodCode: string,
    amount: number,
    userId: string,
  ): Promise<void> {
    this.logger.log(
      `Reversing payment entry (diff method): ${originalMethodCode} -> ${refundMethodCode}, amount: ${amount}`,
    );

    const currentPeriod = await this.fiscalPeriodService.getCurrentPeriod();
    if (!currentPeriod) {
      throw new BadRequestException(
        'No open fiscal period found. Please open a fiscal period before processing refunds.',
      );
    }

    const mappings = await this.accountMappingService.getMappings();
    const originalKey = `payment_${originalMethodCode.toLowerCase()}`;
    const refundKey = `payment_${refundMethodCode.toLowerCase()}`;

    if (!mappings[originalKey]) {
      throw new BadRequestException(
        `No account mapped for payment method "${originalMethodCode}". Please configure account mappings.`,
      );
    }

    if (!mappings[refundKey]) {
      throw new BadRequestException(
        `No account mapped for refund payment method "${refundMethodCode}". Please configure account mappings.`,
      );
    }

    const lines: CreateJournalEntryLineDto[] = [
      {
        accountId: mappings[originalKey],
        debitAmount: amount,
        creditAmount: 0,
        memo: `Refund: clear original ${originalMethodCode} receipt`,
      },
      {
        accountId: mappings[refundKey],
        debitAmount: 0,
        creditAmount: amount,
        memo: `Refund: paid out via ${refundMethodCode}`,
      },
    ];

    const entryDto: CreateJournalEntryDto = {
      entryDate: new Date(),
      description: `Refund via ${refundMethodCode} for payment ${originalPaymentId}`,
      fiscalPeriodId: currentPeriod.id,
      sourceType: 'payment_refund',
      sourceId: originalPaymentId,
      lines,
    };

    const entry = await this.journalEntryService.create(entryDto, userId);
    await this.journalEntryService.postEntry(entry.id, userId);
    this.logger.log(`Refund transfer JE posted for payment ${originalPaymentId}`);
  }

  /**
   * Post opening balances as a single balanced journal entry.
   * Positive amounts become debits, negative amounts become credits.
   */
  async postOpeningBalances(
    dto: PostOpeningBalancesDto,
    userId?: string,
    username?: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting opening balances as of ${dto.asOfDate}`);

    const asOfDate = new Date(dto.asOfDate);
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: asOfDate,
    });

    if (!periodValidation.isValid || !periodValidation.period) {
      throw new BadRequestException(`No open fiscal period found for date ${dto.asOfDate}`);
    }

    const lines: CreateJournalEntryLineDto[] = [];
    let totalDebits = 0;
    let totalCredits = 0;

    for (const balance of dto.balances) {
      if (balance.amount === 0) {
        continue;
      }

      if (balance.amount > 0) {
        lines.push({
          accountId: balance.accountId,
          debitAmount: Math.abs(balance.amount),
          creditAmount: 0,
          memo: 'Opening balance',
        });
        totalDebits += Math.abs(balance.amount);
      } else {
        lines.push({
          accountId: balance.accountId,
          debitAmount: 0,
          creditAmount: Math.abs(balance.amount),
          memo: 'Opening balance',
        });
        totalCredits += Math.abs(balance.amount);
      }
    }

    if (lines.length === 0) {
      throw new BadRequestException('At least one non-zero opening balance is required');
    }

    const difference = totalDebits - totalCredits;

    if (Math.abs(difference) > 0.01) {
      if (difference > 0) {
        lines.push({
          accountId: dto.equityAccountId,
          debitAmount: 0,
          creditAmount: difference,
          memo: 'Opening balance equity',
        });
      } else {
        lines.push({
          accountId: dto.equityAccountId,
          debitAmount: Math.abs(difference),
          creditAmount: 0,
          memo: 'Opening balance equity',
        });
      }
    }

    const finalDebits = lines.reduce((sum, line) => sum + Number(line.debitAmount || 0), 0);
    const finalCredits = lines.reduce((sum, line) => sum + Number(line.creditAmount || 0), 0);

    if (Math.abs(finalDebits - finalCredits) > 0.01) {
      throw new BadRequestException(
        `Opening balances are not balanced (debits: ${finalDebits}, credits: ${finalCredits})`,
      );
    }

    const entry = await this.journalEntryService.create(
      {
        entryDate: asOfDate,
        description: `Opening Balance Entry as of ${dto.asOfDate}`,
        fiscalPeriodId: periodValidation.period.id,
        sourceType: 'opening_balance',
        lines,
      },
      userId,
      username,
    );

    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId, username);
    await this.auditLogService.log(
      'AUTO_POST',
      'JournalEntry',
      'Auto-posted opening balance entry',
      {
        entityId: entry.id,
        userId: userId ?? 'system',
        username,
        metadata: { sourceType: 'opening_balance' },
      },
    );
    return postedEntry as any;
  }

  /**
   * Validate that a period is open for posting
   */
  private async validatePeriodOpen(entryDate: Date): Promise<void> {
    const validation = await this.fiscalPeriodService.validatePeriod({
      date: entryDate,
    });

    if (!validation.isValid) {
      throw new BadRequestException(validation.message);
    }
  }

  /**
   * Validate that a required mapping exists
   */
  private validateMapping(
    mappings: Record<string, string>,
    mappingType: MappingType,
    displayName: string,
  ): void {
    if (!mappings[mappingType]) {
      throw new NotFoundException(
        `Account mapping not configured for ${displayName} (${mappingType}). ` +
          `Please configure account mappings before posting transactions.`,
      );
    }
  }

  private validateMappingByKey(
    mappings: Record<string, string>,
    key: string,
    displayName: string,
  ): void {
    if (!mappings[key]) {
      throw new NotFoundException(
        `Account mapping not configured for ${displayName} (${key}). ` +
          `Please configure account mappings before posting transactions.`,
      );
    }
  }

  /**
   * Calculate total COGS from sales order items
   */
  private calculateCOGS(items: SalesOrderItem[]): number {
    return items.reduce((total, item) => {
      const baseCost = Number(item.product?.baseCost || 0);
      return total + Number(item.quantity) * baseCost;
    }, 0);
  }

  /**
   * Calculate total increases and decreases from stock adjustment items
   */
  private calculateAdjustmentTotals(items: StockAdjustmentItem[]): {
    totalIncrease: number;
    totalDecrease: number;
  } {
    let totalIncrease = 0;
    let totalDecrease = 0;

    for (const item of items) {
      const difference = Number(item.newQuantity) - Number(item.oldQuantity);
      const unitCost = Number(item.unitCost || 0);
      const value = Math.abs(difference) * unitCost;

      if (difference > 0) {
        totalIncrease += value;
      } else if (difference < 0) {
        totalDecrease += value;
      }
    }

    return { totalIncrease, totalDecrease };
  }
}
