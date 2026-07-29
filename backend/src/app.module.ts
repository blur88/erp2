import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';

// Configuration
import { DatabaseConfig } from './config/database.config';

// Filters & Interceptors
import { ErrorManagementModule } from './common/error-management';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { UsersModule } from './modules/users/users.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { DashboardModule } from './modules/dashboard/dashboard-module';
import { SettingsModule } from './modules/settings/settings.module';
import { PrintSettingsModule } from './modules/print-settings/print-settings.module';
import { BackupModule } from './modules/backup/backup.module';
import { PriceListsModule } from './modules/price-lists/price-lists.module';
import { SearchModule } from './modules/search/search.module';
import { AccountingModule } from './modules/accounting/accounting.module';

// Auth Guards
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';

// Controllers
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      // In Docker every DB_*/REDIS_* var is injected by docker-compose.yml, so
      // no file is read. These paths are the host-side fallback: .env.local is
      // gitignored, points at a scratch database, and is tried first. Earlier
      // entries win — dotenv never overwrites an already-set variable.
      envFilePath:
        process.env.NODE_ENV === 'test' ? ['.env.test'] : ['.env.local'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
    }),

    // Bull Queue for background jobs
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'redis'),
          port: parseInt(configService.get<string>('REDIS_PORT', '6379')),
          password: configService.get<string>('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),

    // Schedule Module for cron jobs
    ScheduleModule.forRoot(),

    ErrorManagementModule,

    // Core Modules
    AuthModule, // Authentication and authorization
    AuditLogsModule, // Audit logging (global)
    UsersModule,
    InventoryModule,
    SalesModule,
    PurchasingModule,
    DashboardModule, // Re-enabled - WebSocket support
    SettingsModule, // Company settings
    PrintSettingsModule, // Print settings and templates
    BackupModule, // Backup and restore functionality
    PriceListsModule, // Price list management (Phase 3)
    SearchModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // Global Logging Interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },

    // Global JWT Auth Guard - All routes protected by default
    // Use @Public() decorator to bypass authentication
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
