import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Product } from '../../database/entities/product.entity';
import { Category } from '../../database/entities/category.entity';
import { StockMovement } from '../../database/entities/stock-movement.entity';
import { PurchaseCostHistory } from '../../database/entities/purchase-cost-history.entity';
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

// Services
import { ProductService } from './services/product.service';
import { CategoryService } from './services/category.service';
import { StockMovementService } from './services/stock-movement.service';
import { PricingService } from './services/pricing.service';
import { IntegrationService } from './services/integration.service';
import { BaseCostCalculatorService } from './services/base-cost-calculator.service';

// Other modules
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Core inventory entities
      Product,
      Category,
      StockMovement,
      PurchaseCostHistory,
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
  ],
  controllers: [
    ProductController,
    CategoryController,
    StockController,
  ],
  providers: [
    // Core services
    ProductService,
    CategoryService,
    StockMovementService,
    PricingService,
    IntegrationService,
    BaseCostCalculatorService,
  ],
  exports: [
    // Export services for use by other modules
    ProductService,
    CategoryService,
    StockMovementService,
    PricingService,
    IntegrationService,
    BaseCostCalculatorService,
    // Export TypeORM repositories for direct access if needed
    TypeOrmModule,
  ],
})
export class InventoryModule {}