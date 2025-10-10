import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import {
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  Product,
  User,
} from '../../database/entities';

// Services
import { SupplierService } from './services/supplier.service';
import { PurchaseOrderService } from './services/purchase-order.service';

// Controllers
import {
  SupplierController,
  PurchaseOrderController,
} from './controllers';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      PurchaseOrder,
      PurchaseOrderItem,
      Product,
      User,
    ]),
  ],

  controllers: [
    SupplierController,
    PurchaseOrderController,
  ],

  providers: [
    SupplierService,
    PurchaseOrderService,
  ],

  exports: [
    SupplierService,
    PurchaseOrderService,
  ],
})
export class PurchasingModule {}