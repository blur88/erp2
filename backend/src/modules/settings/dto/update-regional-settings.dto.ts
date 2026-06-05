import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsIn,
  MaxLength,
  IsInt,
  Min,
} from "class-validator";

const DATE_FORMAT_OPTIONS = [
  "DD/MM/YYYY",
  "DD-MM-YYYY",
  "MM/DD/YYYY",
  "MM-DD-YYYY",
  "YYYY-MM-DD",
  "DD MMM YYYY",
  "DD MMMM YYYY",
  "MMM DD, YYYY",
  "MMMM DD, YYYY",
] as const;

export const TIMEZONE_LIST = [
  "UTC",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Bangkok",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
] as const;

export class UpdateRegionalSettingsDto {
  @ApiProperty({
    description: "Currency code (e.g., MYR, USD)",
    example: "MYR",
    maxLength: 10,
  })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  currency?: string;

  @ApiProperty({
    description: "Costing method",
    example: "AVERAGE",
    enum: ["AVERAGE", "FIFO", "LIFO", "STANDARD"],
  })
  @IsString()
  @IsOptional()
  @IsIn(["AVERAGE", "FIFO", "LIFO", "STANDARD"])
  costingMethod?: string;

  @ApiProperty({
    description: "Date display format",
    example: "DD/MM/YYYY",
    enum: DATE_FORMAT_OPTIONS,
  })
  @IsString()
  @IsOptional()
  @IsIn(DATE_FORMAT_OPTIONS)
  dateFormat?: string;

  @ApiProperty({
    description: "Time display format",
    example: "24h",
    enum: ["24h", "12h"],
  })
  @IsString()
  @IsOptional()
  @IsIn(["24h", "12h"])
  timeFormat?: string;

  @ApiProperty({
    description: "Number display format",
    example: "1,234.56",
    enum: ["1,234.56", "1234.56"],
  })
  @IsString()
  @IsOptional()
  @IsIn(["1,234.56", "1234.56"])
  numberFormat?: string;

  @ApiProperty({
    description: "IANA timezone identifier",
    example: "Asia/Kuala_Lumpur",
    enum: TIMEZONE_LIST,
  })
  @IsString()
  @IsOptional()
  @IsIn(TIMEZONE_LIST)
  timezone?: string;

  @ApiProperty({ description: "Low stock threshold quantity", example: 10 })
  @IsInt()
  @IsOptional()
  @Min(0)
  lowStockThreshold?: number;

  @ApiProperty({
    description: "Start of week: 0 = Sunday, 1 = Monday",
    example: 1,
    enum: [0, 1],
  })
  @IsInt()
  @IsOptional()
  @IsIn([0, 1])
  startOfWeek?: number;
}
