import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class DateRangeQueryDto {
  @IsOptional()
  @IsString()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  @IsDateString()
  toDate?: string;
}

export class AsOfDateQueryDto {
  @IsOptional()
  @IsString()
  @IsDateString()
  asOfDate?: string;
}

export class PaymentStatisticsQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;
}
