import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { SearchResultType } from "../search-result-type.enum";

export class TrackClickDto {
  @IsOptional()
  @IsUUID()
  searchQueryId?: string;

  @IsString()
  @MaxLength(500)
  query: string;

  @IsEnum(SearchResultType)
  resultType: SearchResultType;

  @IsString()
  @MaxLength(255)
  resultId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  resultLabel?: string;

  @IsInt()
  @Min(1)
  @Max(20)
  position: number;
}
