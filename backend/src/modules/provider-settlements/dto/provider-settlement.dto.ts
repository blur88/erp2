import {
  IsArray, ArrayMinSize, ArrayUnique, ArrayMaxSize, IsUUID, IsString, IsOptional, IsDecimal,
  IsEnum, IsIn, IsInt, Min, MaxLength, Matches, ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.validator';
import { IsMoneyAtLeast } from '../../../common/validators/is-money-at-least.validator';
import { ProviderSettlementStatus } from '../entities/provider-settlement.entity';

export class SettlementRowDto {
  @ApiProperty() @IsUUID() salesOrderId: string;
  @ApiProperty() @IsUUID() paymentMethodId: string;
  // Signed (a deduction is negative), at most 2 dp. The response is scale 4;
  // the client normalizes "70.0000" → "70.00" lexically and never rounds, so a
  // genuine sub-cent value is rejected here rather than quantized (spec §4.3).
  @ApiProperty({ example: '70.00' })
  @Matches(/^-?\d+(\.\d{1,2})?$/, { message: 'expectedNetAmount must have at most 2 decimal places' })
  expectedNetAmount: string;
}

export class CreateProviderSettlementDto {
  @ApiProperty()
  @IsUUID()
  bankAccountId: string;

  @ApiProperty({ example: '2026-09-20' })
  @IsCalendarDate()
  settlementDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200) // matches the column width; a longer value would be a 500
  providerReference?: string;

  // decimal_digits '0,2' REJECTS sub-cent input rather than quantizing it.
  // Silently rounding 98.001 into equality with 98.00 would post an amount the
  // user never entered.
  // @IsDecimal alone accepts '0.00' and '-98.00'. A settlement is a deposit
  // RECEIVED, so the total is strictly positive; CHK_ps_amount_positive would
  // otherwise reject it at the database as a 500 instead of a 400.
  @ApiProperty({ example: '98.00' })
  @IsDecimal({ decimal_digits: '0,2' })
  @IsMoneyAtLeast('0.0100')
  settlementAmount: string;

  // The COMPLETE desired selection of Sales Order + Payment Method groups,
  // never a delta. The payment method is INFERRED from these rows.
  @ApiProperty({ type: [SettlementRowDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one row' })
  // Objects compare by identity without a selector, so key on the group.
  @ArrayUnique((r: SettlementRowDto) => `${r?.salesOrderId}:${r?.paymentMethodId}`, {
    message: 'Each Sales Order + Payment Method may appear only once',
  })
  @ValidateNested({ each: true })
  @Type(() => SettlementRowDto)
  rows: SettlementRowDto[];
}

export class UpdateProviderSettlementDto extends PartialType(
  // OmitType FIRST, then PartialType — see the history of this class: an
  // inherited @IsOptional would short-circuit a redeclared required array.
  OmitType(CreateProviderSettlementDto, ['rows'] as const),
) {
  @ApiProperty({ type: [SettlementRowDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one row' })
  @ArrayUnique((r: SettlementRowDto) => `${r?.salesOrderId}:${r?.paymentMethodId}`, {
    message: 'Each Sales Order + Payment Method may appear only once',
  })
  @ValidateNested({ each: true })
  @Type(() => SettlementRowDto)
  rows: SettlementRowDto[];
}

export class ListProviderSettlementsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsCalendarDate() startDate?: string;
  @IsOptional() @IsCalendarDate() endDate?: string;
  @IsOptional() @IsUUID() providerPaymentMethodId?: string;
  @IsOptional() @IsEnum(ProviderSettlementStatus) status?: ProviderSettlementStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

/** Comma-separated on the wire: Express's simple query parser does not build arrays from `a[]=`. */
const splitCsv = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value;

export class EligibleRowsQueryDto {
  @IsCalendarDate() settlementDate: string;
  @IsOptional() @IsUUID() settlementId?: string;
  @IsOptional() @IsString() search?: string;
  // `claimed` requires settlementId — enforced in the service (400).
  @IsOptional() @IsIn(['claimed']) scope?: 'claimed';
  @IsOptional() @Transform(splitCsv) @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true })
  salesOrderIds?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
