import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountingModule } from "../accounting/accounting.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PurchasingModule } from "../purchasing/purchasing.module";
import { SalesModule } from "../sales/sales.module";
import { SearchClick } from "../../database/entities/search-click.entity";
import { SearchQuery } from "../../database/entities/search-query.entity";
import { SearchAnalyticsService } from "./search-analytics.service";
import { SearchController } from "./search.controller";
import { SearchScheduler } from "./search.scheduler";
import { SearchService } from "./search.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchQuery, SearchClick]),
    SalesModule,
    InventoryModule,
    PurchasingModule,
    AccountingModule,
  ],
  controllers: [SearchController],
  providers: [SearchService, SearchAnalyticsService, SearchScheduler],
})
export class SearchModule {}
