import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsArray,
  IsNumber,
  Min,
  Max,
  IsEnum,
} from "class-validator";
import { Type } from "class-transformer";
import { SettlementStatus } from "../../../database/entities/settlement.entity";

export class CreateSettlementDto {
  @ApiProperty({ description: "Payment method ID" })
  @IsUUID()
  paymentMethodId: string;

  @ApiProperty({ description: "Settlement date (YYYY-MM-DD)" })
  @IsDateString()
  settlementDate: string;

  @ApiProperty({
    description: "Payment IDs to include in settlement",
    type: [String],
  })
  @IsArray()
  @IsUUID("4", { each: true })
  paymentIds: string[];

  @ApiPropertyOptional({ description: "Bank reference number" })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: "Notes" })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSettlementDto {
  @ApiPropertyOptional({ description: "Settlement date (YYYY-MM-DD)" })
  @IsOptional()
  @IsDateString()
  settlementDate?: string;

  @ApiPropertyOptional({ description: "Bank reference number" })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: "Notes" })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QuerySettlementsDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: "Filter by payment method ID" })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;

  @ApiPropertyOptional({
    description: "Filter by status",
    enum: SettlementStatus,
  })
  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;

  @ApiPropertyOptional({
    description: "Sort field",
    enum: ["settlementDate", "createdAt", "totalAmount"],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: "Sort order", enum: ["ASC", "DESC"] })
  @IsOptional()
  @IsString()
  sortOrder?: "ASC" | "DESC";
}

export class SettlementResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() settlementNumber: string;
  @ApiProperty() paymentMethodId: string;
  @ApiPropertyOptional() paymentMethod?: {
    id: string;
    code: string;
    name: string;
  };
  @ApiProperty() settlementDate: Date;
  @ApiProperty() totalAmount: number;
  @ApiPropertyOptional() reference?: string;
  @ApiPropertyOptional() notes?: string;
  @ApiProperty() status: SettlementStatus;
  @ApiProperty() paymentCount: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiPropertyOptional() deletedAt?: Date | null;
}

export class SettlementListResponseDto {
  @ApiProperty({ type: [SettlementResponseDto] })
  data: SettlementResponseDto[];

  @ApiProperty()
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class PendingPaymentsSummaryDto {
  @ApiProperty() paymentMethodId: string;
  @ApiProperty() paymentMethodCode: string;
  @ApiProperty() paymentMethodName: string;
  @ApiProperty() pendingCount: number;
  @ApiProperty() pendingAmount: number;
}
