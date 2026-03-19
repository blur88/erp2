import { GlobalSearchResultDto } from './global-search-result.dto';

export class GlobalSearchResponseDto {
  query: string;
  results: GlobalSearchResultDto[];
}
