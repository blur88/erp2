import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class PriceCostingSettingsResponseDto {
  @ApiProperty({ description: 'Settings ID' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Currency code', example: 'USD' })
  @Expose()
  currency: string;

  @ApiProperty({
    description: 'Costing method',
    example: 'AVERAGE',
    enum: ['AVERAGE', 'FIFO', 'LIFO', 'STANDARD'],
  })
  @Expose()
  costingMethod: string;

  @ApiProperty({
    description: 'Customer pricing schemes - array of custom pricing names with their currencies',
    example: [
      { name: 'Retail', currency: 'USD' },
      { name: 'Wholesale', currency: 'USD' },
      { name: 'Special Price', currency: 'EUR' },
    ],
  })
  @Expose()
  customerPricingSchemes: Array<{ name: string; currency: string }>;

  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({ description: 'Active status' })
  @Expose()
  isActive: boolean;
}
