import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JournalEntryService } from './journal-entry.service';
import { AccountMappingService } from './account-mapping.service';
import { FiscalPeriodService } from './fiscal-period.service';
import { MappingType } from '../../../database/entities/account-mapping.entity';
import { JournalEntry } from '../../../database/entities/journal-entry.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { GoodsReceivedNote } from '../../../database/entities/goods-received-note.entity';
import { GoodsReceivedNoteItem } from '../../../database/entities/goods-received-note-item.entity';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
import { StockAdjustment, StockAdjustmentItem } from '../../../database/entities/stock-adjustment.entity';
import { CreateJournalEntryDto, CreateJournalEntryLineDto } from '../dto/journal-entry.dto';

@Injectable()
export class AccountingService {
  private readonly logger = new Logger(AccountingService.name);

  constructor(
    private readonly journalEntryService: JournalEntryService,
    private readonly accountMappingService: AccountMappingService,
    private readonly fiscalPeriodService: FiscalPeriodService,
  ) {}

  /**
   * Post journal entry for sales order fulfillment
   * Creates entries for COGS and Revenue recognition
   */
  async postSalesOrderEntry(
    salesOrder: SalesOrder,
    userId: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting sales order entry for ${salesOrder.orderNumber}`);

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
      throw new BadRequestException(
        `No fiscal period found for date ${salesOrder.fulfilledDate}`,
      );
    }

    // Calculate COGS
    const cogsAmount = this.calculateCOGS(salesOrder.items);

    // Build journal entry lines
    const lines: CreateJournalEntryLineDto[] = [
      // DR Cost of Goods Sold
      {
        accountId: mappings[MappingType.SALES_COGS],
        debitAmount: cogsAmount,
        creditAmount: 0,
        memo: 'Cost of goods sold',
      },
      // CR Inventory Asset
      {
        accountId: mappings[MappingType.SALES_INVENTORY],
        debitAmount: 0,
        creditAmount: cogsAmount,
        memo: 'Inventory reduction',
      },
      // DR Accounts Receivable
      {
        accountId: mappings[MappingType.SALES_AR],
        debitAmount: Number(salesOrder.totalAmount),
        creditAmount: 0,
        memo: 'Amount receivable from customer',
      },
      // CR Sales Revenue
      {
        accountId: mappings[MappingType.SALES_REVENUE],
        debitAmount: 0,
        creditAmount: Number(salesOrder.totalAmount),
        memo: 'Sales revenue recognition',
      },
    ];

    // Create journal entry DTO
    const entryDto: CreateJournalEntryDto = {
      entryDate: salesOrder.fulfilledDate,
      description: `Sales Order ${salesOrder.orderNumber} - ${salesOrder.customer.name}`,
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'sales_order',
      sourceId: salesOrder.id,
      lines,
    };

    // Create and post the entry
    const entry = await this.journalEntryService.create(entryDto, userId);
    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);

    this.logger.log(
      `Sales order entry posted successfully: ${postedEntry.referenceNumber}`,
    );
    return postedEntry as any;
  }

  /**
   * Post journal entry for customer payment
   * DR Cash, CR Accounts Receivable
   */
  async postCustomerPaymentEntry(
    payment: Payment,
    userId: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting customer payment entry for ${payment.paymentNumber}`);

    // Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // Validate required mappings exist
    this.validateMapping(mappings, MappingType.PAYMENT_CASH, 'Cash');
    this.validateMapping(mappings, MappingType.PAYMENT_AR, 'Accounts Receivable');

    // Validate period is open
    await this.validatePeriodOpen(payment.paymentDate);

