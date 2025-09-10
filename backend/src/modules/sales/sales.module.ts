import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Customer } from '../../database/entities/customer.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../database/entities/sales-order-item.entity';
import { Invoice } from '../../database/entities/invoice.entity';
import { Payment } from '../../database/entities/payment.entity';
import { Product } from '../../database/entities/product.entity';
import { User } from '../../database/entities/user.entity';
import { StockMovement } from '../../database/entities/stock-movement.entity';

// Controllers
import {
  CustomerController,
  SalesOrderController,
  InvoiceController,
  PaymentController,
  QuotationController,
  CreditManagementController,
  SalesAnalyticsController,
} from './controllers';

// Services
import {
  CustomerService,
  SalesOrderService,
  InvoiceService,
  PaymentService,
  QuotationService,
  CreditManagementService,
  InventoryIntegrationService,
  SalesAnalyticsService,
} from './services';

// External services (from other modules)
// import { EmailService } from '../auth/services/email.service'; // Temporarily disabled

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Core sales entities
      Customer,
      SalesOrder,
      SalesOrderItem,
      Invoice,
      Payment,
      
      // Related entities from other modules
      Product,
      User,
      StockMovement,
    ]),
  ],
  controllers: [
    CustomerController,
    SalesOrderController,
    InvoiceController,
    PaymentController,
    QuotationController,
    CreditManagementController,
    SalesAnalyticsController,
  ],
  providers: [
    // Core sales services
    CustomerService,
    SalesOrderService,
    InvoiceService,
    PaymentService,
    QuotationService,
    CreditManagementService,
    InventoryIntegrationService,
    SalesAnalyticsService,
    
    // External services
    // EmailService, // Temporarily disabled
  ],
  exports: [
    // Export services that might be used by other modules
    CustomerService,
    SalesOrderService,
    InvoiceService,
    PaymentService,
    QuotationService,
    CreditManagementService,
    InventoryIntegrationService,
    SalesAnalyticsService,
  ],
})
export class SalesModule {}