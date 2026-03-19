import { Controller, Get, Query, Request } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { GlobalSearchQueryDto } from './dto/global-search-query.dto';
import { GlobalSearchResponseDto } from './dto/global-search-response.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('global')
  @ApiOperation({
    summary: 'Global search across pages, customers, products, and transactions',
  })
  async searchGlobal(
    @Query() query: GlobalSearchQueryDto,
    @Request() req: any,
  ): Promise<GlobalSearchResponseDto> {
    return this.searchService.search(query.q, req.user);
  }
}
