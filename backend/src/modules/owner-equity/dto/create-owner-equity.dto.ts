import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsArray,
  MaxLength,
  ValidateNested,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  OwnerEquityType,
  OwnerEquityDocumentStatus,
  OwnerEquitySettlementStatus,
} from "../entities/owner-equity-document.entity";
import { IsCalendarDate } from "../../../common/validators/is-calendar-date.validator";
import { IsMoneyAtLeast } from "../../../common/validators/is-money-at-least.validator";

export class CreateOwnerEquityDto {
  @ApiProperty({
    enum: OwnerEquityType,
    description: "Transaction type; immutable after creation",
  })
  @IsEnum(OwnerEquityType)
  type: OwnerEquityType;

  @ApiProperty({ description: "Equity date", example: "2026-08-16" })
  @IsCalendarDate()
  equityDate: string;

  @ApiProperty({ description: "Description" })
  @IsString()
  @MaxLength(500)
  description: string;

  @ApiPropertyOptional({ description: "Notes" })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: "Monetary types only: total amount" })
  @ValidateIf((o) => o.type !== OwnerEquityType.STOCK_DRAWING)
  @IsMoneyAtLeast("0.0000")
  totalAmount?: string;

  @ApiPropertyOptional({ description: "Stock drawing only: product ID" })
  @ValidateIf((o) => o.type === OwnerEquityType.STOCK_DRAWING)
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: "Stock drawing only: quantity" })
  @ValidateIf((o) => o.type === OwnerEquityType.STOCK_DRAWING)
  @IsMoneyAtLeast("0.0000")
  quantity?: string;
}

export class UpdateOwnerEquityDto {
  @ApiPropertyOptional({ description: "Equity date", example: "2026-08-16" })
  @IsOptional()
  @IsCalendarDate()
  equityDate?: string;

  @ApiPropertyOptional({ description: "Description" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: "Notes" })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: "Monetary types only: total amount" })
  @IsOptional()
  @IsMoneyAtLeast("0.0000")
  totalAmount?: string;

  @ApiPropertyOptional({ description: "Stock drawing only: product ID" })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: "Stock drawing only: quantity" })
  @IsOptional()
  @IsMoneyAtLeast("0.0000")
  quantity?: string;
}

export class SettleOwnerEquityLineDto {
  @ApiProperty({
    description: "Payment method ID; channel derived from the method",
  })
  @IsUUID()
  paymentMethodId: string;

  @ApiProperty({ description: "Settlement amount", example: "1000.0000" })
  @IsMoneyAtLeast("0.0000")
  amount: string;

  @ApiProperty({ description: "Settlement date", example: "2026-08-16" })
  @IsCalendarDate()
  settlementDate: string;

  @ApiPropertyOptional({ description: "Reference" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

export class SettleOwnerEquityDto {
  @ApiProperty({ type: [SettleOwnerEquityLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettleOwnerEquityLineDto)
  settlements: SettleOwnerEquityLineDto[];
}

export class RefundOwnerEquityLineDto {
  @ApiProperty({ description: "Source settlement row this refund offsets" })
  @IsUUID()
  sourceSettlementId: string;

  @ApiProperty({ description: "Refund amount", example: "100.0000" })
  @IsMoneyAtLeast("0.0000")
  amount: string;

  @ApiProperty({ description: "Refund date", example: "2026-08-16" })
  @IsCalendarDate()
  refundDate: string;

  @ApiPropertyOptional({ description: "Reference" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

export class RefundOwnerEquityDto {
  @ApiProperty({ type: [RefundOwnerEquityLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RefundOwnerEquityLineDto)
  refunds: RefundOwnerEquityLineDto[];
}

export interface ListOwnerEquityParams {
  page?: number;
  limit?: number;
  search?: string;
  fromDate?: string;
  toDate?: string;
  type?: OwnerEquityType;
  documentStatus?: OwnerEquityDocumentStatus;
  settlementStatus?: OwnerEquitySettlementStatus;
  sortBy?: "referenceNumber" | "equityDate" | "totalAmount";
  sortOrder?: "ASC" | "DESC";
}
