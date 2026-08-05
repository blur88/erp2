import {
  IsString,
  IsUUID,
  IsOptional,
  IsDateString,
  IsIn,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMoneyAtLeast } from '../../../common/validators/is-money-at-least.validator';

export class CreateVendorPaymentDto {
  @ApiProperty({ description: 'Supplier ID', example: 'uuid' })
  @IsUUID()
  supplierId: string;

  @ApiPropertyOptional({ description: 'Purchase Order ID', example: 'uuid' })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiProperty({ description: 'Payment amount', example: '1000.00' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amount must be a positive decimal string with at most 4 decimal places',
  })
  @IsMoneyAtLeast('0.0000')
  amount: string;

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
