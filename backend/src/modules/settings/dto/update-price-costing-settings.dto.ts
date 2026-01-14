import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsIn,
  MaxLength,
} from 'class-validator';

export class UpdatePriceCostingSettingsDto {
  @ApiProperty({
    description: 'Currency code (e.g., USD, EUR, GBP)',
    example: 'USD',
    maxLength: 10,
  })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  currency?: string;

  @ApiProperty({
    description: 'Costing method for inventory valuation',
    example: 'AVERAGE',
    enum: ['AVERAGE', 'FIFO', 'LIFO', 'STANDARD'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['AVERAGE', 'FIFO', 'LIFO', 'STANDARD'])
  costingMethod?: string;
}
