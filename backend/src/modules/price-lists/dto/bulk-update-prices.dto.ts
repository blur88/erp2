import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsString,
  IsNumber,
  ValidateNested,
  IsOptional,
  IsEnum,
} from "class-validator";
import { Type } from "class-transformer";

export class PriceUpdateItem {
  @ApiProperty({ example: "123e4567-e89b-12d3-a456-426614174000" })
  @IsString()
  productId: string;

  @ApiProperty({ example: 100.0 })
  @IsNumber()
  price: number;

  @ApiProperty({ example: 80.0, required: false })
  @IsNumber()
  @IsOptional()
  costBasis?: number;

  @ApiProperty({ example: 20.0, required: false })
  @IsNumber()
  @IsOptional()
  margin?: number;
}

export class BulkUpdatePricesDto {
  @ApiProperty({ type: [PriceUpdateItem] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceUpdateItem)
  items: PriceUpdateItem[];
}

export class ApplyPercentageAdjustmentDto {
  @ApiProperty({
    example: 10,
    description: "Percentage adjustment (positive or negative)",
  })
  @IsNumber()
  percentage: number;

  @ApiProperty({
    example: "increase",
    enum: ["increase", "decrease"],
    required: false,
  })
  @IsEnum(["increase", "decrease"])
  @IsOptional()
  type?: string;

  @ApiProperty({
    example: true,
    description: "Round to nearest whole number",
    required: false,
  })
  @IsOptional()
  roundToWhole?: boolean;
}
