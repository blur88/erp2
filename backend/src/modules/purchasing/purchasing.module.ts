import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import {
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceivedNote,
  GoodsReceivedNoteItem,
  VendorPayment,
  Product,
  User,
} from '../../database/entities';

// Services
import { SupplierService } from './services/supplier.service';
import { PurchaseOrderService } from './services/purchase-order.service';
import { GoodsReceivedNoteService } from './services/goods-received-note.service';
import { VendorPaymentService } from './services/vendor-payment.service';
import { PurchasingAnalyticsService } from './services/purchasing-analytics.service';

// Controllers
import {
  SupplierController,
  PurchaseOrderController,
  GoodsReceivedNoteController,
  VendorPaymentController,
  PurchasingAnalyticsController,
} from './controllers';

// Import InventoryModule for BaseCostCalculatorService
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      PurchaseOrder,
      PurchaseOrderItem,
      GoodsReceivedNote,
      GoodsReceivedNoteItem,
      VendorPayment,
      Product,
      User,
    ]),
    InventoryModule, // Import to access BaseCostCalculatorService
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
    GoodsReceivedNoteService,
    VendorPaymentService,
    PurchasingAnalyticsService,
  ],

  exports: [
    SupplierService,
    PurchaseOrderService,
    GoodsReceivedNoteService,
    VendorPaymentService,
    PurchasingAnalyticsService,
  ],
})
export class PurchasingModule {}