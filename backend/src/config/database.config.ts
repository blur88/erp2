import { Injectable } from '@nestjs/common';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.configService.get('DATABASE_HOST', 'localhost'),
      port: this.configService.get('DATABASE_PORT', 5432),
      username: this.configService.get('DATABASE_USER', 'erp_user'),
      password: this.configService.get('DATABASE_PASSWORD', 'erp_password'),
      database: this.configService.get('DATABASE_NAME', 'erp_db'),
      entities: [__dirname + '/../database/entities/*.entity{.ts,.js}'],
      migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
      synchronize: this.configService.get('NODE_ENV') === 'development',
      logging: this.configService.get('NODE_ENV') === 'development',
      ssl: false,
      extra: {
        connectionLimit: 10,
        family: 4,
      },
    };
  }
}

// Export DataSource for CLI tools
const config = new ConfigService();

export const connectionSource = new DataSource({
  type: 'postgres',
  host: config.get('DATABASE_HOST', 'localhost'),
  port: config.get('DATABASE_PORT', 5432),
  username: config.get('DATABASE_USER', 'erp_user'),
  password: config.get('DATABASE_PASSWORD', 'erp_password'),
  database: config.get('DATABASE_NAME', 'erp_db'),
  entities: [__dirname + '/../database/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  logging: config.get('NODE_ENV') === 'development',
} as DataSourceOptions);

export default connectionSource;