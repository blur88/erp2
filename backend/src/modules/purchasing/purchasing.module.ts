import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  readStockEvidenceHorizon,
  STOCK_EVIDENCE_HORIZON,
} from '../../config/stock-evidence-horizon';

// Entities
import {
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  VendorPayment,
  PaymentMethodEntity,
  Product,
  User,
} from '../../database/entities';

// Services
import { SupplierService } from './services/supplier.service';
import { PurchaseOrderService } from './services/purchase-order.service';
import { PurchaseOrderLifecycleService } from './services/purchase-order-lifecycle.service';
import { VendorPaymentService } from './services/vendor-payment.service';
import { PurchasingAnalyticsService } from './services/purchasing-analytics.service';

// Controllers
import {
  SupplierController,
  PurchaseOrderController,
  VendorPaymentController,
  PurchasingAnalyticsController,
} from './controllers';

// Import InventoryModule for BaseCostCalculatorService
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      PurchaseOrder,
      PurchaseOrderItem,
      VendorPayment,
      PaymentMethodEntity,
      Product,
      User,
    ]),
    InventoryModule, // Import to access BaseCostCalculatorService
    SettingsModule, // Import for price/costing settings
    AccountingModule,
  ],

  controllers: [
    SupplierController,
    PurchaseOrderController,
    VendorPaymentController,
    PurchasingAnalyticsController,
  ],

  providers: [
    SupplierService,
    PurchaseOrderService,
    PurchaseOrderLifecycleService,
    VendorPaymentService,
    PurchasingAnalyticsService,
    {
      // Read once at module init: a malformed STOCK_EVIDENCE_HORIZON fails
      // startup rather than silently changing what unreceive will accept.
      provide: STOCK_EVIDENCE_HORIZON,
      useFactory: (config: ConfigService) =>
        readStockEvidenceHorizon(config.get<string>('STOCK_EVIDENCE_HORIZON')),
      inject: [ConfigService],
    },
  ],

  exports: [
    SupplierService,
    PurchaseOrderService,
    PurchaseOrderLifecycleService,
    VendorPaymentService,
    PurchasingAnalyticsService,
  ],
})
export class PurchasingModule {}
