import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../../common/validators/is-calendar-date.validator';
import { AccountingSourceType } from '../entities/source-type.enum';

export class ListJournalEntriesDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsEnum(AccountingSourceType)
  sourceType?: AccountingSourceType;

  @IsOptional() @IsIn(['Posted', 'Reversed'])
  status?: 'Posted' | 'Reversed';

  @IsOptional() @IsCalendarDate()
  fromDate?: string;

  @IsOptional() @IsCalendarDate()
  toDate?: string;

  @IsOptional() @IsIn(['journalNo'])
  sortBy?: 'journalNo';

  @IsOptional() @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
