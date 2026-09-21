import {
  IsArray, ArrayMinSize, ArrayUnique, IsUUID, IsString, IsOptional, IsDecimal,
  IsEnum, IsInt, Min, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.validator';
import { IsMoneyAtLeast } from '../../../common/validators/is-money-at-least.validator';
import { ProviderSettlementStatus } from '../entities/provider-settlement.entity';

export class CreateProviderSettlementDto {
  @ApiProperty()
  @IsUUID()
  providerPaymentMethodId: string;

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

  // The COMPLETE desired selection, never an add/remove delta.
  // ArrayMinSize(1) because clearingAccountId is derived FROM these rows and is
  // NOT NULL from draft creation — an empty draft has nothing to derive from.
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one payment' })
  @ArrayUnique() // a repeated id would violate the partial unique index as a 500
  @IsUUID('4', { each: true })
  paymentIds: string[];
}

export class UpdateProviderSettlementDto extends PartialType(
  // OmitType FIRST, then PartialType. PartialType(Create) alone would inherit
  // @IsOptional on paymentIds; redeclaring it here would add a second set of
  // validators but the inherited @IsOptional still short-circuits them. Omitting
  // it from the base before making the rest optional leaves paymentIds
  // unconditionally required while every OTHER field stays optional.
  OmitType(CreateProviderSettlementDto, ['paymentIds'] as const),
) {
  // REQUIRED on update. PATCH is defined as full replacement of the selection,
  // so an absent array is ambiguous — it would read as either "keep what is
  // there" or "clear it", and the two differ by a whole settlement. Making it
  // required removes the ambiguity at the edge.
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one payment' })
  @ArrayUnique()
  @IsUUID('4', { each: true })
  paymentIds: string[];
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

export class EligiblePaymentsQueryDto {
  @IsUUID() providerPaymentMethodId: string;
  @IsCalendarDate() settlementDate: string;
  @IsOptional() @IsUUID() settlementId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
