import { Type } from 'class-transformer';
import { IsDefined, IsEnum, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.validator';
import { AccountingSourceType } from '../entities/source-type.enum';

/**
 * General Ledger is a REPORT endpoint, not a list endpoint: it accepts no
 * sort parameters because the running balance is only meaningful in the
 * service's canonical chronological order.
 *
 * `page` and `limit` are all-or-nothing. Defaulting one from the other would
 * silently change the meaning of the request (see spec Section 1), so exactly
 * one present is a 400. Both omitted returns the full set.
 */
export class GeneralLedgerQueryDto {
  @IsUUID()
  accountId: string;

  @IsOptional() @IsCalendarDate()
  fromDate?: string;

  @IsOptional() @IsCalendarDate()
  toDate?: string;

  @IsOptional() @IsEnum(AccountingSourceType)
  sourceType?: AccountingSourceType;

  @ValidateIf((o: GeneralLedgerQueryDto) => o.limit !== undefined || o.page !== undefined)
  @IsDefined({ message: 'page is required when limit is provided' })
  @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @ValidateIf((o: GeneralLedgerQueryDto) => o.page !== undefined || o.limit !== undefined)
  @IsDefined({ message: 'limit is required when page is provided' })
  @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}