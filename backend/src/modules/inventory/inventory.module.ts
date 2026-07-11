import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Product } from '../../database/entities/product.entity';
import { Category } from '../../database/entities/category.entity';
import { StockMovement } from '../../database/entities/stock-movement.entity';
import {
  StockAdjustment,
  StockAdjustmentItem,
} from '../../database/entities/stock-adjustment.entity';
import { PurchaseCostHistory } from '../../database/entities/purchase-cost-history.entity';
import { RegionalSettings } from '../../database/entities/regional-settings.entity';
import { PriceList } from '../../database/entities/price-list.entity';
import { PriceListItem } from '../../database/entities/price-list-item.entity';
import { Customer } from '../../database/entities/customer.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../database/entities/sales-order-item.entity';
import { Supplier } from '../../database/entities/supplier.entity';
import { PurchaseOrder } from '../../database/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../../database/entities/purchase-order-item.entity';


// Controllers
import { ProductController } from './controllers/product.controller';
import { CategoryController } from './controllers/category.controller';
import { StockController } from './controllers/stock.controller';
import { StockAdjustmentController } from './controllers/stock-adjustment.controller';
import { InventoryAnalyticsController } from './controllers/inventory-analytics.controller';
import { CostingController } from './controllers/costing.controller';

// Services
import { ProductService } from './services/product.service';
import { CategoryService } from './services/category.service';
import { StockMovementService } from './services/stock-movement.service';
import { StockAdjustmentService } from './services/stock-adjustment.service';
import { PricingService } from './services/pricing.service';
import { IntegrationService } from './services/integration.service';
import { BaseCostCalculatorService } from './services/base-cost-calculator.service';
import { InventoryAnalyticsService } from './services/inventory-analytics.service';

// Costing strategy services
import { CostingStrategyFactory } from './services/costing/costing-strategy-factory.service';
import { AverageCostingStrategy } from './services/costing/average-costing-strategy.service';
import { FifoCostingStrategy } from './services/costing/fifo-costing-strategy.service';
import { LifoCostingStrategy } from './services/costing/lifo-costing-strategy.service';
import { StandardCostingStrategy } from './services/costing/standard-costing-strategy.service';
import { CostingRecalculationService } from './services/costing-recalculation.service';

// Other modules
import { AccountingModule } from '../accounting/accounting.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { ExportModule } from '../../common/export.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Core inventory entities
      Product,
      Category,
      StockMovement,
      StockAdjustment,
      StockAdjustmentItem,
      PurchaseCostHistory,
      RegionalSettings,
      PriceList,
      PriceListItem,
      // Related entities for integration
      Customer,
      SalesOrder,
      SalesOrderItem,
      Supplier,
      PurchaseOrder,
      PurchaseOrderItem,
    ]),
    // Import users module for user-related operations
    forwardRef(() => UsersModule),
    // Import settings module for price/costing settings
    SettingsModule,
    ExportModule,
    AccountingModule,
  ],
  controllers: [
    ProductController,
    CategoryController,
    StockController,
    StockAdjustmentController,
    InventoryAnalyticsController,
    CostingController,
  ],
  providers: [
    // Core services
    ProductService,
    CategoryService,
    StockMovementService,
    StockAdjustmentService,
    PricingService,
    IntegrationService,
    BaseCostCalculatorService,
    InventoryAnalyticsService,
    // Costing strategies
    CostingStrategyFactory,
    AverageCostingStrategy,
    FifoCostingStrategy,
    LifoCostingStrategy,
    StandardCostingStrategy,
    CostingRecalculationService,
  ],
  exports: [
    // Export services for use by other modules
    ProductService,
    CategoryService,
    StockMovementService,
    StockAdjustmentService,
    PricingService,
    IntegrationService,
    BaseCostCalculatorService,
    // Export TypeORM repositories for direct access if needed
    TypeOrmModule,
  ],
})
export class InventoryModule {}
