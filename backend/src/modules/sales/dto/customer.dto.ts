import {
  IsString,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsEnum,
  MaxLength,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { CustomerType } from "../../../database/entities/customer.entity";
import { BaseContactDto } from "../../../common/dto/base-contact.dto";
import { BaseQueryDto } from "../../../common/dto/base-query.dto";

export class CreateCustomerDto extends BaseContactDto {
  @ApiProperty({
    description: "Customer type (individual/business)",
    enum: CustomerType,
    example: CustomerType.BUSINESS,
  })
  @IsEnum(CustomerType)
  type: CustomerType;

  @ApiProperty({
    description: "Customer name or business name",
    maxLength: 200,
    example: "Acme Corporation",
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    description: "Price list ID for this customer",
    example: "uuid-string",
  })
  @IsOptional()
  @IsString()
  priceListId?: string;

  @ApiPropertyOptional({
    description: "Internal notes about the customer",
    example: "VIP customer, requires special handling",
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional({
    description: "Customer name or business name",
    maxLength: 200,
    example: "Acme Corporation Ltd.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    description: "Primary phone number",
    example: "+1234567890",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[\+]?[\d\s\-\(\)]+$/, {
    message:
      "Phone number must contain only digits, spaces, hyphens, parentheses, and an optional plus sign",
  })
  phone?: string;

  @ApiPropertyOptional({
    description: "Email address",
    example: "contact@acme.com",
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: "Billing street address line 1",
    example: "123 Main Street",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  billingStreetAddress?: string;

  @ApiPropertyOptional({
    description: "Billing street address line 2",
    example: "Suite 100",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  billingStreetAddress2?: string;

  @ApiPropertyOptional({
    description: "Billing city",
    example: "New York",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCity?: string;

  @ApiPropertyOptional({
    description: "Billing state or province",
    example: "NY",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingState?: string;

  @ApiPropertyOptional({
    description: "Billing postal or ZIP code",
    example: "10001",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  billingPostalCode?: string;

  @ApiPropertyOptional({
    description: "Billing country",
    example: "United States",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  billingCountry?: string;

  @ApiPropertyOptional({
    description: "Shipping street address line 1",
    example: "456 Warehouse Ave",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  shippingStreetAddress?: string;

  @ApiPropertyOptional({
    description: "Shipping street address line 2",
    example: "Dock B",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  shippingStreetAddress2?: string;

  @ApiPropertyOptional({
    description: "Shipping city",
    example: "Brooklyn",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCity?: string;

  @ApiPropertyOptional({
    description: "Shipping state or province",
    example: "NY",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingState?: string;

  @ApiPropertyOptional({
    description: "Shipping postal or ZIP code",
    example: "11201",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  shippingPostalCode?: string;

  @ApiPropertyOptional({
    description: "Shipping country",
    example: "United States",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCountry?: string;

  @ApiPropertyOptional({
    description: "Whether the customer is active",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: "Price list ID for this customer",
    example: "uuid-string",
  })
  @IsOptional()
  @IsString()
  priceListId?: string;

  @ApiPropertyOptional({
    description: "Internal notes about the customer",
    example: "Customer upgraded to premium tier",
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryCustomersDto extends BaseQueryDto {
  @ApiPropertyOptional({
    description: "Filter by customer type",
    enum: CustomerType,
    example: CustomerType.BUSINESS,
  })
  @IsOptional()
  @IsEnum(CustomerType)
  type?: CustomerType;

  @ApiPropertyOptional({
    description: "Filter by price list ID",
    example: "uuid-string",
  })
  @IsOptional()
  @IsString()
  priceListId?: string;
}

export class CustomerResponseDto {
  @ApiProperty({ example: "uuid-string" })
  id: string;

  @ApiProperty({ example: "acme-corporation" })
  slug: string;

  @ApiProperty({ enum: CustomerType, example: CustomerType.BUSINESS })
  type: CustomerType;

  @ApiProperty({ example: "Acme Corporation" })
  name: string;

  @ApiProperty({ example: "+1234567890", nullable: true })
  phone?: string;

  @ApiProperty({ example: "contact@acme.com", nullable: true })
  email?: string;

  @ApiProperty({ example: "123 Main Street", nullable: true })
  billingStreetAddress?: string;

  @ApiProperty({ example: "Suite 100", nullable: true })
  billingStreetAddress2?: string;

  @ApiProperty({ example: "New York", nullable: true })
  billingCity?: string;

  @ApiProperty({ example: "NY", nullable: true })
  billingState?: string;

  @ApiProperty({ example: "10001", nullable: true })
  billingPostalCode?: string;

  @ApiProperty({ example: "United States", nullable: true })
  billingCountry?: string;

  @ApiProperty({ example: "456 Warehouse Ave", nullable: true })
  shippingStreetAddress?: string;

  @ApiProperty({ example: "Dock B", nullable: true })
  shippingStreetAddress2?: string;

  @ApiProperty({ example: "Brooklyn", nullable: true })
  shippingCity?: string;

  @ApiProperty({ example: "NY", nullable: true })
  shippingState?: string;

  @ApiProperty({ example: "11201", nullable: true })
  shippingPostalCode?: string;

  @ApiProperty({ example: "United States", nullable: true })
  shippingCountry?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: "uuid-string", nullable: true })
  priceListId?: string;

  @ApiProperty({
    example: {
      id: "uuid",
      name: "Retail",
      code: "RETAIL",
      isDefault: true,
      isActive: true,
    },
    nullable: true,
  })
  priceList?: {
    id: string;
    name: string;
    code: string;
    isDefault: boolean;
    isActive: boolean;
  };

  @ApiProperty({ example: 50000.0 })
  totalSales: number;

  @ApiProperty({ example: 25 })
  totalOrders: number;

  @ApiProperty({ example: "2023-12-01T00:00:00Z", nullable: true })
  lastPurchaseDate?: Date;

  @ApiProperty({ example: "2023-01-15T00:00:00Z", nullable: true })
  firstPurchaseDate?: Date;

  @ApiProperty({
    example: "VIP customer, requires special handling",
    nullable: true,
  })
  notes?: string;

  @ApiProperty({ example: "2023-01-01T00:00:00Z" })
  createdAt: Date;

  @ApiProperty({ example: "2023-12-01T00:00:00Z" })
  updatedAt: Date;

  @ApiProperty({ example: "2023-12-15T00:00:00Z", nullable: true })
  deletedAt?: Date;

  // Computed properties
  @ApiProperty({ example: 2000.0 })
  averageOrderValue: number;
}

export class CustomerSummaryDto {
  @ApiProperty({ example: "uuid-string" })
  id: string;

  @ApiProperty({ example: "Acme Corporation" })
  name: string;

  @ApiProperty({ example: "+1234567890", nullable: true })
  phone?: string;
}

/**
 * Embedded customer sub-object used in invoice, payment, and sales-order responses.
 * Uses legacy flat address field names (streetAddress, city…) for backward compatibility
 * with print templates. Populated by mapping billingX entity fields at the service layer.
 */
export class CustomerPrintDto {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}
