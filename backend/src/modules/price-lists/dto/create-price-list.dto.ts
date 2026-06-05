import { ApiProperty } from "@nestjs/swagger";
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsDateString,
  IsEnum,
  MaxLength,
} from "class-validator";

export class CreatePriceListDto {
  @ApiProperty({
    example: "RETAIL",
    description: "Unique code for the price list",
  })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({
    example: "Retail Price List",
    description: "Name of the price list",
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: "Standard retail pricing for walk-in customers",
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: "standard",
    enum: ["standard", "promotional", "special"],
    description: "Type of price list",
  })
  @IsEnum(["standard", "promotional", "special"])
  @IsOptional()
  type?: string;

  @ApiProperty({
    example: false,
    description: "Whether this is the default price list",
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiProperty({
    example: true,
    description: "Whether the price list is active",
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ example: "2026-01-01T00:00:00Z", required: false })
  @IsDateString()
  @IsOptional()
  effectiveFrom?: Date;

  @ApiProperty({ example: "2026-12-31T23:59:59Z", required: false })
  @IsDateString()
  @IsOptional()
  effectiveTo?: Date;
}
