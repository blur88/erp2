import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SearchQuery } from "../../database/entities/search-query.entity";
import { SearchClick } from "../../database/entities/search-click.entity";

@Injectable()
export class SearchAnalyticsService {
  private readonly logger = new Logger(SearchAnalyticsService.name);

  constructor(
    @InjectRepository(SearchQuery)
    private readonly queryRepo: Repository<SearchQuery>,
    @InjectRepository(SearchClick)
    private readonly clickRepo: Repository<SearchClick>,
  ) {}

  logQuery(params: {
    id: string;
    query: string;
    userId: string;
    resultCount: number;
    executionTimeMs: number;
  }): void {
    this.queryRepo
      .save({
        id: params.id,
        query: params.query,
        userId: params.userId,
        resultCount: params.resultCount,
        executionTimeMs: params.executionTimeMs,
      })
      .catch((error: Error) => {
        this.logger.error(
          `Failed to log search query: ${error.message}`,
          error.stack,
        );
      });
  }

  logClick(params: {
    searchQueryId?: string;
    query: string;
    resultType: string;
    resultId: string;
    resultLabel?: string;
    position: number;
  }): void {
    this.clickRepo
      .save({
        searchQueryId: params.searchQueryId ?? null,
        query: params.query,
        resultType: params.resultType,
        resultId: params.resultId,
        resultLabel: params.resultLabel ?? null,
        position: params.position,
      })
      .catch((error: Error) => {
        this.logger.error(
          `Failed to log search click: ${error.message}`,
          error.stack,
        );
      });
  }
}
