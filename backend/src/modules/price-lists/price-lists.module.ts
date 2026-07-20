import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceList, PriceListItem } from '@/database/entities';
import { SettingsModule } from '../settings/settings.module';
import { PriceListsController } from './price-lists.controller';
import { PriceListsService } from './services/price-lists.service';

@Module({
  imports: [TypeOrmModule.forFeature([PriceList, PriceListItem]), SettingsModule],
  controllers: [PriceListsController],
  providers: [PriceListsService],
  exports: [PriceListsService],
})
export class PriceListsModule {}
