import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
