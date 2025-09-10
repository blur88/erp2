import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Product } from '../../database/entities/product.entity';
import { Category } from '../../database/entities/category.entity';
import { StockMovement } from '../../database/entities/stock-movement.entity';
import { StockAdjustment } from '../../database/entities/stock-adjustment.entity';
import { Customer } from '../../database/entities/customer.entity';
import { User } from '../../database/entities/user.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../database/entities/sales-order-item.entity';

// Controllers
import { ProductController } from './controllers/product.controller';
import { CategoryController } from './controllers/category.controller';
import { StockController } from './controllers/stock.controller';

// Services
import { ProductService } from './services/product.service';
import { CategoryService } from './services/category.service';
import { StockMovementService } from './services/stock-movement.service';
import { StockAdjustmentService } from './services/stock-adjustment.service';
import { PricingService } from './services/pricing.service';
import { IntegrationService } from './services/integration.service';

// Other modules
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Core inventory entities
      Product,
      Category,
      StockMovement,
      StockAdjustment,
      // Related entities for integration
      Customer,
      User,
      SalesOrder,
      SalesOrderItem,
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
    StockAdjustmentService,
    PricingService,
    IntegrationService,
  ],
  exports: [
    // Export services for use by other modules
    ProductService,
    CategoryService,
    StockMovementService,
    StockAdjustmentService,
    PricingService,
    IntegrationService,
    // Export TypeORM repositories for direct access if needed
    TypeOrmModule,
  ],
})
export class InventoryModule {}