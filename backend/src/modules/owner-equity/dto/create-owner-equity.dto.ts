import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  IsInt,
  Min,
  Max,
  IsIn,
  MaxLength,
  IsNotEmpty,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OwnerEquityType,
  OwnerEquityDocumentStatus,
  OwnerEquitySettlementStatus,
} from '../entities/owner-equity-document.entity';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.validator';
import { IsMoneyAtLeast } from '../../../common/validators/is-money-at-least.validator';

export class CreateOwnerEquityDto {
  @ApiProperty({
    enum: OwnerEquityType,
    description: 'Transaction type; immutable after creation',
  })
  @IsEnum(OwnerEquityType)
  type: OwnerEquityType;

  @ApiProperty({ description: 'Equity date', example: '2026-08-16' })
  @IsCalendarDate()
  equityDate: string;

  @ApiProperty({ description: 'Description' })
  // Trim before validating so a whitespace-only description fails IsNotEmpty
  // rather than persisting as blank.
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Description is required' })
  @MaxLength(500)
  description: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Monetary types only: total amount' })
  @ValidateIf((o) => o.type !== OwnerEquityType.STOCK_DRAWING)
  @IsMoneyAtLeast('0.0000')
  totalAmount?: string;

  @ApiPropertyOptional({ description: 'Stock drawing only: product ID' })
  @ValidateIf((o) => o.type === OwnerEquityType.STOCK_DRAWING)
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Stock drawing only: quantity' })
  @ValidateIf((o) => o.type === OwnerEquityType.STOCK_DRAWING)
  @IsMoneyAtLeast('0.0000')
  quantity?: string;
}

export class UpdateOwnerEquityDto {
  @ApiPropertyOptional({ description: 'Equity date', example: '2026-08-16' })
  @IsOptional()
  @IsCalendarDate()
  equityDate?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Description cannot be blank' })
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Monetary types only: total amount' })
  @IsOptional()
  @IsMoneyAtLeast('0.0000')
  totalAmount?: string;

  @ApiPropertyOptional({ description: 'Stock drawing only: product ID' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Stock drawing only: quantity' })
  @IsOptional()
  @IsMoneyAtLeast('0.0000')
  quantity?: string;
}

export class SettleOwnerEquityLineDto {
  @ApiProperty({
    description: 'Payment method ID; channel derived from the method',
  })
  @IsUUID()
  paymentMethodId: string;

  @ApiProperty({ description: 'Settlement amount', example: '1000.0000' })
  @IsMoneyAtLeast('0.0000')
  amount: string;

  @ApiProperty({ description: 'Settlement date', example: '2026-08-16' })
  @IsCalendarDate()
  settlementDate: string;

  @ApiPropertyOptional({ description: 'Reference' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

export class SettleOwnerEquityDto {
  @ApiProperty({ type: [SettleOwnerEquityLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettleOwnerEquityLineDto)
  settlements: SettleOwnerEquityLineDto[];
}

export class RefundOwnerEquityLineDto {
  @ApiProperty({ description: 'Active payment method this refund is paid through' })
  @IsUUID()
  paymentMethodId: string;

  @ApiProperty({ description: 'Refund amount', example: '100.0000' })
  @IsMoneyAtLeast('0.0000')
  amount: string;

  @ApiProperty({ description: 'Refund date', example: '2026-08-16' })
  @IsCalendarDate()
  refundDate: string;

  @ApiPropertyOptional({ description: 'Reference' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

export class RefundOwnerEquityDto {
  @ApiProperty({ type: [RefundOwnerEquityLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RefundOwnerEquityLineDto)
  refunds: RefundOwnerEquityLineDto[];
}

export interface ListOwnerEquityParams {
  page?: number;
  limit?: number;
  search?: string;
  fromDate?: string;
  toDate?: string;
  type?: OwnerEquityType;
  documentStatus?: OwnerEquityDocumentStatus;
  settlementStatus?: OwnerEquitySettlementStatus;
  sortBy?: 'referenceNumber' | 'equityDate' | 'totalAmount';
  sortOrder?: 'ASC' | 'DESC';
}

export class ListOwnerEquityQueryDto implements ListOwnerEquityParams {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Search by reference number or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'From equity date', example: '2026-01-01' })
  @IsOptional()
  @IsCalendarDate()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'To equity date', example: '2026-12-31' })
  @IsOptional()
  @IsCalendarDate()
  toDate?: string;

  @ApiPropertyOptional({ enum: OwnerEquityType })
  @IsOptional()
  @IsEnum(OwnerEquityType)
  type?: OwnerEquityType;

  @ApiPropertyOptional({ enum: OwnerEquityDocumentStatus })
  @IsOptional()
  @IsEnum(OwnerEquityDocumentStatus)
  documentStatus?: OwnerEquityDocumentStatus;

  @ApiPropertyOptional({ enum: OwnerEquitySettlementStatus })
  @IsOptional()
  @IsEnum(OwnerEquitySettlementStatus)
  settlementStatus?: OwnerEquitySettlementStatus;

  @ApiPropertyOptional({ enum: ['referenceNumber', 'equityDate', 'totalAmount'] })
  @IsOptional()
  @IsIn(['referenceNumber', 'equityDate', 'totalAmount'])
  sortBy?: 'referenceNumber' | 'equityDate' | 'totalAmount';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
