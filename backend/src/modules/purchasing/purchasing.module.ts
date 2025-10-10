import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import {
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceivedNote,
  Product,
  User,
} from '../../database/entities';

// Services
import { SupplierService } from './services/supplier.service';
import { PurchaseOrderService } from './services/purchase-order.service';
import { GoodsReceivedNoteService } from './services/goods-received-note.service';

// Controllers
import {
  SupplierController,
  PurchaseOrderController,
  GoodsReceivedNoteController,
} from './controllers';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      PurchaseOrder,
      PurchaseOrderItem,
      GoodsReceivedNote,
      Product,
      User,
    ]),
  ],

  controllers: [
    SupplierController,
    PurchaseOrderController,
    GoodsReceivedNoteController,
  ],

  providers: [
    SupplierService,
    PurchaseOrderService,
    GoodsReceivedNoteService,
  ],

  exports: [
    SupplierService,
    PurchaseOrderService,
    GoodsReceivedNoteService,
  ],
})
export class PurchasingModule {}