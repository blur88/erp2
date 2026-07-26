import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { CompanySettings } from '../../database/entities/company-settings.entity';
import { RegionalSettings } from '../../database/entities/regional-settings.entity';
import { DocumentNumberSetting } from '../../database/entities/document-number-settings.entity';
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { Payment } from '../../database/entities/payment.entity';
import { PurchaseOrder } from '../../database/entities/purchase-order.entity';
import { StockAdjustment } from '../../database/entities/stock-adjustment.entity';
import { Expense } from '../accounting/entities/expense.entity';
import { ExpensePayment } from '../accounting/entities/expense-payment.entity';
import { PaymentMethodEntity } from '../../database/entities/payment-method.entity';
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
      RegionalSettings,
      DocumentNumberSetting,
      SalesOrder,
      Payment,
      PurchaseOrder,
      StockAdjustment,
      Expense,
      ExpensePayment,
      PaymentMethodEntity,
    ]),

    // Multer for file upload
    MulterModule.register({
      dest: './uploads/logos',
    }),
  ],
  controllers: [SettingsController, PaymentMethodController],
  providers: [SettingsService, PaymentMethodService],
  exports: [SettingsService, PaymentMethodService, TypeOrmModule],
})
export class SettingsModule {}
