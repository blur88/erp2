import { IsString, IsEnum, IsOptional, IsUUID, IsNumberString, IsDateString } from 'class-validator';
import { AccountType } from '../entities/account-type.enum';

export class CreateAccountDto {
  @IsString() name: string;
  @IsString() code: string;
  @IsEnum(AccountType) type: AccountType;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsNumberString() openingBalance?: string;
  // As-of date (YYYY-MM-DD) for the opening-balance journal entry. Defaults to today.
  @IsOptional() @IsDateString() openingBalanceDate?: string;
  @IsOptional() @IsString() description?: string;
}
