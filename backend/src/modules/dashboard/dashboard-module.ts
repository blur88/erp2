import { Module } from "@nestjs/common";
import { DashboardController } from "./controllers/dashboard-controller";
import { DashboardService } from "./services/dashboard-service";
import { DashboardWebSocketGateway } from "./gateways/dashboard-websocket-gateway";

// Import necessary service dependencies
// import { SalesModule } from '../sales/sales.module'; // Temporarily disabled for startup
import { InventoryModule } from "../inventory/inventory.module";
// Note: FinancialModule and PurchasingModule disabled for now

@Module({
  imports: [
    // SalesModule, // Temporarily disabled for startup
    InventoryModule,
    // FinancialModule, // Disabled - module doesn't exist
    // PurchasingModule  // Disabled - not enabled in app.module.ts
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardWebSocketGateway],
  exports: [DashboardService],
})
export class DashboardModule {}
