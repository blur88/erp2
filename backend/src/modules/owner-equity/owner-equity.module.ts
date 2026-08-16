import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OwnerEquityDocument } from './entities/owner-equity-document.entity';
import { OwnerEquitySettlement } from './entities/owner-equity-settlement.entity';
import { OwnerEquityController } from './controllers/owner-equity.controller';
import { OwnerEquityService } from './services/owner-equity.service';
import { OwnerEquitySettlementService } from './services/owner-equity-settlement.service';
import { OwnerEquityStockService } from './services/owner-equity-stock.service';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SettingsModule } from '../settings/settings.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OwnerEquityDocument, OwnerEquitySettlement]),
    AccountingModule, // exports ACCOUNTING_POSTING_PORT
    InventoryModule, // exports StockMovementService
    SettingsModule,
    AuditLogsModule, // global, imported for standalone module-test clarity
  ],
  controllers: [OwnerEquityController],
  providers: [
    OwnerEquityService,
    OwnerEquitySettlementService,
    OwnerEquityStockService,
  ],
})
export class OwnerEquityModule {}
