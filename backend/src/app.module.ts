import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { redisStore } from 'cache-manager-redis-yet';

// Configuration
import { DatabaseConfig } from './config/database.config';
import { RedisConfig } from './config/redis.config';

// Security
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
// import { PurchasingModule } from './modules/purchasing/purchasing.module';
// import { DashboardModule } from './modules/dashboard/dashboard-module';
// import { ReportsModule } from './modules/reports/reports.module';
// import { PluginsModule } from './modules/plugins/plugins.module';

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

    // Redis Cache
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        store: redisStore,
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        ttl: 300, // 5 minutes default TTL
      }),
    }),

    // Rate Limiting with Enhanced Configuration
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 10, // 10 requests per second
      },
      {
        name: 'medium', 
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
      {
        name: 'long',
        ttl: 900000, // 15 minutes
        limit: 1000, // 1000 requests per 15 minutes
      },
    ]),

    // Background Jobs
    BullModule.forRootAsync({
      useClass: RedisConfig,
    }),

    // Core Modules
    AuthModule,
    UsersModule,

    // Business Modules
    InventoryModule,
    SalesModule,
    // PurchasingModule,
    // DashboardModule,
    // ReportsModule,

    // Plugin System
    // PluginsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    
    // Global Security Guards
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Apply JWT authentication globally
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Apply rate limiting globally
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard, // Apply role-based access control globally
    },
    
    // Global Exception Filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter, // Handle all exceptions consistently
    },
    
    // Global Logging Interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor, // Log all requests and responses
    },
  ],
})
export class AppModule {}