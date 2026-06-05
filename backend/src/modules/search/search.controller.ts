import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SearchAnalyticsService } from "./search-analytics.service";
import { SearchService } from "./search.service";
import { GlobalSearchQueryDto } from "./dto/global-search-query.dto";
import { GlobalSearchResponseDto } from "./dto/global-search-response.dto";
import { TrackClickDto } from "./dto/track-click.dto";

@ApiTags("Search")
@Controller("search")
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly searchAnalyticsService: SearchAnalyticsService,
  ) {}

  @Get("global")
  @ApiOperation({
    summary:
      "Global search across pages, customers, products, and transactions",
  })
  async searchGlobal(
    @Query() query: GlobalSearchQueryDto,
    @Request() req: any,
  ): Promise<GlobalSearchResponseDto> {
    return this.searchService.search(query.q, req.user);
  }

  @Post("click")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Track a search result click" })
  trackClick(@Body() dto: TrackClickDto, @Request() req: any): void {
    this.searchAnalyticsService.logClick({
      searchQueryId: dto.searchQueryId,
      query: dto.query.trim(),
      resultType: dto.resultType,
      resultId: dto.resultId,
      resultLabel: dto.resultLabel,
      position: dto.position,
    });
  }
}
