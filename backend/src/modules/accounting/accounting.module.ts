import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import { FiscalPeriod } from '../../database/entities/fiscal-period.entity';
import { JournalEntry } from '../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../database/entities/journal-entry-line.entity';
import { AccountMapping } from '../../database/entities/account-mapping.entity';
import { BankReconciliation } from '../../database/entities/bank-reconciliation.entity';
import { ReconciledTransaction } from '../../database/entities/reconciled-transaction.entity';
import { Settlement } from '../../database/entities/settlement.entity';
import { PaymentMethodEntity } from '../../database/entities/payment-method.entity';
import { Payment } from '../../database/entities/payment.entity';
import { OwnerEquityTransaction } from '../../database/entities/owner-equity-transaction.entity';
import { Expense } from '../../database/entities/expense.entity';
import { FundTransfer } from '../../database/entities/fund-transfer.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { PurchaseOrder } from '../../database/entities/purchase-order.entity';
import { GoodsReceivedNote } from '../../database/entities/goods-received-note.entity';
import { VendorPayment } from '../../database/entities/vendor-payment.entity';
import { StockAdjustment } from '../../database/entities/stock-adjustment.entity';

// Services
import { AccountingService } from './services/accounting.service';
import { ChartOfAccountsService } from './services/chart-of-accounts.service';
import { FiscalPeriodService } from './services/fiscal-period.service';
import { JournalEntryService } from './services/journal-entry.service';
import { AccountMappingService } from './services/account-mapping.service';
import { AccountingReportsService } from './services/accounting-reports.service';
import { AccountingReportsQueryHelper } from './services/accounting-reports.query-helper';
import { AccountingExcelExportService } from './services/accounting-reports.excel-export.service';
import { ReconciliationService } from './services/reconciliation.service';
import { SettlementService } from './services/settlement.service';
import { OwnerEquityService } from './services/owner-equity.service';
import { ExpenseService } from './services/expense.service';
import { FundTransferService } from './services/fund-transfer.service';

// Controllers
import { ChartOfAccountsController } from './controllers/chart-of-accounts.controller';
import { FiscalPeriodController } from './controllers/fiscal-period.controller';
import { JournalEntryController } from './controllers/journal-entry.controller';
import { AccountMappingController } from './controllers/account-mapping.controller';
import { AccountingReportsController } from './controllers/accounting-reports.controller';
import { ReconciliationController } from './controllers/reconciliation.controller';
import { SettlementController } from './controllers/settlement.controller';
import { OwnerEquityController } from './controllers/owner-equity.controller';
import { ExpenseController } from './controllers/expense.controller';
import { FundTransferController } from './controllers/fund-transfer.controller';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChartOfAccount,
      FiscalPeriod,
      JournalEntry,
      JournalEntryLine,
      AccountMapping,
      BankReconciliation,
      ReconciledTransaction,
      Settlement,
      PaymentMethodEntity,
      Payment,
      OwnerEquityTransaction,
      Expense,
      FundTransfer,
      SalesOrder,
      PurchaseOrder,
      GoodsReceivedNote,
      VendorPayment,
      StockAdjustment,
    ]),
    SettingsModule,
    AuditLogsModule,
  ],
  controllers: [
    ChartOfAccountsController,
    FiscalPeriodController,
    JournalEntryController,
    AccountMappingController,
    AccountingReportsController,
    ReconciliationController,
    SettlementController,
    OwnerEquityController,
    ExpenseController,
    FundTransferController,
  ],
  providers: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
    AccountMappingService,
    AccountingReportsService,
    AccountingReportsQueryHelper,
    AccountingExcelExportService,
    ReconciliationService,
    SettlementService,
    OwnerEquityService,
    ExpenseService,
    FundTransferService,
  ],
  exports: [
    AccountingService,
    ChartOfAccountsService,
    FiscalPeriodService,
    JournalEntryService,
    AccountMappingService,
    AccountingReportsService,
    AccountingReportsQueryHelper,
    AccountingExcelExportService,
    ReconciliationService,
    SettlementService,
    OwnerEquityService,
    ExpenseService,
    FundTransferService,
  ],
})
export class AccountingModule {}
