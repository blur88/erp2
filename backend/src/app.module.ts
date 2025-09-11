import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

// Configuration
import { DatabaseConfig } from './config/database.config';

// Filters & Interceptors
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { 
  DatabaseErrorHandler,
  ErrorClassifierService,
  ErrorLoggerService,
  ErrorSanitizerService,
  IdGeneratorService 
} from './common/services';

// Import missing filter dependencies
import { 
  SecurityDetectorService,
  ErrorLoggerService,
  HttpExceptionHandler,
  DatabaseExceptionHandler,
  UnexpectedExceptionHandler,
  LogFormatterService,
  DataSanitizerService,
} from './common/filters';

// Modules
import { UsersModule } from './modules/users/users.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DashboardModule } from './modules/dashboard/dashboard-module';
import { PluginsModule } from './modules/plugins/plugins.module';

// Controllers
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Database
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),

    // Core Modules
    UsersModule,
    InventoryModule,
    SalesModule, // Re-enabled after fixing auth compilation issues
    // PurchasingModule, // Re-enable after fixing compilation issues  
    // ReportsModule, // Re-enable after fixing compilation issues
    DashboardModule, // Re-enabled - WebSocket support
    // PluginsModule, // Re-enable after fixing compilation issues
  ],
  controllers: [AppController],
  providers: [
    AppService,
    
    // Database Error Handler Services
    DatabaseErrorHandler,
    ErrorClassifierService,
    ErrorLoggerService,
    ErrorSanitizerService,
    IdGeneratorService,
    
    // Exception filter dependencies
    SecurityDetectorService,
    ErrorLoggerService,
    LogFormatterService,
    DataSanitizerService,
    HttpExceptionHandler,
    DatabaseExceptionHandler,
    UnexpectedExceptionHandler,
    
    // Global Exception Filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    
    // Global Logging Interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}