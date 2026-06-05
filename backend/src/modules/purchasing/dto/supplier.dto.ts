// @ts-nocheck
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsDecimal,
  IsInt,
  MaxLength,
  MinLength,
  Min,
  IsDateString,
  IsUUID,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { SupplierType } from "../../../database/entities/supplier.entity";
import { BaseContactDto } from "../../../common/dto/base-contact.dto";
import { BaseQueryDto } from "../../../common/dto/base-query.dto";

export class CreateSupplierDto extends BaseContactDto {
  @ApiProperty({ description: "Supplier type", enum: SupplierType })
  @IsEnum(SupplierType)
  type!: SupplierType;

  @ApiProperty({ description: "Company name", maxLength: 200 })
  @IsString()
  @MaxLength(200)
  @MinLength(2)
  companyName!: string;

  @ApiPropertyOptional({ description: "Contact person name", maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactPerson?: string;

  @ApiPropertyOptional({ description: "Internal notes" })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @ApiPropertyOptional({
    description: "Whether supplier is active",
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SupplierQueryDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: "Filter by type", enum: SupplierType })
  @IsOptional()
  @IsEnum(SupplierType)
  type?: SupplierType;
}

export class SupplierResponseDto {
  @ApiProperty({ description: "Supplier ID" })
  id!: string;

  @ApiProperty({ example: "acme-supplies" })
  slug!: string;

  @ApiProperty({ description: "Supplier type" })
  type!: SupplierType;

  @ApiProperty({ description: "Company name" })
  companyName!: string;

  @ApiProperty({ description: "Whether the supplier is active" })
  isActive!: boolean;

  @ApiProperty({ description: "Contact person name" })
  contactPerson?: string;

  @ApiProperty({ description: "Primary phone number" })
  phone?: string;

  @ApiPropertyOptional({ description: "Email address" })
  email?: string;

  @ApiPropertyOptional({ description: "Billing street address line 1" })
  billingStreetAddress?: string;

  @ApiPropertyOptional({ description: "Billing street address line 2" })
  billingStreetAddress2?: string;

  @ApiPropertyOptional({ description: "Billing city" })
  billingCity?: string;

  @ApiPropertyOptional({ description: "Billing state/province" })
  billingState?: string;

  @ApiPropertyOptional({ description: "Billing postal/ZIP code" })
  billingPostalCode?: string;

  @ApiPropertyOptional({ description: "Billing country" })
  billingCountry?: string;

  @ApiPropertyOptional({ description: "Shipping street address line 1" })
  shippingStreetAddress?: string;

  @ApiPropertyOptional({ description: "Shipping street address line 2" })
  shippingStreetAddress2?: string;

  @ApiPropertyOptional({ description: "Shipping city" })
  shippingCity?: string;

  @ApiPropertyOptional({ description: "Shipping state/province" })
  shippingState?: string;

  @ApiPropertyOptional({ description: "Shipping postal/ZIP code" })
  shippingPostalCode?: string;

  @ApiPropertyOptional({ description: "Shipping country" })
  shippingCountry?: string;

  @ApiProperty({ description: "Total purchases amount" })
  totalPurchases!: number;

  @ApiProperty({ description: "Total number of orders" })
  totalOrders!: number;

  @ApiProperty({ description: "Average order value" })
  averageOrderValue!: number;

  @ApiProperty({ description: "Last purchase date" })
  lastPurchaseDate?: Date;

  @ApiProperty({ description: "First purchase date" })
  firstPurchaseDate?: Date;

  @ApiProperty({ description: "Internal notes" })
  notes?: string;

  @ApiProperty({ description: "Created date" })
  createdAt!: Date;

  @ApiProperty({ description: "Updated date" })
  updatedAt!: Date;

  @ApiProperty({ description: "Deleted date (for soft-deleted suppliers)" })
  deletedAt?: Date;
}

class UpdateSupplierBalanceDto {
  @ApiProperty({ description: "Amount to add or subtract" })
  @IsDecimal({ decimal_digits: "0,4" })
  @Min(0)
  @Transform(({ value }) => parseFloat(value))
  amount!: number;

  @ApiProperty({
    description: "Balance operation type",
    enum: ["increase", "decrease"],
  })
  @IsEnum(["increase", "decrease"])
  type!: "increase" | "decrease";

  @ApiPropertyOptional({
    description: "Reference or notes for the balance change",
  })
  @IsOptional()
  @IsString()
  reference?: string;
}

export class SupplierListResponseDto {
  @ApiProperty({
    description: "List of suppliers",
    type: [SupplierResponseDto],
  })
  data!: SupplierResponseDto[];

  @ApiProperty({ description: "Pagination metadata" })
  meta!: { total: number; page?: number; limit?: number };
}

class SupplierAnalyticsDto {
  @ApiPropertyOptional({ description: "Start date for analytics" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "End date for analytics" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: "Supplier IDs to include",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  supplierIds?: string[];

  @ApiPropertyOptional({ description: "Include performance metrics" })
  @IsOptional()
  @Transform(({ value }) => value === "true")
  @IsBoolean()
  includePerformance?: boolean;

  @ApiPropertyOptional({ description: "Include spending analysis" })
  @IsOptional()
  @Transform(({ value }) => value === "true")
  @IsBoolean()
  includeSpending?: boolean;
}
