import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryPriceListsDto {
  @ApiProperty({ required: false, example: 'RETAIL' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({ required: false, example: true })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiProperty({ required: false, example: false })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isDefault?: boolean;

  @ApiProperty({ required: false, example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