    // Get the period for this date
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: payment.paymentDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(
        `No fiscal period found for date ${payment.paymentDate}`,
      );
    }

    // Build journal entry lines
    const lines: CreateJournalEntryLineDto[] = [
      // DR Cash in Hand
      {
        accountId: mappings[MappingType.PAYMENT_CASH],
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
      entryDate: payment.paymentDate,
      description: `Payment ${payment.paymentNumber} from ${payment.customer.name}`,
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'payment',
      sourceId: payment.id,
      lines,
    };

    // Create and post the entry
    const entry = await this.journalEntryService.create(entryDto, userId);
    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);

    this.logger.log(
      `Payment entry posted successfully: ${postedEntry.referenceNumber}`,
    );
    return postedEntry as any;
  }

  /**
   * Post journal entry for goods received
   * DR Inventory Asset, CR Accounts Payable
   */
  async postGoodsReceivedEntry(
    grn: GoodsReceivedNote,
    userId: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting goods received entry for ${grn.grnNumber}`);

    // Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // Validate required mappings exist
    this.validateMapping(mappings, MappingType.PURCHASE_INVENTORY, 'Inventory Asset');
    this.validateMapping(mappings, MappingType.PURCHASE_AP, 'Accounts Payable');

    // Validate period is open
    await this.validatePeriodOpen(grn.receivedDate);

    // Get the period for this date
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: grn.receivedDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(
        `No fiscal period found for date ${grn.receivedDate}`,
      );
    }

    // Calculate total from GRN items
    const totalAmount = this.calculateGRNTotal(grn.items);

    // Build journal entry lines
    const lines: CreateJournalEntryLineDto[] = [
      // DR Inventory Asset
      {
        accountId: mappings[MappingType.PURCHASE_INVENTORY],
        debitAmount: totalAmount,
        creditAmount: 0,
        memo: 'Inventory received',
      },
      // CR Accounts Payable
      {
        accountId: mappings[MappingType.PURCHASE_AP],
        debitAmount: 0,
        creditAmount: totalAmount,
        memo: 'Amount payable to supplier',
      },
    ];

    // Create journal entry DTO
    const entryDto: CreateJournalEntryDto = {
      entryDate: grn.receivedDate,
      description: `GRN ${grn.grnNumber} from ${grn.supplier.companyName}`,
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'goods_received_note',
      sourceId: grn.id,
      lines,
    };

    // Create and post the entry
    const entry = await this.journalEntryService.create(entryDto, userId);
    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);

    this.logger.log(
      `Goods received entry posted successfully: ${postedEntry.referenceNumber}`,
    );
    return postedEntry as any;
  }

  /**
   * Post journal entry for vendor payment
   * DR Accounts Payable, CR Cash
   */
  async postVendorPaymentEntry(
    vendorPayment: VendorPayment,
    userId: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting vendor payment entry for ${vendorPayment.paymentNumber}`);

    // Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // Validate required mappings exist
    this.validateMapping(mappings, MappingType.VENDOR_PAYMENT_AP, 'Accounts Payable');
    this.validateMapping(mappings, MappingType.VENDOR_PAYMENT_CASH, 'Cash');

    // Validate period is open
    await this.validatePeriodOpen(vendorPayment.paymentDate);

    // Get the period for this date
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: vendorPayment.paymentDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(
        `No fiscal period found for date ${vendorPayment.paymentDate}`,
      );
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
        accountId: mappings[MappingType.VENDOR_PAYMENT_CASH],
        debitAmount: 0,
        creditAmount: Number(vendorPayment.amount),
        memo: 'Cash paid',
      },
    ];

    // Create journal entry DTO
    const entryDto: CreateJournalEntryDto = {
      entryDate: vendorPayment.paymentDate,
      description: `Vendor Payment ${vendorPayment.paymentNumber} to ${vendorPayment.supplier.companyName}`,
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'vendor_payment',
      sourceId: vendorPayment.id,
      lines,
    };

    // Create and post the entry
    const entry = await this.journalEntryService.create(entryDto, userId);
    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);

    this.logger.log(
      `Vendor payment entry posted successfully: ${postedEntry.referenceNumber}`,
    );
    return postedEntry as any;
  }

  /**
   * Post journal entry for stock adjustment
   * Handles both increases and decreases
   */
  async postStockAdjustmentEntry(
    adjustment: StockAdjustment,
    userId: string,
  ): Promise<JournalEntry> {
    this.logger.log(`Posting stock adjustment entry for ${adjustment.adjustmentNumber}`);

    // Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // Validate required mappings exist
    this.validateMapping(mappings, MappingType.INVENTORY_ASSET, 'Inventory Asset');
    this.validateMapping(mappings, MappingType.INVENTORY_ADJUSTMENT_GAIN, 'Inventory Adjustment Gain');
    this.validateMapping(mappings, MappingType.INVENTORY_ADJUSTMENT_LOSS, 'Inventory Adjustment Loss');

    // Validate period is open
    await this.validatePeriodOpen(adjustment.adjustmentDate);

    // Get the period for this date
    const periodValidation = await this.fiscalPeriodService.validatePeriod({
      date: adjustment.adjustmentDate,
    });

    if (!periodValidation.period) {
      throw new BadRequestException(
        `No fiscal period found for date ${adjustment.adjustmentDate}`,
      );
    }

    // Calculate totals for increases and decreases
    const { totalIncrease, totalDecrease } = this.calculateAdjustmentTotals(
      adjustment.items,
    );

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
      entryDate: adjustment.adjustmentDate,
      description: `Stock Adjustment ${adjustment.adjustmentNumber}`,
      fiscalPeriodId: periodValidation.period.id,
      sourceType: 'stock_adjustment',
      sourceId: adjustment.id,
      lines,
    };

    // Create and post the entry
    const entry = await this.journalEntryService.create(entryDto, userId);
    const postedEntry = await this.journalEntryService.postEntry(entry.id, userId);

    this.logger.log(
      `Stock adjustment entry posted successfully: ${postedEntry.referenceNumber}`,
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
    mappings: Record<MappingType, string>,
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

  /**
   * Calculate total COGS from sales order items
   */
  private calculateCOGS(items: SalesOrderItem[]): number {
    return items.reduce((total, item) => {
      const baseCost = Number(item.product?.baseCost || 0);
      return total + (Number(item.quantity) * baseCost);
    }, 0);
  }

  /**
   * Calculate total amount from GRN items
   */
  private calculateGRNTotal(items: GoodsReceivedNoteItem[]): number {
    return items.reduce((total, item) => {
      // Try to get unitCost from purchaseOrderItem relationship if available
      const unitCost = item.purchaseOrderItem?.unitCost || 0;
      return total + (Number(item.receivedQuantity) * Number(unitCost));
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
