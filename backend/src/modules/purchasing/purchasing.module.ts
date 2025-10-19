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

// Controllers
import {
  SupplierController,
  PurchaseOrderController,
  GoodsReceivedNoteController,
  VendorPaymentController,
} from './controllers';

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
  ],

  controllers: [
    SupplierController,
    PurchaseOrderController,
    GoodsReceivedNoteController,
    VendorPaymentController,
  ],

  providers: [
    SupplierService,
    PurchaseOrderService,
    GoodsReceivedNoteService,
    VendorPaymentService,
  ],

  exports: [
    SupplierService,
    PurchaseOrderService,
    GoodsReceivedNoteService,
    VendorPaymentService,
  ],
})
export class PurchasingModule {}