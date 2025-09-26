import { ConfigService } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import { validateAndParseInt } from './validation.utils';
import { createSSLConfig } from './ssl.config';
import { validateDatabaseConfig } from './environment.validator';

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
export function createDatabaseConfig(configService: ConfigService, allowDefaults = false): DataSourceOptions {
  // Validate required environment variables with security checks
  validateDatabaseConfig(configService, allowDefaults);

  const isProduction = configService.get('NODE_ENV') === 'production';
  const isDevelopment = configService.get('NODE_ENV') === 'development';

  // Get configuration values with proper validation
  const host = configService.get<string>('DB_HOST') || (allowDefaults ? 'postgres' : undefined);
  const port = validateAndParseInt(configService.get<string>('DB_PORT'), '5432', 1, 65535, 'DB_PORT');
  const username = configService.get<string>('DB_USERNAME') || (allowDefaults ? 'erp_user' : undefined);
  const password = configService.get<string>('DB_PASSWORD') || (allowDefaults ? 'erp_password' : undefined);
  const database = configService.get<string>('DB_DATABASE') || (allowDefaults ? 'erp_db' : undefined);

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
    entities: [__dirname + '/../database/entities/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    
    // Security: Disable auto-synchronization in production
    synchronize: !isProduction && isDevelopment && configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
    
    // Controlled logging without sensitive data
    logging: isDevelopment && configService.get<string>('DB_LOGGING', 'false') === 'true',
    
    // Security-hardened SSL configuration
    ssl: createSSLConfig(configService),
    
    extra: {
      // Validated connection pool settings
      connectionLimit: validateAndParseInt(
        configService.get<string>('DB_MAX_CONNECTIONS'), 
        '10', 1, 100, 'DB_MAX_CONNECTIONS'
      ),
      
      // Network configuration
      family: 4, // Force IPv4 for Docker compatibility
      
      // Timeout configurations with reasonable limits
      connectionTimeoutMillis: validateAndParseInt(
        configService.get<string>('DB_CONNECTION_TIMEOUT'), 
        '60000', 5000, 300000, 'DB_CONNECTION_TIMEOUT'
      ),
      idleTimeoutMillis: validateAndParseInt(
        configService.get<string>('DB_IDLE_TIMEOUT'), 
        '10000', 1000, 3600000, 'DB_IDLE_TIMEOUT'
      ),
    },
  };
}