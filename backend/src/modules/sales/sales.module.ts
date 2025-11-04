import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Customer } from '../../database/entities/customer.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../database/entities/sales-order-item.entity';
import { Product } from '../../database/entities/product.entity';
import { Invoice } from '../../database/entities/invoice.entity';
import { InvoiceItem } from '../../database/entities/invoice-item.entity';
import { Payment } from '../../database/entities/payment.entity';
import { User } from '../../database/entities/user.entity';
import { StockMovement } from '../../database/entities/stock-movement.entity';
import { PurchaseOrderItem } from '../../database/entities/purchase-order-item.entity';
import { InventoryModule } from '../inventory/inventory.module';

// Controllers
import { CustomerController } from './controllers/customer.controller';
import { SalesOrderController } from './controllers/sales-order.controller'; // Temporarily disabled due to TypeScript errors
import { InvoiceController } from './controllers/invoice.controller';
import { PaymentController } from './controllers/payment.controller';
import { SalesAnalyticsController } from './controllers/sales-analytics.controller';

// Services
import { CustomerService } from './services/customer.service';
import { SalesOrderService } from './services/sales-order.service'; // Temporarily disabled due to TypeScript errors
import { InvoiceService } from './services/invoice.service';
import { PaymentService } from './services/payment.service';
import { SalesAnalyticsService } from './services/sales-analytics.service';
import { InventoryIntegrationService } from './services/inventory-integration.service';
import { TransactionManager } from '../../common/utils/transaction.util';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      SalesOrder,
      SalesOrderItem,
      Product,
      Invoice,
      InvoiceItem,
      Payment,
      User,
      StockMovement,
      PurchaseOrderItem,
    ]),
    forwardRef(() => InventoryModule),
  ],
  controllers: [
    CustomerController,
    SalesOrderController, // Temporarily disabled due to TypeScript errors
    InvoiceController,
    PaymentController,
    SalesAnalyticsController,
  ],
  providers: [
    CustomerService,
    SalesOrderService,
    InvoiceService,
    PaymentService,
    SalesAnalyticsService,
    InventoryIntegrationService,
    TransactionManager,
  ],
  exports: [
    CustomerService,
    SalesOrderService, // Temporarily disabled due to TypeScript errors
  ],
})
export class SalesModule {}