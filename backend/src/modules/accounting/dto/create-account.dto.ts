import { IsString, IsEnum, IsOptional, IsUUID, IsNumberString } from 'class-validator';
import { AccountType } from '../entities/account-type.enum';

export class CreateAccountDto {
  @IsString() name: string;
  @IsString() code: string;
  @IsEnum(AccountType) type: AccountType;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsNumberString() openingBalance?: string;
  @IsOptional() @IsString() description?: string;
}
