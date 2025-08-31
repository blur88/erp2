import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

// Controllers
import { ReportController } from './controllers/report.controller';

// Services
import { BaseReportService } from './services/base-report.service';
import { SalesReportService } from './services/sales-report.service';
import { ScheduledReportService } from './services/scheduled-report.service';

// Repositories
import { ReportRepository } from './repositories/report.repository';

// Schemas
import { 
  ScheduledReportSchema, 
  ReportTemplateSchema 
} from './models/report.schema';

// Imports from other modules
// AuthModule removed - authentication system disabled
import { SharedModule } from '../shared/shared.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalesModule } from '../sales/sales.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CrmModule } from '../crm/crm.module';

@Module({
  imports: [
    // Mongoose schemas
    MongooseModule.forFeature([
      { name: 'ScheduledReport', schema: ScheduledReportSchema },
      { name: 'ReportTemplate', schema: ReportTemplateSchema }
    ]),
    
    // Scheduling support
    ScheduleModule.forRoot(),
    
    // Cross-module dependencies
    // AuthModule removed - authentication system disabled
    SharedModule,
    NotificationsModule,
    SalesModule,
    InventoryModule,
    CrmModule
  ],
  controllers: [ReportController],
  providers: [
    BaseReportService,
    SalesReportService,
    ScheduledReportService,
    ReportRepository
  ],
  exports: [
    BaseReportService,
    SalesReportService,
    ScheduledReportService,
    ReportRepository
  ]
})
export class ReportsModule {}