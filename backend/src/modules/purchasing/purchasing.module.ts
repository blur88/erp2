import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import {
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseRequisition,
  PurchaseRequisitionItem,
  GoodsReceivedNote,
  SupplierInvoice,
  SupplierInvoiceItem,
  User,
  Product,
  StockMovement,
  Category,
} from '../../database/entities';

// Services
import {
  SupplierService,
  PurchaseOrderService,
  PurchaseRequisitionService,
  // Additional services will be added as they are created
} from './services';

// Controllers
import {
  SupplierController,
  // Additional controllers will be added as they are created
} from './controllers';

// Other modules
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Core purchasing entities
      Supplier,
      PurchaseOrder,
      PurchaseOrderItem,
      PurchaseRequisition,
      PurchaseRequisitionItem,
      GoodsReceivedNote,
      SupplierInvoice,
      SupplierInvoiceItem,
      
      // Related entities from other modules
      User,
      Product,
      StockMovement,
      Category,
    ]),
    
    // Import related modules
    forwardRef(() => InventoryModule),
  ],
  
  controllers: [
    SupplierController,
    // Additional controllers will be added as they are created
  ],
  
  providers: [
    SupplierService,
    PurchaseOrderService,
    PurchaseRequisitionService,
    // Additional services will be added as they are created
  ],
  
  exports: [
    SupplierService,
    PurchaseOrderService,
    PurchaseRequisitionService,
    // Export services for use in other modules
  ],
})
export class PurchasingModule {}