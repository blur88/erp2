import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { CompanySettings } from '../../database/entities/company-settings.entity';
import { PriceCostingSettings } from '../../database/entities/price-costing-settings.entity';
import { DocumentNumberSettings } from '../../database/entities/document-number-settings.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { Invoice } from '../../database/entities/invoice.entity';
import { Payment } from '../../database/entities/payment.entity';
import { PurchaseOrder } from '../../database/entities/purchase-order.entity';
import { GoodsReceivedNote } from '../../database/entities/goods-received-note.entity';
import { VendorPayment } from '../../database/entities/vendor-payment.entity';
import { StockAdjustment } from '../../database/entities/stock-adjustment.entity';
import { PaymentMethodEntity } from '../../database/entities/payment-method.entity';
import { AccountMapping } from '../../database/entities/account-mapping.entity';
import { ChartOfAccount } from '../../database/entities/chart-of-account.entity';
import { PaymentMethodController } from './controllers/payment-method.controller';
import { PaymentMethodService } from './services/payment-method.service';

/**
 * Settings Module
 * Handles company settings and configuration
 */
@Module({
  imports: [
    // TypeORM for Settings entities and document number sync
    TypeOrmModule.forFeature([
      CompanySettings,
      PriceCostingSettings,
      DocumentNumberSettings,
      SalesOrder,
      Invoice,
      Payment,
      PurchaseOrder,
      GoodsReceivedNote,
      VendorPayment,
      StockAdjustment,
      PaymentMethodEntity,
      AccountMapping,
      ChartOfAccount,
    ]),

    // Multer for file upload
    MulterModule.register({
      dest: './uploads/logos',
    }),
  ],
  controllers: [SettingsController, PaymentMethodController],
  providers: [SettingsService, PaymentMethodService],
  exports: [
    SettingsService,
    PaymentMethodService,
    TypeOrmModule,
  ],
})
export class SettingsModule {}
