import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import {
  Supplier,
  PurchaseOrder,
} from '../../database/entities';

// Services
import { SupplierService } from './services/supplier.service';

// Controllers
import {
  SupplierController,
} from './controllers';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      PurchaseOrder, // Needed for supplier.remove() method check
    ]),
  ],

  controllers: [
    SupplierController,
  ],

  providers: [
    SupplierService,
  ],

  exports: [
    SupplierService,
  ],
})
export class PurchasingModule {}