import {
  IsString,
  IsUUID,
  IsNumber,
  IsOptional,
  IsDateString,
  IsIn,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVendorPaymentDto {
  @ApiProperty({ description: 'Supplier ID', example: 'uuid' })
  @IsUUID()
  supplierId: string;

  @ApiPropertyOptional({ description: 'Purchase Order ID', example: 'uuid' })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiProperty({ description: 'Payment amount', example: 1000.0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: 'Payment date', example: '2025-10-15' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ description: 'Payment method ID', example: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Reference number', example: 'REF-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: 'Payment notes',
    example: 'Payment for invoice #123',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Payment status',
    enum: ['pending', 'completed', 'cancelled', 'refunded'],
    example: 'completed',
    default: 'pending',
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'completed', 'cancelled', 'refunded'])
  status?: string;
}
