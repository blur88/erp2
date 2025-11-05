import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

// Controllers
import { ReportController } from './controllers/report.controller';

// Services
import { BaseReportService } from './services/base-report.service';
import { SalesReportService } from './services/sales-report.service';
import { ScheduledReportService } from './services/scheduled-report.service';

// Entities
import { SalesOrder } from '../../database/entities/sales-order.entity';
import { Invoice } from '../../database/entities/invoice.entity';
import { Payment } from '../../database/entities/payment.entity';
import { Product } from '../../database/entities/product.entity';
import { Customer } from '../../database/entities/customer.entity';

// Imports from other modules
import { SalesModule } from '../sales/sales.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    // TypeORM entities for reports
    TypeOrmModule.forFeature([
      SalesOrder,
      Invoice,
      Payment,
      Product,
      Customer,
    ]),

    // Scheduling support
    ScheduleModule.forRoot(),

    // Cross-module dependencies
    SalesModule,
    InventoryModule,
  ],
  controllers: [ReportController],
  providers: [
    BaseReportService,
    SalesReportService,
    ScheduledReportService,
  ],
  exports: [
    BaseReportService,
    SalesReportService,
    ScheduledReportService,
  ]
})
export class ReportsModule {}