import { Injectable } from '@nestjs/common';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createDatabaseConfig } from './database-config.factory';

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

// Export DataSource for CLI tools - moved to separate module
export { default } from './cli-datasource';