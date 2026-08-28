import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import * as path from 'path';
import { validateAndParseInt } from './validation.utils';
import { createSSLConfig } from './ssl.config';
import { validateDatabaseConfig } from './environment.validator';
import { ChartOfAccount } from '../modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../modules/accounting/entities/accounting-settings.entity';
import { Expense } from '../modules/accounting/entities/expense.entity';
import { ExpensePayment } from '../modules/accounting/entities/expense-payment.entity';
import { JournalEntry } from '../modules/accounting/entities/journal-entry.entity';
import { JournalEntryLine } from '../modules/accounting/entities/journal-entry-line.entity';
import { OwnerEquityDocument } from '../modules/owner-equity/entities/owner-equity-document.entity';
import { OwnerEquitySettlement } from '../modules/owner-equity/entities/owner-equity-settlement.entity';
import { AuditLog } from '../database/entities/audit-log.entity';
import { BackupLog } from '../database/entities/backup-log.entity';
import { BackupSchedule } from '../database/entities/backup-schedule.entity';
import { BackupRetentionSettings } from '../database/entities/backup-settings.entity';
import { Category } from '../database/entities/category.entity';
import { CompanySettings } from '../database/entities/company-settings.entity';
import { Customer } from '../database/entities/customer.entity';
import { DocumentNumberSetting } from '../database/entities/document-number-settings.entity';
import { Payment } from '../database/entities/payment.entity';
import { PaymentMethodEntity } from '../database/entities/payment-method.entity';
import { RegionalSettings } from '../database/entities/regional-settings.entity';
import { PriceList } from '../database/entities/price-list.entity';
import { PriceListItem } from '../database/entities/price-list-item.entity';
import { PrintSettings } from '../database/entities/print-settings.entity';
import { Product } from '../database/entities/product.entity';
import { PurchaseCostHistory } from '../database/entities/purchase-cost-history.entity';
import { PurchaseOrder } from '../database/entities/purchase-order.entity';
import { PurchaseOrderItem } from '../database/entities/purchase-order-item.entity';
import { RedisAlertStateEntity } from '../database/entities/redis-alert-state.entity';
import { RedisMemorySampleEntity } from '../database/entities/redis-memory-sample.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { SalesOrder } from '../database/entities/sales-order.entity';
import { SalesOrderItem } from '../database/entities/sales-order-item.entity';
import { SalesOrderPayment } from '../database/entities/sales-order-payment.entity';
import { SearchClick } from '../database/entities/search-click.entity';
import { SearchQuery } from '../database/entities/search-query.entity';
import { StockAdjustment, StockAdjustmentItem } from '../database/entities/stock-adjustment.entity';
import { StockMovement } from '../database/entities/stock-movement.entity';
import { Supplier } from '../database/entities/supplier.entity';
import { User } from '../database/entities/user.entity';
import { VendorPayment } from '../database/entities/vendor-payment.entity';

/**
 * Database configuration factory utilities
 */

/**
 * Creates a security-hardened database configuration object
 * @param configService - The NestJS config service
 * @param allowDefaults - Allow default values for development/CLI usage
 * @returns Database configuration options
 * @throws Error if configuration is invalid or insecure
 */
export function createDatabaseConfig(
  configService: ConfigService,
  allowDefaults = false,
): DataSourceOptions {
  // Validate required environment variables with security checks
  validateDatabaseConfig(configService, allowDefaults);

  const isProduction = configService.get('NODE_ENV') === 'production';
  const isDevelopment = configService.get('NODE_ENV') === 'development';

  // Get configuration values with proper validation
  const host = configService.get<string>('DB_HOST') || (allowDefaults ? 'postgres' : undefined);
  const port = validateAndParseInt(
    configService.get<string>('DB_PORT'),
    '5432',
    1,
    65535,
    'DB_PORT',
  );
  const username =
    configService.get<string>('DB_USERNAME') || (allowDefaults ? 'erp_user' : undefined);
  const password =
    configService.get<string>('DB_PASSWORD') || (allowDefaults ? 'erp_password' : undefined);
  const database =
    configService.get<string>('DB_DATABASE') || (allowDefaults ? 'erp_db' : undefined);

  // Ensure all required values are present
  if (!host || !username || !password || !database) {
    throw new Error('Database configuration incomplete - check environment variables');
  }

  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    entities: [
      AuditLog,
      BackupLog,
      RedisMemorySampleEntity,
      RedisAlertStateEntity,
      BackupSchedule,
      BackupRetentionSettings,
      Category,
      CompanySettings,
      Customer,
      DocumentNumberSetting,
      Payment,
      PaymentMethodEntity,
      RegionalSettings,
      PriceList,
      PriceListItem,
      PrintSettings,
      Product,
      PurchaseCostHistory,
      PurchaseOrder,
      PurchaseOrderItem,
      RefreshToken,
      SalesOrder,
      SalesOrderItem,
      SalesOrderPayment,
      SearchClick,
      SearchQuery,
      StockAdjustment,
      StockAdjustmentItem,
      StockMovement,
      Supplier,
      User,
      VendorPayment,
      ChartOfAccount,
      AccountingSettings,
      Expense,
      ExpensePayment,
      JournalEntry,
      JournalEntryLine,
      OwnerEquityDocument,
      OwnerEquitySettlement,
    ],
    migrations: [path.join(process.cwd(), 'src/database/migrations/*{.ts,.js}')],
    // 'each' (not the TypeORM default 'all') so a migration that appends an
    // enum value commits before a later migration uses that value. Postgres
    // forbids ALTER TYPE ... ADD VALUE and its use inside one transaction.
    migrationsTransactionMode: 'each',

    // Security: Disable auto-synchronization in production
    synchronize:
      !isProduction &&
      isDevelopment &&
      configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true',

    // Controlled logging without sensitive data
    logging: isDevelopment && configService.get<string>('DB_LOGGING', 'false') === 'true',

    // Security-hardened SSL configuration
    ssl: createSSLConfig(configService),

    extra: {
      // Validated connection pool settings
      connectionLimit: validateAndParseInt(
        configService.get<string>('DB_MAX_CONNECTIONS'),
        '10',
        1,
        100,
        'DB_MAX_CONNECTIONS',
      ),

      // Network configuration
      family: 4, // Force IPv4 for Docker compatibility

      // Timeout configurations with reasonable limits
      connectionTimeoutMillis: validateAndParseInt(
        configService.get<string>('DB_CONNECTION_TIMEOUT'),
        '60000',
        5000,
        300000,
        'DB_CONNECTION_TIMEOUT',
      ),
      idleTimeoutMillis: validateAndParseInt(
        configService.get<string>('DB_IDLE_TIMEOUT'),
        '10000',
        1000,
        3600000,
        'DB_IDLE_TIMEOUT',
      ),

      // Timezone configuration for PostgreSQL
      timezone: 'UTC',
    },
  };
}
