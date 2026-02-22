import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

const DATE_FORMAT_OPTIONS = [
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'MM/DD/YYYY',
  'MM-DD-YYYY',
  'YYYY-MM-DD',
  'DD MMM YYYY',
  'DD MMMM YYYY',
  'MMM DD, YYYY',
  'MMMM DD, YYYY',
] as const;

export class UpdatePriceCostingSettingsDto {
  @ApiProperty({ description: 'Currency code (e.g., MYR, USD)', example: 'MYR', maxLength: 10 })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  currency?: string;

  @ApiProperty({ description: 'Costing method', example: 'AVERAGE', enum: ['AVERAGE', 'FIFO', 'LIFO', 'STANDARD'] })
  @IsString()
  @IsOptional()
  @IsIn(['AVERAGE', 'FIFO', 'LIFO', 'STANDARD'])
  costingMethod?: string;

  @ApiProperty({
    description: 'Date display format',
    example: 'DD/MM/YYYY',
    enum: DATE_FORMAT_OPTIONS,
  })
  @IsString()
  @IsOptional()
  @IsIn(DATE_FORMAT_OPTIONS)
  dateFormat?: string;

  @ApiProperty({ description: 'Time display format', example: '24h', enum: ['24h', '12h'] })
  @IsString()
  @IsOptional()
  @IsIn(['24h', '12h'])
  timeFormat?: string;

  @ApiProperty({ description: 'Number display format', example: '1,234.56', enum: ['1,234.56', '1234.56'] })
  @IsString()
  @IsOptional()
  @IsIn(['1,234.56', '1234.56'])
  numberFormat?: string;
}
