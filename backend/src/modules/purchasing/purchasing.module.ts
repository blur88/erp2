import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

// Entities
import {
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceivedNote,
  GoodsReceivedNoteItem,
  VendorPayment,
  PaymentMethodEntity,
  Product,
  User,
} from "../../database/entities";

// Services
import { SupplierService } from "./services/supplier.service";
import { PurchaseOrderService } from "./services/purchase-order.service";
import { PurchaseOrderLifecycleService } from "./services/purchase-order-lifecycle.service";
import { GoodsReceivedNoteService } from "./services/goods-received-note.service";
import { VendorPaymentService } from "./services/vendor-payment.service";
import { PurchasingAnalyticsService } from "./services/purchasing-analytics.service";

// Controllers
import {
  SupplierController,
  PurchaseOrderController,
  GoodsReceivedNoteController,
  VendorPaymentController,
  PurchasingAnalyticsController,
} from "./controllers";

// Import InventoryModule for BaseCostCalculatorService
import { InventoryModule } from "../inventory/inventory.module";
import { SettingsModule } from "../settings/settings.module";
import { AccountingModule } from "../accounting/accounting.module";
import { ExportModule } from "../../common/export.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      PurchaseOrder,
      PurchaseOrderItem,
      GoodsReceivedNote,
      GoodsReceivedNoteItem,
      VendorPayment,
      PaymentMethodEntity,
      Product,
      User,
    ]),
    InventoryModule, // Import to access BaseCostCalculatorService
    SettingsModule, // Import for price/costing settings
    AccountingModule, // Import for auto-posting accounting entries
    ExportModule,
  ],

  controllers: [
    SupplierController,
    PurchaseOrderController,
    GoodsReceivedNoteController,
    VendorPaymentController,
    PurchasingAnalyticsController,
  ],

  providers: [
    SupplierService,
    PurchaseOrderService,
    PurchaseOrderLifecycleService,
    GoodsReceivedNoteService,
    VendorPaymentService,
    PurchasingAnalyticsService,
  ],

  exports: [
    SupplierService,
    PurchaseOrderService,
    PurchaseOrderLifecycleService,
    GoodsReceivedNoteService,
    VendorPaymentService,
    PurchasingAnalyticsService,
  ],
})
export class PurchasingModule {}
