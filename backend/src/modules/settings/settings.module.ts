import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';

import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { CompanySettings } from '../../database/entities/company-settings.entity';
import { PriceCostingSettings } from '../../database/entities/price-costing-settings.entity';

/**
 * Settings Module
 * Handles company settings and configuration
 */
@Module({
  imports: [
    // TypeORM for Settings entities
    TypeOrmModule.forFeature([CompanySettings, PriceCostingSettings]),

    // Multer for file upload
    MulterModule.register({
      dest: './uploads/logos',
    }),
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [
    SettingsService,
    TypeOrmModule,
  ],
})
export class SettingsModule {}
