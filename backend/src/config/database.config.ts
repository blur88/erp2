import { Injectable } from '@nestjs/common';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * Security-hardened input validation for integer configuration values
 * @param value - The value to validate and parse
 * @param defaultValue - Default value if input is invalid
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param fieldName - Name of the field for error reporting
 * @returns Validated integer value
 */
function validateAndParseInt(
  value: string | undefined, 
  defaultValue: string, 
  min: number, 
  max: number, 
  fieldName: string
): number {
  const parsed = parseInt(value || defaultValue, 10);
  
  if (isNaN(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid ${fieldName}: must be between ${min} and ${max}`);
  }
  
  return parsed;
}

/**
 * Creates secure SSL configuration based on environment
 * @param configService - The NestJS config service
 * @returns SSL configuration object
 */
function createSSLConfig(configService: ConfigService): any {
  const isProduction = configService.get('NODE_ENV') === 'production';
  
  if (!isProduction) {
    // Development/staging: allow SSL to be optionally enabled
    const sslEnabled = configService.get<string>('DB_SSL', 'false') === 'true';
    return sslEnabled;
  }
  
  // Production: enforce proper SSL with certificate validation
  const sslCA = configService.get<string>('DB_SSL_CA');
  const sslCert = configService.get<string>('DB_SSL_CERT');
  const sslKey = configService.get<string>('DB_SSL_KEY');
  
  // Allow production without full SSL certs for Docker environments
  // but always enforce encryption and certificate validation
  if (sslCA && sslCert && sslKey) {
    return {
      rejectUnauthorized: true,
      ca: sslCA,
      cert: sslCert,
      key: sslKey,
    };
  }
  
  // Fallback: enforce SSL with server certificate validation
  return {
    rejectUnauthorized: true,
  };
}

/**
 * Security-hardened validation of required database environment variables
 * @param configService - The NestJS config service
 * @param allowDefaults - Allow default values for development environments
 * @throws Error if required variables are missing or invalid
 */
function validateDatabaseConfig(configService: ConfigService, allowDefaults = false): void {
  const isProduction = configService.get('NODE_ENV') === 'production';
  const requiredVars = ['DB_HOST', 'DB_PORT', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
  
  // In production, never allow missing critical environment variables
  if (isProduction || !allowDefaults) {
    const missingVars = requiredVars.filter(varName => !configService.get(varName));
    
    if (missingVars.length > 0) {
      throw new Error(`Critical: Missing required database environment variables: ${missingVars.join(', ')}`);
    }
  }
  
  // Additional production-specific validations
  if (isProduction) {
    const dbPassword = configService.get<string>('DB_PASSWORD');
    if (!dbPassword || dbPassword.length < 12) {
      throw new Error('Production database password must be at least 12 characters');
    }
    
    // Validate production database host is not using defaults
    const dbHost = configService.get<string>('DB_HOST');
    if (dbHost === 'localhost' || dbHost === '127.0.0.1' || dbHost === 'postgres') {
      console.warn('WARNING: Production database host appears to be using development defaults');
    }
  }
  
  // Validate port range
  const dbPort = configService.get<string>('DB_PORT', '5432');
  validateAndParseInt(dbPort, '5432', 1, 65535, 'DB_PORT');
}

/**
 * Creates a security-hardened database configuration object
 * @param configService - The NestJS config service
 * @param allowDefaults - Allow default values for development/CLI usage
 * @returns Database configuration options
 * @throws Error if configuration is invalid or insecure
 */
function createDatabaseConfig(configService: ConfigService, allowDefaults = false): DataSourceOptions {
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

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    try {
      return createDatabaseConfig(this.configService, false);
    } catch (error) {
      // Security: Log error internally without exposing sensitive details
      console.error('Database configuration failed - check environment variables and security settings');
      
      // Re-throw with generic message to prevent information disclosure
      throw new Error('Database configuration error - check server logs');
    }
  }
}

// Export DataSource for CLI tools with security validation
// Note: CLI operations now also enforce security validations but allow defaults for development
const config = new ConfigService();

let connectionSource: DataSource;
try {
  connectionSource = new DataSource(createDatabaseConfig(config, true));
} catch (error) {
  console.error('CLI database configuration failed:', error.message);
  // For CLI operations, we need to fail fast if configuration is invalid
  process.exit(1);
}

export { connectionSource };
export default connectionSource;