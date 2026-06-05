import { ConfigService } from '@nestjs/config';
import { validateAndParseInt } from './validation.utils';

/**
 * Environment variable validation utilities
 */

/**
 * Security-hardened validation of required database environment variables
 * @param configService - The NestJS config service
 * @param allowDefaults - Allow default values for development environments
 * @throws Error if required variables are missing or invalid
 */
export function validateDatabaseConfig(configService: ConfigService, allowDefaults = false): void {
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