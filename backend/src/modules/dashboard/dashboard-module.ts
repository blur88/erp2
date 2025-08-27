import { Module } from '@nestjs/common';
import { DashboardController } from './controllers/dashboard-controller';
import { DashboardService } from './services/dashboard-service';

// Import necessary service dependencies
import { SalesModule } from '../sales/sales-module';
import { InventoryModule } from '../inventory/inventory-module';
import { FinancialModule } from '../financial/financial-module';
import { PurchasingModule } from '../purchasing/purchasing-module';

@Module({
  imports: [
    SalesModule,
    InventoryModule,
    FinancialModule,
    PurchasingModule
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService]
})
export class DashboardModule {}