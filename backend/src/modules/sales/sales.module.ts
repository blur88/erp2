import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Customer } from '../../database/entities/customer.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../database/entities/sales-order-item.entity';
import { Product } from '../../database/entities/product.entity';
import { Invoice } from '../../database/entities/invoice.entity';
import { Payment } from '../../database/entities/payment.entity';
import { User } from '../../database/entities/user.entity';
import { StockMovement } from '../../database/entities/stock-movement.entity';

// Controllers
import { CustomerController } from './controllers/customer.controller';
import { SalesOrderController } from './controllers/sales-order.controller'; // Temporarily disabled due to TypeScript errors

// Services
import { CustomerService } from './services/customer.service';
import { SalesOrderService } from './services/sales-order.service'; // Temporarily disabled due to TypeScript errors
import { InventoryIntegrationService } from './services/inventory-integration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      SalesOrder,
      SalesOrderItem,
      Product,
      Invoice,
      Payment,
      User,
      StockMovement,
    ]),
  ],
  controllers: [
    CustomerController,
    SalesOrderController, // Temporarily disabled due to TypeScript errors
  ],
  providers: [
    CustomerService,
    SalesOrderService,
    InventoryIntegrationService,
  ],
  exports: [
    CustomerService,
    SalesOrderService, // Temporarily disabled due to TypeScript errors
  ],
})
export class SalesModule {}