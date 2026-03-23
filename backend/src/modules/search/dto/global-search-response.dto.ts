import { GlobalSearchResultDto } from './global-search-result.dto';

export class GlobalSearchResponseDto {
  query: string;
  searchQueryId: string;
  results: GlobalSearchResultDto[];
}
