import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

// Entities
import { Customer } from "../../database/entities/customer.entity";
import { SalesOrder } from "../../database/entities/sales-order.entity";
import { SalesOrderItem } from "../../database/entities/sales-order-item.entity";
import { SalesOrderPayment } from "../../database/entities/sales-order-payment.entity";
import { Product } from "../../database/entities/product.entity";
import { Payment } from "../../database/entities/payment.entity";
import { PaymentMethodEntity } from "../../database/entities/payment-method.entity";
import { User } from "../../database/entities/user.entity";
import { StockMovement } from "../../database/entities/stock-movement.entity";
import { PurchaseOrderItem } from "../../database/entities/purchase-order-item.entity";
import { PriceListItem } from "../../database/entities/price-list-item.entity";
import { InventoryModule } from "../inventory/inventory.module";
import { SettingsModule } from "../settings/settings.module";
import { AccountingModule } from "../accounting/accounting.module";
import { ExportModule } from "../../common/export.module";

// Controllers
import { CustomerController } from "./controllers/customer.controller";
import { SalesOrderController } from "./controllers/sales-order.controller"; // Temporarily disabled due to TypeScript errors
import { PaymentController } from "./controllers/payment.controller";
import { SalesAnalyticsController } from "./controllers/sales-analytics.controller";

// Services
import { CustomerService } from "./services/customer.service";
import { SalesOrderService } from "./services/sales-order.service"; // Temporarily disabled due to TypeScript errors
import { PaymentService } from "./services/payment.service";
import { SalesAnalyticsService } from "./services/sales-analytics.service";
import { SalesAnalyticsReportService } from "./services/sales-analytics-report.service";
import { InventoryIntegrationService } from "./services/inventory-integration.service";
import { SalesOrderFulfillmentService } from "./services/sales-order-fulfillment.service";
import { SalesOrderLifecycleService } from "./services/sales-order-lifecycle.service";
import { SalesOrderPaymentService } from "./services/sales-order-payment.service";
import { SalesOrderQueryService } from "./services/sales-order-query.service";
import { TransactionManager } from "../../common/utils/transaction.util";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      SalesOrder,
      SalesOrderItem,
      SalesOrderPayment,
      Product,
      Payment,
      PaymentMethodEntity,
      User,
      StockMovement,
      PurchaseOrderItem,
      PriceListItem,
    ]),
    forwardRef(() => InventoryModule),
    SettingsModule,
    AccountingModule,
    ExportModule,
  ],
  controllers: [
    CustomerController,
    SalesOrderController, // Temporarily disabled due to TypeScript errors
    PaymentController,
    SalesAnalyticsController,
  ],
  providers: [
    CustomerService,
    SalesOrderService,
    PaymentService,
    SalesAnalyticsService,
    SalesAnalyticsReportService,
    InventoryIntegrationService,
    SalesOrderFulfillmentService,
    SalesOrderLifecycleService,
    SalesOrderPaymentService,
    SalesOrderQueryService,
    TransactionManager,
  ],
  exports: [
    CustomerService,
    SalesOrderService, // Temporarily disabled due to TypeScript errors
    PaymentService,
  ],
})
export class SalesModule {}
