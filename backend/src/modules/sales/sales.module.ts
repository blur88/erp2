import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Customer } from '../../database/entities/customer.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../database/entities/sales-order-item.entity';
import { Product } from '../../database/entities/product.entity';
import { Invoice } from '../../database/entities/invoice.entity';
import { User } from '../../database/entities/user.entity';

// Controllers
import { CustomerController } from './controllers/customer.controller';
import { SalesOrderController } from './controllers/sales-order.controller';

// Services
import { CustomerService } from './services/customer.service';
import { SalesOrderService } from './services/sales-order.service';
import { InventoryIntegrationService } from './services/inventory-integration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      SalesOrder,
      SalesOrderItem,
      Product,
      Invoice,
      User,
    ]),
  ],
  controllers: [
    CustomerController,
    SalesOrderController,
  ],
  providers: [
    CustomerService,
    SalesOrderService,
    InventoryIntegrationService,
  ],
  exports: [
    CustomerService,
    SalesOrderService,
  ],
})
export class SalesModule {}