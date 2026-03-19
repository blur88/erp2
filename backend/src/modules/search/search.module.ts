import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { SalesModule } from '../sales/sales.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [SalesModule, InventoryModule, PurchasingModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
