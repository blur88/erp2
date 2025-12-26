import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

// Configuration
import { DatabaseConfig } from './config/database.config';

// Filters & Interceptors
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { 
  DatabaseErrorHandler,
  ErrorClassifierService,
  DatabaseErrorLoggerService,
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
import { DashboardModule } from './modules/dashboard/dashboard-module';
import { SettingsModule } from './modules/settings/settings.module';
import { PrintSettingsModule } from './modules/print-settings/print-settings.module';
import { BackupModule } from './modules/backup/backup.module';
// import { PluginsModule } from './modules/plugins/plugins.module'; // Disabled due to auth compilation issues

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

    // Bull Queue for background jobs
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST', 'redis'),
          port: parseInt(configService.get<string>('REDIS_PORT', '6379')),
          password: configService.get<string>('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),

    // Schedule Module for cron jobs
    ScheduleModule.forRoot(),

    // Core Modules
    UsersModule,
    InventoryModule,
    SalesModule,
    PurchasingModule,
    DashboardModule, // Re-enabled - WebSocket support
    SettingsModule, // Company settings
    PrintSettingsModule, // Print settings and templates
    BackupModule, // Backup and restore functionality
    // PluginsModule, // Re-enable after fixing compilation issues
  ],
  controllers: [AppController],
  providers: [
    AppService,
    
    // Database Error Handler Services
    DatabaseErrorHandler,
    ErrorClassifierService,
    DatabaseErrorLoggerService,
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