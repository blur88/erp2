import {
  IsString,
  IsUUID,
  IsNumber,
  IsOptional,
  IsDateString,
  IsIn,
  Min,
  MaxLength,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateVendorPaymentDto {
  @ApiProperty({ description: "Supplier ID", example: "uuid" })
  @IsUUID()
  supplierId: string;

  @ApiPropertyOptional({ description: "Purchase Order ID", example: "uuid" })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiPropertyOptional({
    description: "Goods Received Note ID",
    example: "uuid",
  })
  @IsOptional()
  @IsUUID()
  grnId?: string;

  @ApiProperty({ description: "Payment amount", example: 1000.0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: "Payment date", example: "2025-10-15" })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ description: "Payment method ID", example: "uuid" })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: "Reference number", example: "REF-001" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: "Payment notes",
    example: "Payment for invoice #123",
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: "Payment status",
    enum: ["pending", "completed", "cancelled"],
    example: "completed",
    default: "pending",
  })
  @IsOptional()
  @IsString()
  @IsIn(["pending", "completed", "cancelled"])
  status?: string;
}

export class UpdateVendorPaymentDto {
  @ApiPropertyOptional({ description: "Supplier ID", example: "uuid" })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: "Purchase Order ID", example: "uuid" })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiPropertyOptional({
    description: "Goods Received Note ID",
    example: "uuid",
  })
  @IsOptional()
  @IsUUID()
  grnId?: string;

  @ApiPropertyOptional({ description: "Payment amount", example: 1000.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: "Payment date", example: "2025-10-15" })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional({ description: "Payment method ID", example: "uuid" })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: "Reference number", example: "REF-001" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: "Payment notes",
    example: "Payment for invoice #123",
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: "Payment status",
    enum: ["pending", "completed", "cancelled"],
    example: "completed",
  })
  @IsOptional()
  @IsString()
  @IsIn(["pending", "completed", "cancelled"])
  status?: string;
}

export class QueryVendorPaymentsDto {
  @ApiPropertyOptional({ description: "Supplier ID filter", example: "uuid" })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({
    description: "Payment status filter",
    example: "completed",
  })
  @IsOptional()
  @IsString()
  @IsIn(["pending", "completed", "cancelled"])
  status?: string;

  @ApiPropertyOptional({
    description: "Payment method ID filter",
    example: "uuid",
  })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional({
    description: "Start date filter",
    example: "2025-10-01",
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: "End date filter",
    example: "2025-10-31",
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Page number", example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : 1))
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: "Items per page",
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Transform(({ value }) => (value ? parseInt(value, 10) : 20))
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    description: "Sort by field",
    example: "paymentNumber",
    default: "paymentDate",
  })
  @IsOptional()
  @IsString()
  @IsIn(["paymentNumber", "paymentDate", "amount"])
  sortBy?: string;

  @ApiPropertyOptional({
    description: "Sort order",
    example: "asc",
    default: "desc",
  })
  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsString()
  @IsIn(["ASC", "DESC"])
  sortOrder?: "ASC" | "DESC";

  @ApiPropertyOptional({ description: "Search query", example: "VP-000001" })
  @IsOptional()
  @IsString()
  search?: string;
}
