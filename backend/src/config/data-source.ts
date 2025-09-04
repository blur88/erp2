import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

const config = new ConfigService();

export default new DataSource({
  type: 'postgres',
  host: config.get('DATABASE_HOST', 'localhost'),
  port: config.get('DATABASE_PORT', 5432),
  username: config.get('DATABASE_USER', 'erp_user'),
  password: config.get('DATABASE_PASSWORD', 'erp_password'),
  database: config.get('DATABASE_NAME', 'erp_db'),
  entities: [__dirname + '/../database/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  logging: config.get('NODE_ENV') === 'development',
});